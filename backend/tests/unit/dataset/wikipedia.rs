//! Unit tests of `crate::dataset::wikipedia`.

use std::fs;

use super::scratch_dir;
use crate::dataset::{
    SeriesRecord,
    check::check,
    draft::{BattleSpec, Place, Sides, crews_toml, dancers_toml},
    load,
    wikipedia::{Source, draft},
};

/// Two editions in the shapes the Red Bull BC One page uses: a named `#invoke:bracket`, a
/// positional `{{Round4}}` with a small final, and one whose cells are split by `{{!}}`.
const BC_ONE: &str = r#"== Winners ==
=== 2019 ===
In its 16th edition took place on November 9, in Mumbai, India.<ref>{{cite web|url=https://x}}</ref>

'''Judges:'''

* {{#invoke:flag|icon|Venezuela}} Lil G (Speedy Angels)

'''MC:'''

* {{#invoke:flag|icon|Switzerland}} Amjad ($7 Crew)

'''DJ:'''

==== B-boy World Final ====

Location: [[Mumbai]], India

{{#invoke:bracket|4TeamBracket
| RD1-team01={{#invoke:flag|icon|NED}} '''[[Menno van Gorp|Menno]]'''<sup>2</sup>
| RD1-score01='''4'''
| RD1-team02={{#invoke:flag|icon|USA}} Stripes<sup>1</sup>
| RD1-score02=1
| RD1-team03={{#invoke:flag|icon|KAZ}} Killa Kolya
| RD1-score03=W
| RD1-team04={{#invoke:flag|icon|BRA}} Bart
| RD1-score04=L
| RD2-team01={{#invoke:flag|icon|NED}} '''Menno'''
| RD2-score01='''3'''
| RD2-team02={{#invoke:flag|icon|KAZ}} Killa Kolya
| RD2-score02=1
}}

==== B-Girl World Final ====

{{Round4
<!-- SF -->
| |{{#invoke:flag|icon|RUS}} '''Kastet''' | '''4''' |{{#invoke:flag|icon|JAP}} Ayumi | 1
| |{{#invoke:flag|icon|FRA}} '''Jilou''' | '''3''' |{{#invoke:flag|icon|Japan}} Ami | 2
<!-- Final -->
| |{{#invoke:flag|icon|RUS}} '''Kastet''' | '''3''' |{{#invoke:flag|icon|FRA}} Jilou | 1
<!-- Third place -->
| |{{#invoke:flag|icon|JAP}} Ayumi | 1 |{{#invoke:flag|icon|Japan}} '''Ami''' | '''4''' |
| color=no}}

=== 2009 ===
Red Bull BC One was held on 18 November 2009.
==== B-boy World Final ====
Location: [[New York City]], United States
<nowiki>{{Round4</nowiki>
| |{{#invoke:flag|icon|BRA}} '''Neguin''' {{!}} '''4''' {{!}}{{#invoke:flag|icon|Portugal}} Lagaet {{!}} 1
| |{{#invoke:flag|icon|USA}} '''Cloud''' {{!}} '''5''' {{!}}{{#invoke:flag|icon|KOR}} Differ {{!}} 0
| |{{#invoke:flag|icon|BRA}} Neguin {{!}} 0 {{!}}{{#invoke:flag|icon|USA}} '''Cloud''' {{!}} '''5'''
}}
== References ==
"#;

/// Outbreak's shape: a winners table by category, one year in two sections (history and
/// bracket), a bracket under no heading, `{{flagicon}}` flags and `{{NNTeamBracket}}` numbered
/// without zero padding.
const OUTBREAK: &str = r#"==Winners==
{| class="wikitable"
|-
! Year
! 2vs2 Breaking
! 1vs1 Breaking
! Kid
|-
|2014
|{{flagicon|FRA}} Damani & Killian
|{{flagicon|POL}} Kleju
| -
|-
! scope="row" style="background:#efefef;" | 2013
| {{flagicon|JPN}} Body Carnival YG || {{flagicon|RUS}} Kosto || {{flagicon|Atlantis}} Kid Nemo
|}
==History==
===2014===
Fifth edition took place on July 25 – 27, 2014.
==Outbreak Europe==
===2014===
{{4TeamBracket|RD1-team1={{flagicon|POL}} '''Kleju'''|RD1-score1='''W'''|RD1-team2={{flagicon|FRA}} Tonio|RD1-score2=L|RD1-team3={{flagicon|RUS}} Kosto|RD1-score3=L|RD1-team4={{flagicon|KAZ}} '''Killa Kolya'''|RD1-score4='''W'''|RD2-team1={{flagicon|POL}} '''Kleju'''|RD2-score1='''W'''|RD2-team2={{flagicon|KAZ}} Killa Kolya|RD2-score2=L}}
==References==
"#;

fn bc_one() -> (SeriesRecord, Source) {
    let battle = |key: &str, word: &str| BattleSpec {
        key: key.into(),
        name: key.into(),
        words: vec![word.into()],
        ..BattleSpec::default()
    };
    let source = Source {
        page: "https://en.wikipedia.org/wiki/BC_One".into(),
        battles: vec![battle("bboy", "b-boy"), battle("bgirl", "b-girl")],
        untitled: None,
    };
    let series = SeriesRecord {
        name: "BC One".into(),
        ..SeriesRecord::default()
    };
    (series, source)
}

fn outbreak() -> (SeriesRecord, Source) {
    let battle = |key: &str, column: &str, team_size: Option<u8>| BattleSpec {
        key: key.into(),
        name: key.into(),
        team_size,
        words: if key == "bboy" {
            vec!["b-boy".into()]
        } else {
            Vec::new()
        },
        table: Some("Winners".into()),
        places: [(column.into(), Place::Winner)].into(),
        ..BattleSpec::default()
    };
    let source = Source {
        page: "https://en.wikipedia.org/wiki/Outbreak_Europe".into(),
        battles: vec![
            battle("bboy", "1vs1 Breaking", None),
            battle("2v2", "2vs2 Breaking", Some(2)),
            battle("kids", "Kid", None),
        ],
        untitled: Some("bboy".into()),
    };
    let series = SeriesRecord {
        name: "Outbreak".into(),
        city: Some("Banská Bystrica".into()),
        country: Some("SK".into()),
        timezone: Some("Europe/Bratislava".into()),
        ..SeriesRecord::default()
    };
    (series, source)
}

#[test]
fn drafts_one_file_per_year_with_every_bracket_shape() {
    let (series, source) = bc_one();
    let draft = draft(BC_ONE, &series, &source);
    assert!(draft.problems.is_empty(), "{:?}", draft.problems);
    let [(old_year, old_toml), (year, toml)] = &draft.events[..] else {
        panic!("two editions expected: {:?}", draft.events);
    };

    assert_eq!((old_year.as_str(), year.as_str()), ("2009", "2019"));
    for line in [
        "name = \"BC One 2019\"",
        "starts_on = 2019-11-09",
        "city = \"Mumbai\"",
        "country = \"IN\"",
        "judges = [\"lil-g\"]",
        "mcs = [\"amjad\"]",
        "djs = []",
        "{ round = \"top4\", a = \"menno\", b = \"stripes\", winner = \"menno\", votes = [4, 1] },",
        "{ round = \"top4\", a = \"killa-kolya\", b = \"bart\", winner = \"killa-kolya\" },",
        "{ round = \"final\", a = \"menno\", b = \"killa-kolya\", winner = \"menno\", votes = [3, 1] },",
        "{ round = \"third\", a = \"ayumi\", b = \"ami\", winner = \"ami\", votes = [1, 4] },",
    ] {
        assert!(toml.contains(line), "{line} not in\n{toml}");
    }
    for line in [
        "starts_on = 2009-11-18",
        "city = \"New York City\"",
        "{ round = \"final\", a = \"neguin\", b = \"cloud\", winner = \"cloud\", votes = [0, 5] },",
    ] {
        assert!(old_toml.contains(line), "{line} not in\n{old_toml}");
    }
    assert_eq!(
        draft.dancers["ayumi"].countries.keys().collect::<Vec<_>>(),
        [&"JP"]
    );
}

#[test]
fn a_draft_with_its_dancers_passes_check() {
    let (series, source) = bc_one();
    let draft = draft(BC_ONE, &series, &source);
    let dir = scratch_dir();
    fs::write(dir.join("series/bc-one.toml"), "name = \"BC One\"\n").unwrap();
    fs::write(dir.join("dancers.toml"), dancers_toml(&draft.dancers)).unwrap();
    fs::write(dir.join("crews.toml"), crews_toml(&draft.crews)).unwrap();
    for (edition, toml) in &draft.events {
        // The draft leaves the timezone for a human; fill it as one would.
        let toml = toml.replace("timezone = \"TODO\"", "timezone = \"Asia/Kolkata\"");
        fs::write(dir.join(format!("events/bc-one/{edition}.toml")), toml).unwrap();
    }

    let (data, unreadable) = load(&dir);
    fs::remove_dir_all(&dir).unwrap();
    assert!(unreadable.is_empty(), "{unreadable:?}");
    let report = check(&data);
    assert!(report.errors.is_empty(), "{:?}", report.errors);
}

#[test]
fn tables_give_placings_where_no_bracket_does() {
    let (series, source) = outbreak();
    let draft = draft(OUTBREAK, &series, &source);
    let [(_, y2013), (_, y2014)] = &draft.events[..] else {
        panic!("2013 and 2014 expected: {:?}", draft.events);
    };

    for line in [
        "starts_on = 2014-07-25",
        "ends_on = 2014-07-27",
        "city = \"Banská Bystrica\"",
        // The bracket under no heading is the 1v1's; its table winner agrees.
        "{ round = \"final\", a = \"kleju\", b = \"killa-kolya\", winner = \"kleju\" },",
        "{ entrant = \"damani-killian\", reached = \"winner\" },",
        "damani-killian = { members = [\"damani\", \"killian\"] }",
    ] {
        assert!(y2014.contains(line), "{line} not in\n{y2014}");
    }
    assert!(
        !y2014.contains("key = \"kids\""),
        "a `-` cell is no winner:\n{y2014}"
    );
    for line in [
        "# starts_on = YYYY-MM-DD  (not found on the page)",
        "{ entrant = \"kosto\", reached = \"winner\" },",
        "body-carnival-yg = { name = \"Body Carnival YG\" }",
        "{ entrant = \"kid-nemo\", reached = \"winner\" },",
    ] {
        assert!(y2013.contains(line), "{line} not in\n{y2013}");
    }
    assert_eq!(
        draft.dancers["damani"].countries.keys().collect::<Vec<_>>(),
        [&"FR"]
    );
    let unknown = "2013: unknown flag \"Atlantis\" in table \"Winners\"".to_owned();
    assert!(draft.problems.contains(&unknown), "{:?}", draft.problems);
}

#[test]
fn a_bracket_and_a_table_that_disagree_are_reported() {
    let (series, source) = outbreak();
    let page = OUTBREAK.replace("{{flagicon|POL}} Kleju\n", "{{flagicon|RUS}} Kosto\n");

    let draft = draft(&page, &series, &source);
    let expected =
        "2014 bboy: the bracket's champion is kleju, the results table's kosto".to_owned();
    assert!(draft.problems.contains(&expected), "{:?}", draft.problems);
}

#[test]
fn unclear_winners_and_unnamed_entrants_become_problems() {
    let (series, source) = bc_one();
    let page = "=== 2010 ===\nOn November 27, 2010.\n==== B-boy World Final ====\nLocation: [[Tokyo]], Japan\n{{Round2\n| |{{#invoke:flag|icon|USA}} Kid | 2 |{{#invoke:flag|icon|JPN}} 革命前夜 | 2\n}}\n";

    let draft = draft(page, &series, &source);
    for expected in [
        "2010 bboy final: no Latin name in \"革命前夜\"; fill that entrant",
        "2010 bboy final kid vs TODO: winner unclear; fill it",
    ] {
        assert!(
            draft.problems.iter().any(|p| p == expected),
            "{expected} not in {:?}",
            draft.problems
        );
    }
}

#[test]
fn every_table_under_the_heading_counts_and_small_finals_keep_their_rank() {
    let page = r#"==Past results==
{|class="wikitable"
|-
! Year !! First place !! Losing Semifinalists
|-
! scope="row" | 2006
| {{flagicon|FRA}} Vagabonds || {{flagicon|KOR}} Drifterz / {{flagicon|GER}} B-Town Allstars
|}
Until 2006, a battle was held for third place.
{|class="wikitable"
|-
! Year !! First place !! Third place !! Fourth place
|-
! scope="row" | 2005
| {{flagicon|KOR}} Last For One || {{flagicon|KOR}} [[Gamblerz]] || {{flagicon|FRA}} Phase-T
|}
==Other==
"#;
    let source = Source {
        page: "https://en.wikipedia.org/wiki/BOTY".into(),
        battles: vec![BattleSpec {
            key: "crew".into(),
            name: "Crew battle".into(),
            sides: Some(Sides::Crews),
            table: Some("Past results".into()),
            places: [
                ("First place".into(), Place::Winner),
                ("Losing Semifinalists".into(), Place::Top4),
                ("Third place".into(), Place::Third),
                ("Fourth place".into(), Place::Fourth),
            ]
            .into(),
            ..BattleSpec::default()
        }],
        untitled: None,
    };
    let series = SeriesRecord {
        name: "BOTY".into(),
        ..SeriesRecord::default()
    };

    let draft = draft(page, &series, &source);
    let [(_, y2005), (_, y2006)] = &draft.events[..] else {
        panic!("2005 and 2006 expected: {:?}", draft.events);
    };
    for line in [
        "{ entrant = \"last-for-one\", reached = \"winner\" },",
        "{ entrant = \"gamblerz\", reached = \"top4\", rank = 3 },",
        "{ entrant = \"phase-t\", reached = \"top4\", rank = 4 },",
        "gamblerz = { crew = \"gamblerz\" }",
    ] {
        assert!(y2005.contains(line), "{line} not in\n{y2005}");
    }
    assert!(
        y2006.contains("{ entrant = \"b-town-allstars\", reached = \"top4\" },"),
        "{y2006}"
    );
    assert_eq!(
        draft.crews["drifterz"].countries.keys().collect::<Vec<_>>(),
        [&"KR"]
    );
}
