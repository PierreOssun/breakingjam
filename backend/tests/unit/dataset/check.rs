//! Unit tests of `crate::dataset::check`.

use chrono::NaiveDate;

use super::top4;
use std::collections::BTreeMap;

use crate::dataset::{
    CrewRecord, DancerRecord, Dataset, EventRecord, Round, SeriesRecord, TeamRecord, check::check,
};

fn dancer(name: &str, country: &str) -> DancerRecord {
    DancerRecord {
        name: name.into(),
        country: country.into(),
        country2: None,
        aliases: Vec::new(),
        crews: Vec::new(),
    }
}

/// One jam with the `top4` bracket, judged by storm; every rule holds.
fn dataset() -> Dataset {
    let mut data = Dataset::default();
    for (key, name, country) in [
        ("menno", "Menno", "NL"),
        ("lee", "Lee", "NL"),
        ("kastet", "Kastet", "RU"),
        ("ami", "Ami", "JP"),
        ("storm", "Storm", "DE"),
    ] {
        data.dancers.insert(key.into(), dancer(name, country));
    }
    data.series.insert(
        "bc-one".into(),
        SeriesRecord {
            name: "BC One".into(),
            ..SeriesRecord::default()
        },
    );
    data.events.insert(
        "bc-one/2023".into(),
        EventRecord {
            name: "BC One 2023".into(),
            starts_on: NaiveDate::from_ymd_opt(2023, 10, 21).unwrap(),
            ends_on: None,
            timezone: "Europe/Paris".into(),
            venue: None,
            city: "Paris".into(),
            country: "FR".into(),
            lat: Some(48.8566),
            lng: Some(2.3522),
            sources: Vec::new(),
            judges: vec!["storm".into()],
            mcs: Vec::new(),
            djs: Vec::new(),
            battles: vec![top4()],
        },
    );
    data
}

/// The errors as `data check` prints them.
fn errors_of(data: &Dataset) -> Vec<String> {
    check(data).errors.iter().map(ToString::to_string).collect()
}

fn event(data: &mut Dataset) -> &mut EventRecord {
    data.events.get_mut("bc-one/2023").unwrap()
}

#[test]
fn a_consistent_dataset_passes() {
    let report = check(&dataset());
    assert!(report.errors.is_empty(), "{:?}", report.errors);
    assert!(report.warnings.is_empty(), "{:?}", report.warnings);
}

#[test]
fn errors_name_the_file_and_the_rule() {
    let mut data = dataset();
    event(&mut data).timezone = "TODO".into();
    event(&mut data).ends_on = NaiveDate::from_ymd_opt(2023, 10, 20);
    event(&mut data).lat = Some(95.0);
    event(&mut data).judges.push("crazy-legs".into());
    event(&mut data).battles[0].matches[0].video = Some("https://vimeo.com/1".into());

    let errors = errors_of(&data);
    for expected in [
        "events/bc-one/2023.toml: timezone \"TODO\" is not an IANA timezone",
        "events/bc-one/2023.toml: ends_on is before starts_on",
        "events/bc-one/2023.toml: lat or lng is out of range",
        "events/bc-one/2023.toml: judge crazy-legs is not in dancers.toml",
        "events/bc-one/2023.toml: battle bboy: https://vimeo.com/1 is not a YouTube link",
    ] {
        assert!(
            errors.iter().any(|e| e == expected),
            "{expected} not in {errors:?}"
        );
    }
}

#[test]
fn bracket_errors_are_reported_per_battle() {
    let mut data = dataset();
    event(&mut data).battles[0].matches[0].winner = "storm".into();

    let errors = errors_of(&data);
    assert!(
        errors
            .iter()
            .any(|e| e.starts_with("events/bc-one/2023.toml: battle bboy: top4: winner storm")),
        "{errors:?}"
    );
}

#[test]
fn a_jam_needs_its_series_file() {
    let mut data = dataset();
    data.series.clear();

    let errors = errors_of(&data);
    assert!(
        errors.contains(&"events/bc-one/2023.toml: no series/bc-one.toml".to_owned()),
        "{errors:?}"
    );
}

#[test]
fn bad_dancer_lines_are_errors() {
    let mut data = dataset();
    data.dancers.insert("Bad Key".into(), dancer("", "TODO"));

    let errors = errors_of(&data);
    assert!(
        errors.iter().any(|e| e.contains("Bad Key: key must be")),
        "{errors:?}"
    );
    assert!(
        errors.iter().any(|e| e.contains("Bad Key: name is blank")),
        "{errors:?}"
    );
    assert!(
        errors.iter().any(|e| e.contains("country \"TODO\"")),
        "{errors:?}"
    );
}

#[test]
fn near_spellings_warn_but_homonyms_split_on_purpose_do_not() {
    let mut data = dataset();
    data.dancers
        .insert("hong-10".into(), dancer("Hong 10", "KR"));
    data.dancers.insert("hong10".into(), dancer("Hong10", "KR"));
    data.dancers
        .insert("storm-fr".into(), dancer("Storm", "FR"));
    event(&mut data)
        .judges
        .extend(["hong-10".into(), "hong10".into(), "storm-fr".into()]);

    let warnings = check(&data).warnings;
    assert_eq!(
        warnings,
        ["dancers.toml: [\"hong-10\", \"hong10\"] are spelled alike; the same one?"]
    );
}

#[test]
fn dancers_in_no_jam_get_a_warning() {
    let mut data = dataset();
    data.dancers.insert("bebe".into(), dancer("Bebe", "US"));

    assert_eq!(check(&data).warnings, ["dancers.toml: bebe is in no jam"]);
}

/// A 2v2 between a crew's duo and a named team, judged as in `dataset()`.
fn two_v_two(data: &mut Dataset) {
    data.crews.insert(
        "formless-corp".into(),
        CrewRecord {
            name: "Formless Corp".into(),
            country: Some("CH".into()),
            aliases: Vec::new(),
        },
    );
    let mut battle = super::top4();
    battle.key = "2v2".into();
    battle.team_size = Some(2);
    battle.matches = vec![super::game(Round::Final, "menno-lee", "dynamo", "dynamo")];
    battle.bracket_size = Some(2);
    battle.teams = BTreeMap::from([
        (
            "menno-lee".into(),
            TeamRecord {
                name: None,
                crew: Some("formless-corp".into()),
                members: vec!["menno".into(), "lee".into()],
            },
        ),
        (
            "dynamo".into(),
            TeamRecord {
                name: Some("Dynamo".into()),
                crew: None,
                members: Vec::new(),
            },
        ),
    ]);
    event(data).battles = vec![battle];
}

#[test]
fn a_team_battle_passes() {
    let mut data = dataset();
    two_v_two(&mut data);
    // kastet and ami no longer play; only their unused-dancer warnings remain.
    let report = check(&data);
    assert!(report.errors.is_empty(), "{:?}", report.errors);
}

#[test]
fn team_rules() {
    let mut data = dataset();
    two_v_two(&mut data);
    let battle = &mut event(&mut data).battles[0];
    battle.teams.get_mut("dynamo").unwrap().name = None;
    battle.teams.get_mut("menno-lee").unwrap().crew = Some("rock-steady".into());
    battle
        .teams
        .get_mut("menno-lee")
        .unwrap()
        .members
        .push("ami".into());
    battle.teams.insert(
        "ghosts".into(),
        TeamRecord {
            name: Some("Ghosts".into()),
            crew: None,
            members: vec!["lee".into()],
        },
    );

    let errors = errors_of(&data);
    for expected in [
        "team dynamo needs a name, a crew or members",
        "team menno-lee has 3 members for a team_size of 2",
        "team menno-lee: crew rock-steady is not in crews.toml",
        "lee plays for two teams",
        "team ghosts plays no match",
    ] {
        assert!(
            errors.iter().any(|e| e.ends_with(expected)),
            "{expected} not in {errors:?}"
        );
    }
}

#[test]
fn a_team_entrant_must_be_one_of_the_teams() {
    let mut data = dataset();
    two_v_two(&mut data);
    event(&mut data).battles[0].matches[0].b = "nova".into();
    event(&mut data).battles[0].matches[0].winner = "nova".into();

    let errors = errors_of(&data);
    assert!(
        errors
            .iter()
            .any(|e| e.ends_with("entrant nova is not in this battle's teams")),
        "{errors:?}"
    );
}

#[test]
fn crews_of_dancers_must_exist_and_plural_spellings_warn() {
    let mut data = dataset();
    two_v_two(&mut data);
    data.dancers
        .get_mut("menno")
        .unwrap()
        .crews
        .push("hustle-kidz".into());
    data.crews.insert(
        "formless-corps".into(),
        CrewRecord {
            name: "Formless Corps".into(),
            country: None,
            aliases: Vec::new(),
        },
    );

    let report = check(&data);
    assert!(
        errors_of(&data)
            .contains(&"dancers.toml: menno: crew hustle-kidz is not in crews.toml".to_owned()),
        "{:?}",
        report.errors
    );
    assert!(
        report.warnings.contains(
            &"crews.toml: [\"formless-corp\", \"formless-corps\"] are spelled alike; the same one?"
                .to_owned()
        ),
        "{:?}",
        report.warnings
    );
}
