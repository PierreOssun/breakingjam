//! Unit tests of `crate::dataset::youtube`.

use crate::dataset::{
    SeriesRecord,
    draft::{BattleSpec, Sides},
    youtube::{Source, Video, draft},
};
use crate::domain::battle::BattleAge;

fn video(id: &str, title: &str, published: &str) -> Video {
    Video {
        id: id.into(),
        title: title.into(),
        published: published.into(),
    }
}

fn battle(key: &str, team_size: Option<u8>, words: &[&str]) -> BattleSpec {
    BattleSpec {
        key: key.into(),
        name: key.into(),
        team_size,
        age: (key == "kids").then_some(BattleAge::Kids),
        words: words.iter().map(|w| (*w).into()).collect(),
        ..BattleSpec::default()
    }
}

fn series(name: &str) -> SeriesRecord {
    SeriesRecord {
        name: name.into(),
        city: Some("Zurich".into()),
        country: Some("CH".into()),
        timezone: Some("Europe/Zurich".into()),
        ..SeriesRecord::default()
    }
}

fn dpc() -> Source {
    Source {
        channels: vec!["UCstance".into()],
        title: "DPC Jam".into(),
        exclude: Vec::new(),
        ignore: Vec::new(),
        battles: vec![battle("2v2", Some(2), &[])],
    }
}

/// Titles as stance writes them, members in any order and the crew in either place.
fn dpc_videos() -> Vec<Video> {
    vec![
        video(
            "semi1",
            "Alvin & Grom (Formless Corp) vs Holy Rain & Saturn (Super Kidz) [semi] // stance x DPC Jam 2025",
            "2025-10-27",
        ),
        video(
            "semi2",
            "Rick Zhou & Lorenzo vs Tiger & Gekkon [semi] // stance x DPC JAM 2025",
            "2025-10-27",
        ),
        video(
            "final",
            "Tiger & Gekkon vs Formless Corps (Grom & Alvin) [final] // stance x DPC JAM 2025",
            "2025-10-26",
        ),
        video(
            "short",
            "Grom hitting those beats @DPCJAM congrats to Grom & Alvin for winning the 2v2 category!",
            "2025-10-27",
        ),
        video("noround", "Hype vs Moments at DPC Jam 2025", "2025-10-28"),
        video(
            "other",
            "DPC Crew vs Formless [top 16] // stance // FREESTYLE SESSION EUROPE 2022",
            "2022-07-07",
        ),
        video(
            "final26",
            "Damani & Syssy [france] vs Nori & Ryoga (JAPAN) final // stance x DPC JAM 2026",
            "2026-10-05",
        ),
    ]
}

#[test]
fn winners_advance_and_the_final_winner_comes_from_a_winner_title() {
    let draft = draft(&dpc_videos(), &series("DPC Jam"), &dpc());
    let [(year, toml), (next_year, next_toml)] = &draft.events[..] else {
        panic!("2025 and 2026 expected: {:?}", draft.events);
    };

    assert_eq!((year.as_str(), next_year.as_str()), ("2025", "2026"));
    for line in [
        "name = \"DPC Jam 2025\"",
        "starts_on = 2025-10-25  # the Saturday before the first upload (2025-10-26); check",
        "city = \"Zurich\"",
        "team_size = 2",
        "bracket_size = 4",
        "{ round = \"top4\", a = \"alvin-grom\", b = \"holy-rain-saturn\", winner = \"alvin-grom\", video = \"https://youtu.be/semi1\" },",
        "{ round = \"top4\", a = \"lorenzo-rick-zhou\", b = \"gekkon-tiger\", winner = \"gekkon-tiger\", video = \"https://youtu.be/semi2\" },",
        "{ round = \"final\", a = \"gekkon-tiger\", b = \"alvin-grom\", winner = \"alvin-grom\", video = \"https://youtu.be/final\" },",
        "alvin-grom = { crew = \"formless-corp\", members = [\"alvin\", \"grom\"] }",
        "holy-rain-saturn = { crew = \"super-kidz\", members = [\"holy-rain\", \"saturn\"] }",
    ] {
        assert!(toml.contains(line), "{line} not in\n{toml}");
    }
    assert!(next_toml.contains("bracket_size = 2"), "{next_toml}");
    assert!(next_toml.contains("winner = \"TODO\""), "{next_toml}");
}

#[test]
fn country_tags_crews_and_problems() {
    let draft = draft(&dpc_videos(), &series("DPC Jam"), &dpc());

    assert_eq!(
        draft.dancers["damani"].countries.keys().collect::<Vec<_>>(),
        [&"FR"]
    );
    assert_eq!(
        draft.dancers["ryoga"].countries.keys().collect::<Vec<_>>(),
        [&"JP"]
    );
    assert!(draft.dancers["grom"].crews.contains("formless-corp"));
    // Both spellings register a crew; `check` warns that they are spelled alike.
    assert!(draft.crews.contains_key("formless-corps"));
    assert!(
        !draft.dancers.contains_key("hype"),
        "a title without a round drafts nothing"
    );
    for problem in [
        "2025: no round in \"Hype vs Moments at DPC Jam 2025\"; add that match by hand",
        "2026 2v2 final damani-syssy vs nori-ryoga: winner unclear; fill it",
    ] {
        assert!(
            draft.problems.iter().any(|p| p == problem),
            "{problem} not in {:?}",
            draft.problems
        );
    }
}

#[test]
fn shouted_titles_judges_and_finals_that_name_no_battle() {
    let source = Source {
        channels: vec!["UCskillzoo".into()],
        title: "Battle of Sun".into(),
        exclude: Vec::new(),
        ignore: Vec::new(),
        battles: vec![
            battle("2v2", Some(2), &["2v2"]),
            battle("kids", None, &["kids"]),
        ],
    };
    let videos = [
        video(
            "k1",
            "TOP 8 / BUCH VS SPIN / BATTLE OF SUN KIDS 2026",
            "2026-09-20",
        ),
        video(
            "s1",
            "SEMI-FINAL / SAISON 2 VS FRESH MOB CREW / BATTLE OF SUN 2V2 2026",
            "2026-09-20",
        ),
        video(
            "f1",
            "FINAL ROUND / SAISON 2 VS DAS FLAVOUR / BATTLE OF SUN 2026",
            "2026-09-20",
        ),
        video(
            "j1",
            "DEMO JUDGES / BARTEK & YU-SENG / BATTLE OF SUN 2026",
            "2026-09-20",
        ),
    ];

    let draft = draft(&videos, &series("Battle of Sun"), &source);
    let (_, toml) = &draft.events[0];
    for line in [
        "judges = [\"bartek\", \"yu-seng\"]",
        "{ round = \"top4\", a = \"saison-2\", b = \"fresh-mob-crew\", winner = \"saison-2\", video = \"https://youtu.be/s1\" },",
        "{ round = \"final\", a = \"saison-2\", b = \"das-flavour\", winner = \"TODO\", video = \"https://youtu.be/f1\" },",
        "das-flavour = { name = \"Das Flavour\" }",
        "age = \"kids\"",
        "{ round = \"top8\", a = \"buch\", b = \"spin\", winner = \"TODO\", video = \"https://youtu.be/k1\" },",
    ] {
        assert!(toml.contains(line), "{line} not in\n{toml}");
    }
    // The final names no battle, so it joins the 2v2, where Saison 2 already plays.
    let two_v_two =
        &toml[toml.find("key = \"2v2\"").unwrap()..toml.find("key = \"kids\"").unwrap()];
    assert!(two_v_two.contains("youtu.be/f1"), "{two_v_two}");
    assert_eq!(draft.dancers["yu-seng"].name, "Yu-Seng");
    assert!(draft.dancers.contains_key("spin"), "a 1v1 side is a dancer");
}

#[test]
fn tags_arrows_and_excluded_events() {
    let source = Source {
        channels: vec!["UClawksam".into(), "UCbboyworld".into()],
        title: "Unbreakable".into(),
        exclude: vec!["who's the one".into()],
        ignore: vec!["bboy world".into()],
        battles: vec![
            BattleSpec {
                sides: Some(Sides::Crews),
                ..battle("crew", None, &["crew"])
            },
            BattleSpec {
                sides: Some(Sides::Crews),
                ..battle("kids-crew", None, &["kidz crew"])
            },
            battle("bgirl", None, &["bgirl"]),
            battle("bboy", None, &["bboy", "1on1"]),
        ],
    };
    let videos = [
        video(
            "g1",
            "Orélia vs Nicka [BGIRL TOP 16] / Unbreakable 2026",
            "2026-09-07",
        ),
        video(
            "g2",
            "Nicka vs Orélia [BGIRL TOP 16] / Unbreakable 2026 (4K)",
            "2026-09-08",
        ),
        video(
            "c1",
            "Los Crapulos vs CCU7 [CREW FINAL] / Unbreakable 2026",
            "2026-09-07",
        ),
        video(
            "b1",
            "Bruce Allmighty vs Differ // .BBoy World // BREAKING 1on1 SEMI-FINAL | UNBREAKABLE 2026",
            "2026-09-07",
        ),
        video(
            "b2",
            "Breaknuts vs Hidden Trip ▶ UNBREAKABLE 2026 ◀ ⓒ .BBoy World [crew top 8]",
            "2026-09-07",
        ),
        video(
            "x1",
            "Kopt-R vs Unbreakable [BBOY 1on1 EIGHT-FINAL] ▶ WHO'S THE ONE? 2026 ◀ ⓒ .BBoy World",
            "2026-09-08",
        ),
        video(
            "kc1",
            "Battle Droids vs Fresh Allstars // .BBoy World // KIDZ CREW FINAL | UNBREAKABLE 2026",
            "2026-09-07",
        ),
        video(
            "l1",
            "Kill vs Roxrite [Quarter-Final] // Bboy World // Unbreakable 2026",
            "2026-09-07",
        ),
        video(
            "l2",
            "Kuzya vs Kill [1on1 FINAL] ▶ UNBREAKABLE 2026 ◀ ⓒ .BBoy World | Belgium",
            "2026-09-07",
        ),
        video(
            "j1",
            "Extremo, Menno & Renegade // .BBoy World // JUDGES SHOWCASE | UNBREAKABLE 2026",
            "2026-09-07",
        ),
    ];

    let draft = draft(&videos, &series("Unbreakable"), &source);
    let (_, toml) = &draft.events[0];
    for line in [
        // The Saturday before the first upload, a Monday.
        "starts_on = 2026-09-05",
        "judges = [\"extremo\", \"menno\", \"renegade\"]",
        "{ round = \"top16\", a = \"orelia\", b = \"nicka\", winner = \"TODO\", video = \"https://youtu.be/g1\" },",
        "{ round = \"final\", a = \"los-crapulos\", b = \"ccu7\", winner = \"TODO\", video = \"https://youtu.be/c1\" },",
        "{ round = \"top8\", a = \"breaknuts\", b = \"hidden-trip\", winner = \"TODO\", video = \"https://youtu.be/b2\" },",
        "los-crapulos = { crew = \"los-crapulos\" }",
        "{ round = \"top4\", a = \"bruce-allmighty\", b = \"differ\", winner = \"TODO\", video = \"https://youtu.be/b1\" },",
    ] {
        assert!(toml.contains(line), "{line} not in\n{toml}");
    }
    assert!(
        !toml.contains("kopt-r"),
        "the other jam is excluded:\n{toml}"
    );
    assert!(
        !toml.contains("youtu.be/g2"),
        "a re-upload is the same match:\n{toml}"
    );
    assert!(draft.crews.contains_key("los-crapulos"));
    // `KIDZ CREW` names the kids' crew battle, not the crew battle.
    let kids_crew = &toml[toml
        .find("key = \"kids-crew\"")
        .expect("a kids crew battle")..];
    assert!(kids_crew.contains("youtu.be/kc1"), "{toml}");
    // A title naming no battle joins the battle of a match sharing an entrant; `Bboy World` names none.
    let bboy = &toml[toml.find("key = \"bboy\"").unwrap()..];
    assert!(
        bboy.contains("youtu.be/l1") && bboy.contains("youtu.be/l2"),
        "{toml}"
    );
}
