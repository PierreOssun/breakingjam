//! Unit tests of `crate::dataset`.

mod check;
mod wikipedia;
mod wikitext;
mod youtube;

use std::{collections::BTreeMap, fs, path::PathBuf};

use crate::{
    dataset::*,
    domain::battle::{BattleGender, BracketStage},
};

pub(super) fn game(round: Round, a: &str, b: &str, winner: &str) -> MatchRecord {
    MatchRecord {
        round,
        a: a.into(),
        b: b.into(),
        winner: winner.into(),
        votes: None,
        video: Some(format!("https://youtu.be/{a:-<11}")),
        at: None,
    }
}

/// A top 4 with a small final: menno beats lee and ami beats kastet, ami wins, lee is 3rd.
pub(super) fn top4() -> BattleRecord {
    BattleRecord {
        key: "bboy".into(),
        name: "1v1 Bboy".into(),
        gender: BattleGender::Bboy,
        age: None,
        format: None,
        team_size: None,
        bracket_size: Some(4),
        teams: BTreeMap::new(),
        matches: vec![
            game(Round::Top4, "menno", "lee", "menno"),
            game(Round::Top4, "kastet", "ami", "ami"),
            game(Round::Final, "menno", "ami", "ami"),
            game(Round::Third, "lee", "kastet", "lee"),
        ],
        results: Vec::new(),
    }
}

/// A scratch directory under the system temp dir, removed by the test that made it.
pub(super) fn scratch_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("breakingjam-data-{}", uuid::Uuid::now_v7()));
    fs::create_dir_all(dir.join("series")).unwrap();
    fs::create_dir_all(dir.join("events/bc-one")).unwrap();
    dir
}

#[test]
fn standings_follow_the_bracket_and_the_small_final() {
    let battle = top4();
    let standings = battle.standings().unwrap();
    let find = |dancer: &str| standings.iter().find(|s| s.entrant == dancer).unwrap();

    assert_eq!(
        (find("ami").reached, find("ami").rank),
        (BracketStage::Winner, Some(1))
    );
    assert_eq!(
        (find("menno").reached, find("menno").rank),
        (BracketStage::Top2, Some(2))
    );
    assert_eq!(
        (find("lee").reached, find("lee").rank),
        (BracketStage::Top4, Some(3))
    );
    assert_eq!(
        (find("kastet").reached, find("kastet").rank),
        (BracketStage::Top4, Some(4))
    );
    // Each dancer gets the video of their last match.
    assert_eq!(find("menno").video, Some("https://youtu.be/menno------"));
    assert_eq!(find("kastet").video, Some("https://youtu.be/lee--------"));
}

#[test]
fn a_winner_missing_from_the_next_round_is_an_error() {
    let mut battle = top4();
    battle.matches[2] = game(Round::Final, "lee", "ami", "ami");

    let errors = battle.standings().unwrap_err();
    assert!(
        errors
            .iter()
            .any(|e| e.contains("final: previous winners missing")),
        "{errors:?}"
    );
}

#[test]
fn a_winner_outside_the_match_is_an_error() {
    let mut battle = top4();
    battle.matches[0].winner = "lilou".into();

    let errors = battle.standings().unwrap_err();
    assert!(
        errors
            .iter()
            .any(|e| e.contains("winner lilou is not in menno vs lee")),
        "{errors:?}"
    );
}

#[test]
fn an_incomplete_bracket_is_an_error() {
    let mut battle = top4();
    battle.matches.remove(1);

    let errors = battle.standings().unwrap_err();
    assert!(
        errors
            .iter()
            .any(|e| e.contains("top4 has 1 matches, a full bracket has 2")),
        "{errors:?}"
    );
}

#[test]
fn results_stand_in_for_an_unknown_bracket_and_imply_the_podium() {
    let mut battle = top4();
    battle.matches.clear();
    battle.results = vec![ResultRecord {
        entrant: "ami".into(),
        reached: BracketStage::Winner,
        rank: None,
        video: None,
        at: None,
    }];
    assert_eq!(battle.standings().unwrap()[0].rank, Some(1));

    battle.matches = top4().matches;
    assert!(battle.standings().is_err(), "matches and results together");
}

#[test]
fn bracket_rounds_start_from_the_size() {
    assert_eq!(
        Round::bracket(16),
        Some(vec![Round::Top16, Round::Top8, Round::Top4, Round::Final])
    );
    assert_eq!(Round::bracket(2), Some(vec![Round::Final]));
    assert_eq!(Round::bracket(12), None);
}

#[test]
fn keys_and_spellings() {
    assert_eq!(key_for("Sébastien  Kim"), "sebastien-kim");
    assert_eq!(key_for("Lil' Tim"), "lil-tim");
    assert_eq!(key_for("Hong 10"), "hong-10");
    assert!(is_key("hong-10") && !is_key("Hong-10") && !is_key("hong--10") && !is_key(""));
    assert_eq!(spelling("Hong 10"), spelling("Hong10"));
    assert_eq!(spelling("Gdańsk"), "gdansk");
}

#[test]
fn load_reads_toml_dates_and_reports_every_bad_file() {
    let dir = scratch_dir();
    fs::write(dir.join("crews.toml"), "").unwrap();
    fs::write(
        dir.join("dancers.toml"),
        "ami = { name = \"Ami\", country = \"JP\" }\n",
    )
    .unwrap();
    fs::write(dir.join("series/bc-one.toml"), "name = \"BC One\"\n").unwrap();
    let event = "name = \"BC One 2023\"\nstarts_on = 2023-10-21\nends_on = 2023-10-22\ntimezone = \"Europe/Paris\"\ncity = \"Paris\"\ncountry = \"FR\"\n";
    fs::write(dir.join("events/bc-one/2023.toml"), event).unwrap();

    let (data, unreadable) = load(&dir);
    assert!(unreadable.is_empty(), "{unreadable:?}");
    let event = &data.events["bc-one/2023"];
    assert_eq!(event.starts_on.to_string(), "2023-10-21");
    assert_eq!(
        event.ends_on.map(|d| d.to_string()),
        Some("2023-10-22".into())
    );
    assert_eq!(data.dancers["ami"].country, "JP");

    fs::write(dir.join("events/bc-one/2024.toml"), "name = 1\n").unwrap();
    fs::write(dir.join("series/broken.toml"), "name = \n").unwrap();
    let (data, errors) = load(&dir);
    assert!(
        data.events.contains_key("bc-one/2023"),
        "the readable files still load"
    );
    fs::remove_dir_all(&dir).unwrap();
    assert_eq!(errors.len(), 2, "{errors:?}");
}
