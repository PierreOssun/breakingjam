//! Unit tests of `crate::domain::battle`.

use chrono::{NaiveDate, Utc};
use uuid::Uuid;
use validator::Validate;

use crate::domain::battle::*;

fn battle_fields(format: BattleFormat, team_size: Option<i16>, age: BattleAge) -> BattleFields {
    BattleFields {
        name: None,
        format,
        team_size,
        gender: BattleGender::Mixed,
        age,
        age_min: match age {
            BattleAge::Kids => Some(8),
            BattleAge::Adult => Some(18),
            BattleAge::Na => None,
        },
        age_max: (age == BattleAge::Kids).then_some(17),
        bracket_size: None,
        max_entries: None,
        prize_currency: None,
        prize_first: None,
        prize_second: None,
        prize_third: None,
        starts_at: None,
    }
}

fn battle(format: BattleFormat, team_size: Option<i16>) -> Battle {
    Battle {
        id: Uuid::now_v7(),
        event_id: Uuid::now_v7(),
        name: String::new(),
        format,
        team_size,
        gender: BattleGender::Mixed,
        age: BattleAge::Adult,
        age_min: Some(18),
        age_max: None,
        bracket_size: None,
        max_entries: None,
        prize_currency: None,
        prize_first: None,
        prize_second: None,
        prize_third: None,
        position: 0,
        starts_at: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}

fn entry(dancers: usize, status: EntryStatus) -> EntryFields {
    EntryFields {
        team_name: None,
        crew_id: None,
        dancer_ids: (0..dancers).map(|_| Uuid::now_v7()).collect(),
        status,
        reached: BracketStage::Na,
        final_rank: None,
        video_url: None,
        video_offset_seconds: None,
    }
}

#[test]
fn categories_come_from_the_structured_fields() {
    let mut b = battle(BattleFormat::Team, Some(1));
    assert_eq!(b.categories(), [Category::OneVOne]);
    b.team_size = Some(2);
    assert_eq!(b.categories(), [Category::TwoVTwo]);
    b.team_size = Some(5);
    b.gender = BattleGender::Bgirl;
    b.age = BattleAge::Kids;
    assert_eq!(
        b.categories(),
        [Category::Crew, Category::Bgirl, Category::Kids]
    );
    let smoke = battle(BattleFormat::SevenToSmoke, None);
    assert_eq!(smoke.categories(), [Category::SevenToSmoke]);
    assert!(battle(BattleFormat::Na, None).categories().is_empty());
    // A showcase is no battle category, whatever its size.
    assert!(
        battle(BattleFormat::Showcase, Some(5))
            .categories()
            .is_empty()
    );
}

#[test]
fn default_names_follow_the_examples() {
    let mut fields = battle_fields(BattleFormat::Team, Some(1), BattleAge::Adult);
    fields.gender = BattleGender::Bboy;
    assert_eq!(fields.display_name(), "1v1 Bboy");
    let kids = battle_fields(BattleFormat::Team, Some(2), BattleAge::Kids);
    assert_eq!(kids.display_name(), "2v2 Mixed Kids");
    let mut smoke = battle_fields(BattleFormat::SevenToSmoke, None, BattleAge::Adult);
    smoke.gender = BattleGender::Bgirl;
    assert_eq!(smoke.display_name(), "Seven to Smoke Bgirl");
    let showcase = battle_fields(BattleFormat::Showcase, Some(5), BattleAge::Kids);
    assert_eq!(showcase.display_name(), "Showcase Mixed Kids");
    let mut masters = battle_fields(BattleFormat::Team, Some(1), BattleAge::Adult);
    masters.age_min = Some(40);
    assert_eq!(masters.display_name(), "1v1 Mixed Masters");
    masters.name = Some("  Old School 1v1 ".into());
    assert_eq!(masters.display_name(), "Old School 1v1");
}

/// Fields named by the struct-level rules that `fields` breaks.
fn broken_rules(fields: &BattleFields) -> Vec<String> {
    match fields.validate() {
        Ok(()) => Vec::new(),
        Err(errors) => errors.field_errors()["__all__"]
            .iter()
            .map(|e| e.code.to_string())
            .collect(),
    }
}

#[test]
fn battle_checks_mirror_the_schema() {
    let ok = battle_fields(BattleFormat::Team, Some(2), BattleAge::Kids);
    assert!(broken_rules(&ok).is_empty());
    let no_size = battle_fields(BattleFormat::Team, None, BattleAge::Adult);
    assert_eq!(broken_rules(&no_size), ["team_size"]);
    let smoke_with_size = battle_fields(BattleFormat::SevenToSmoke, Some(1), BattleAge::Adult);
    assert_eq!(broken_rules(&smoke_with_size), ["team_size"]);
    let unknown_with_size = battle_fields(BattleFormat::Na, Some(3), BattleAge::Adult);
    assert_eq!(broken_rules(&unknown_with_size), ["team_size"]);
    // A showcase may say how many dancers an entry holds, or not.
    for size in [Some(5), None] {
        let showcase = battle_fields(BattleFormat::Showcase, size, BattleAge::Adult);
        assert!(broken_rules(&showcase).is_empty());
    }
    let mut old_kids = battle_fields(BattleFormat::Team, Some(1), BattleAge::Kids);
    old_kids.age_max = Some(18);
    assert_eq!(broken_rules(&old_kids), ["age_max"]);
    let mut odd_bracket = battle_fields(BattleFormat::Team, Some(1), BattleAge::Adult);
    odd_bracket.bracket_size = Some(12);
    assert_eq!(broken_rules(&odd_bracket), ["bracket_size"]);
}

#[test]
fn entry_member_counts() {
    let duo = battle(BattleFormat::Team, Some(2));
    assert!(entry(1, EntryStatus::Pending).errors_for(&duo).is_empty());
    assert!(!entry(1, EntryStatus::Confirmed).errors_for(&duo).is_empty());
    assert!(entry(2, EntryStatus::Confirmed).errors_for(&duo).is_empty());
    assert!(!entry(3, EntryStatus::Pending).errors_for(&duo).is_empty());

    let smoke = battle(BattleFormat::SevenToSmoke, None);
    assert!(entry(1, EntryStatus::Pending).errors_for(&smoke).is_empty());
    assert!(!entry(2, EntryStatus::Pending).errors_for(&smoke).is_empty());

    // A showcase with a size counts like a team; without one, any crew goes.
    let trios = battle(BattleFormat::Showcase, Some(3));
    assert!(entry(2, EntryStatus::Pending).errors_for(&trios).is_empty());
    assert!(
        !entry(2, EntryStatus::Confirmed)
            .errors_for(&trios)
            .is_empty()
    );
    assert!(!entry(4, EntryStatus::Pending).errors_for(&trios).is_empty());
    let open = battle(BattleFormat::Showcase, None);
    assert!(
        entry(8, EntryStatus::Confirmed)
            .errors_for(&open)
            .is_empty()
    );

    let mut twice = entry(1, EntryStatus::Pending);
    twice.dancer_ids.push(twice.dancer_ids[0]);
    assert!(!twice.errors_for(&duo).is_empty());
}

#[test]
fn reached_and_final_rank_agree() {
    let solo = battle(BattleFormat::Team, Some(1));
    let mut winner = entry(1, EntryStatus::Confirmed);
    winner.reached = BracketStage::Winner;
    winner.normalize();
    assert_eq!(winner.final_rank, Some(1));
    assert!(winner.errors_for(&solo).is_empty());

    let mut wrong = entry(1, EntryStatus::Confirmed);
    wrong.reached = BracketStage::Top8;
    wrong.final_rank = Some(1);
    assert_eq!(wrong.errors_for(&solo)[0].0, "final_rank");

    let mut runner_up = entry(1, EntryStatus::Confirmed);
    runner_up.reached = BracketStage::Top2;
    runner_up.final_rank = Some(3);
    assert_eq!(runner_up.errors_for(&solo)[0].0, "final_rank");
}

#[test]
fn youtube_links() {
    let id = Some("dQw4w9WgXcQ".to_owned());
    assert_eq!(
        youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42"),
        id
    );
    assert_eq!(youtube_id("https://youtu.be/dQw4w9WgXcQ?t=42"), id);
    assert_eq!(youtube_id("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), id);
    assert_eq!(youtube_id("https://www.youtube.com/live/dQw4w9WgXcQ"), id);
    assert_eq!(youtube_id("https://vimeo.com/123"), None);
    assert_eq!(youtube_id("https://www.youtube.com/watch?v=short"), None);
    assert_eq!(
        youtube_id("javascript:alert(1)//youtu.be/dQw4w9WgXcQ"),
        None
    );

    let mut fields = entry(1, EntryStatus::Pending);
    fields.video_url = Some(" https://youtu.be/dQw4w9WgXcQ?t=42 ".into());
    fields.normalize();
    assert_eq!(
        fields.video_url.as_deref(),
        Some("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    );
}

#[test]
fn prizes_need_a_currency_and_a_currency_needs_a_prize() {
    let mut fields = battle_fields(BattleFormat::Team, Some(1), BattleAge::Adult);
    fields.prize_first = Some(1000);
    assert_eq!(broken_rules(&fields), ["prize_currency"]);
    fields.prize_currency = Some("CHF".into());
    assert!(broken_rules(&fields).is_empty());
    fields.prize_first = None;
    assert_eq!(
        broken_rules(&fields),
        ["prize_currency"],
        "a currency alone"
    );
    fields.prize_third = Some(250);
    assert!(broken_rules(&fields).is_empty(), "any place is enough");
    assert!(currency_code("CNY").is_ok());
    assert!(currency_code("chf").is_err());
    assert!(currency_code("EURO").is_err());
}

#[test]
fn a_battle_starts_on_one_of_its_jams_days() {
    let day = |d: u32| NaiveDate::from_ymd_opt(2023, 9, d).unwrap();
    let at = |d: u32| Some(day(d).and_hms_opt(14, 0, 0).unwrap());
    let mut fields = battle_fields(BattleFormat::Team, Some(1), BattleAge::Adult);
    // Unbreakable 2023: Friday 22 to Sunday 24 September.
    assert!(
        starts_during(fields.starts_at, day(22), day(24)),
        "no start is fine"
    );
    for (start, ok) in [(21, false), (22, true), (24, true), (25, false)] {
        fields.starts_at = at(start);
        assert_eq!(
            starts_during(fields.starts_at, day(22), day(24)),
            ok,
            "day {start}"
        );
    }
}

/// Entries of a battle as the API reads them: just ids and status matter to the bracket rules.
fn entries(n: usize) -> Vec<Entry> {
    (0..n)
        .map(|_| Entry {
            id: Uuid::now_v7(),
            battle_id: Uuid::nil(),
            team_name: None,
            crew: None,
            status: EntryStatus::Confirmed,
            reached: BracketStage::Na,
            final_rank: None,
            video_url: None,
            video_offset_seconds: None,
            members: Vec::new(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        })
        .collect()
}

fn played(round: MatchRound, winner: &Entry, loser: &Entry) -> MatchFields {
    MatchFields {
        round,
        position: 0,
        winner_id: winner.id,
        loser_id: loser.id,
        video_url: None,
        video_offset_seconds: None,
    }
}

/// `m` at another place in its round.
fn at(position: i16, m: MatchFields) -> MatchFields {
    MatchFields { position, ..m }
}

/// A Top 4 with its small final: a beats b and c beats d, a wins the final, d takes third.
fn top4(e: &[Entry]) -> Vec<MatchFields> {
    vec![
        played(MatchRound::Top4, &e[0], &e[1]),
        at(1, played(MatchRound::Top4, &e[2], &e[3])),
        played(MatchRound::Third, &e[3], &e[1]),
        played(MatchRound::Final, &e[0], &e[2]),
    ]
}

#[test]
fn a_full_bracket_holds() {
    let e = entries(4);
    assert_eq!(bracket_problem(&top4(&e), &e), None);
}

#[test]
fn bracket_rules_refuse_what_no_battle_could_be() {
    let e = entries(6);
    let stranger = &entries(1)[0];
    let mut withdrawn = e.clone();
    withdrawn[1].status = EntryStatus::Withdrawn;
    let cases: [(Vec<MatchFields>, &[Entry]); 8] = [
        (vec![played(MatchRound::Final, &e[0], stranger)], &e),
        (top4(&withdrawn), &withdrawn),
        (vec![played(MatchRound::Final, &e[0], &e[0])], &e),
        (
            vec![
                played(MatchRound::Top8, &e[0], &e[1]),
                at(1, played(MatchRound::Top8, &e[0], &e[2])),
            ],
            &e,
        ),
        // Two battles in one place.
        (
            vec![
                played(MatchRound::Top8, &e[0], &e[1]),
                played(MatchRound::Top8, &e[2], &e[3]),
            ],
            &e,
        ),
        // A place the round doesn't have: a final is one battle, and none is before the first.
        (vec![at(1, played(MatchRound::Final, &e[0], &e[1]))], &e),
        (vec![at(-1, played(MatchRound::Top8, &e[0], &e[1]))], &e),
        // b lost the quarter-final, then battles in the semis: listed in either order.
        (
            vec![
                played(MatchRound::Top4, &e[1], &e[2]),
                played(MatchRound::Top8, &e[0], &e[1]),
            ],
            &e,
        ),
    ];
    for (matches, entries) in cases {
        assert!(
            bracket_problem(&matches, entries).is_some(),
            "{matches:?} should be refused"
        );
    }
    let mut vimeo = top4(&e);
    vimeo[0].video_url = Some("https://vimeo.com/1".into());
    assert_eq!(
        bracket_problem(&vimeo, &e),
        Some("a video must be a YouTube link")
    );
}

#[test]
fn matches_decide_placings_and_last_videos() {
    let e = entries(4);
    let mut matches = top4(&e);
    matches[3].video_url = Some("https://www.youtube.com/watch?v=dQw4w9WgXcQ".into());
    matches[3].video_offset_seconds = Some(1234);
    let placings = placings(&matches);
    let of = |entry: &Entry| {
        placings
            .iter()
            .find(|p| p.entry_id == entry.id)
            .map(|p| (p.reached, p.final_rank, p.video_url.is_some()))
    };
    assert_eq!(of(&e[0]), Some((BracketStage::Winner, Some(1), true)));
    assert_eq!(of(&e[2]), Some((BracketStage::Top2, Some(2), true)));
    assert_eq!(of(&e[3]), Some((BracketStage::Top4, Some(3), false)));
    assert_eq!(of(&e[1]), Some((BracketStage::Top4, Some(4), false)));
    // The start goes with the video, or the entry's would play from 0:00.
    let winner = placings.iter().find(|p| p.entry_id == e[0].id).unwrap();
    assert_eq!(winner.video_offset_seconds, Some(1234));
}

#[test]
fn an_entry_that_only_won_so_far_keeps_its_placing() {
    let e = entries(4);
    let matches = [played(MatchRound::Top8, &e[0], &e[1])];
    let placings = placings(&matches);
    assert_eq!(placings.len(), 1);
    assert_eq!(placings[0].entry_id, e[1].id);
    assert_eq!(placings[0].reached, BracketStage::Top8);
}

#[test]
fn a_match_keeps_its_start_only_with_a_video() {
    let e = entries(2);
    let input = |video: Option<&str>| MatchInput {
        round: MatchRound::Final,
        position: 0,
        winner_id: e[0].id,
        loser_id: e[1].id,
        video_url: video.map(str::to_owned),
        video_offset_seconds: Some(90),
    };
    let list = MatchList(vec![
        input(Some(" https://youtu.be/dQw4w9WgXcQ ")),
        input(None),
    ]);
    let fields = list.fields();
    assert_eq!(
        fields[0].video_url.as_deref(),
        Some("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    );
    assert_eq!(fields[0].video_offset_seconds, Some(90));
    assert_eq!(
        (
            fields[1].video_url.as_deref(),
            fields[1].video_offset_seconds
        ),
        (None, None)
    );
}
