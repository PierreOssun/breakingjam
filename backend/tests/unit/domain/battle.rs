//! Unit tests of `crate::domain::battle`.

use chrono::Utc;
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
