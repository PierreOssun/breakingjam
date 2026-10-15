//! Unit tests of `crate::flyer`.

use sha1::{Digest, Sha1};

use crate::flyer::*;

fn sha(s: &str) -> String {
    Sha1::digest(s.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// The sample jams of the reference, with their palette and pose overrides.
fn sample(key: &str) -> (FlyerText, (Palette, Pose)) {
    let jam = |name: &str,
               dow: &str,
               day: &str,
               mon: &str,
               time: &str,
               city: &str,
               cc: &str,
               cats: &[&str]| FlyerText {
        name: name.into(),
        dow: dow.into(),
        day: day.into(),
        mon: mon.into(),
        time: Some(time.into()),
        city: city.into(),
        cc: cc.into(),
        cats: cats.iter().map(|c| (*c).to_owned()).collect(),
    };
    use Palette::*;
    use Pose::*;
    match key {
        "concrete" => (
            jam(
                "Concrete Cypher Vol. 3",
                "Sat",
                "14",
                "Nov",
                "13:00",
                "Zurich",
                "CH",
                &["1v1 Bboy", "1v1 Bgirl", "2v2"],
            ),
            (Klein, Handstand),
        ),
        "rooftop" => (
            jam(
                "Rooftop Sessions",
                "Sat",
                "21",
                "Nov",
                "14:00",
                "Lyon",
                "FR",
                &["1v1 Open", "3v3 Crew"],
            ),
            (Violet, Toprock),
        ),
        "kids" => (
            jam(
                "Kids Got Flavour",
                "Sun",
                "29",
                "Nov",
                "12:00",
                "Milan",
                "IT",
                &["Kids 1v1", "Kids 2v2"],
            ),
            (Ink, Toprock),
        ),
        "under" => (
            jam(
                "Underground Throwdown",
                "Sat",
                "05",
                "Dec",
                "15:00",
                "Berlin",
                "DE",
                &["1v1 Bboy", "1v1 Bgirl"],
            ),
            (Klein, Toprock),
        ),
        "seven" => (
            jam(
                "Seven to Smoke Night",
                "Sun",
                "15",
                "Nov",
                "19:00",
                "Winterthur",
                "CH",
                &["7 to Smoke"],
            ),
            (Violet, Handstand),
        ),
        "long" => (
            jam(
                "The International Breaking Championship of the Alps",
                "Sat",
                "12",
                "Dec",
                "11:00",
                "Innsbruck",
                "AT",
                &["1v1 Bboy", "1v1 Bgirl", "Crew 5v5"],
            ),
            (Ink, Toprock),
        ),
        _ => unreachable!(),
    }
}

// SHA-1 of the reference's output (fonts, escaping, xmlns and the §4.24 room patched as in
// the module docs; labelled except compact), produced by running
// generated-flyer-reference.py as a test oracle.
const FLYER: [(&str, &str, &str, &str); 6] = [
    (
        "concrete",
        "f8e4587f3689f4d916920b22563e1424cf09483d",
        "2006e5327ee17bf0561da5d3ee56fa6f1d352b1c",
        "7be45b8829aede6ab038265fbf239ccc9e1010b6",
    ),
    (
        "rooftop",
        "d2a2d865b1d2716a81ef3b2e7f60f4d8f5a2c45e",
        "bff8690d63b94702d0f81b7ee5a68dfaecfdea6a",
        "67f8094aca690aebc56165aaf8ae301383492610",
    ),
    (
        "kids",
        "dbb774a6c862a462a47dbbc5a3d2f91a38d2f8fc",
        "82989985ac76ad20ddb29e5023c17c5033a58073",
        "8f2594fdcd4936c9c5244dcc214d26545d2a9e39",
    ),
    (
        "under",
        "dcfcda590fdfc0357129e1d0f5832a915666e5f4",
        "95071ec18249c864a66c3365eb6a122e5ccf126c",
        "c270031ce8021af6f54f6e16ce823bcddc05c465",
    ),
    (
        "seven",
        "1728a6651e623b6e07f8a0d62d8fbb0f2af98eef",
        "1b20295f72f1a44cc033af004b9eadc8b6ffeab2",
        "adba6f59da18f656cb316865ead76829813855ab",
    ),
    (
        "long",
        "dff9c0b2d780653be56f2400688bcf331cace9dc",
        "57c8af9335b935445e4d66ba33e0db5bda1da757",
        "e4cf7679029078878e4587ba1b641db70dac3881",
    ),
];

const OG: [(&str, &str); 6] = [
    ("concrete", "a3b8e848f8692e2d411848a5573cab368341a482"),
    ("rooftop", "455ed029c83c748acf6303956a861cbc9bc282da"),
    ("kids", "d7efe1e31db53a226de4df4acaf58d5c378f240e"),
    ("under", "26259070fdaa4435463d76e049521511df5b5d92"),
    ("seven", "458dc3422d521f9bb7907ec7fa090b1d05ade357"),
    ("long", "64421720c80dd8865326d151a317f5c6aa58c7d9"),
];

#[test]
fn flyer_matches_the_reference_byte_for_byte() {
    for (key, full, compact, cancelled) in FLYER {
        let (text, look) = sample(key);
        // Compact gets the label too and must still come out `aria-hidden`.
        let options = |compact, cancelled| FlyerOptions {
            compact,
            label: "Generated flyer:",
            cancelled,
            uid: "f",
        };
        assert_eq!(
            sha(&flyer_svg(&text, look, options(false, None))),
            full,
            "{key}"
        );
        assert_eq!(
            sha(&flyer_svg(&text, look, options(true, None))),
            compact,
            "{key} compact"
        );
        assert_eq!(
            sha(&flyer_svg(&text, look, options(false, Some("CANCELLED")))),
            cancelled,
            "{key} cancelled"
        );
    }
}

#[test]
fn og_matches_the_reference_byte_for_byte() {
    for (key, expected) in OG {
        let (text, look) = sample(key);
        assert_eq!(sha(&og_svg(&text, look, "og")), expected, "{key}");
    }
}

#[test]
fn seed_matches_the_reference() {
    use Palette::*;
    use Pose::*;
    let cases = [
        ("jam_concrete_v3", (Violet, Toprock)),
        ("jam_rooftop", (Ink, Toprock)),
        ("jam_kids", (Violet, Toprock)),
        ("01a13b0b-73ad-76c9-891f-8f31857a8fb5", (Klein, Handstand)),
        ("01920000-0000-7000-8000-0000003f9a1c", (Ink, Handstand)),
        ("00000000-0000-0000-0000-000000000000", (Ink, Handstand)),
        ("a", (Violet, Toprock)),
        ("", (Violet, Handstand)),
    ];
    for (id, expected) in cases {
        assert_eq!(seed(id), expected, "{id:?}");
    }
}

#[test]
fn fit_name_matches_the_reference() {
    let flyer = |name| fit_name(name, FLYER_NAME);
    let og = |name| fit_name(name, OG_NAME);
    let lines = |l: &[&str]| l.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
    // (name, flyer fit, og fit), as the reference returns them with the §4.24 room.
    type Fit = (u32, &'static [&'static str]);
    let cases: [(&str, Fit, Fit); 12] = [
        (
            "Concrete Cypher Vol. 3",
            (40, &["Concrete", "Cypher", "Vol. 3"]),
            (84, &["Concrete", "Cypher", "Vol. 3"]),
        ),
        (
            "Rooftop Sessions",
            (46, &["Rooftop", "Sessions"]),
            (84, &["Rooftop", "Sessions"]),
        ),
        (
            "Kids Got Flavour",
            (46, &["Kids Got", "Flavour"]),
            (84, &["Kids Got", "Flavour"]),
        ),
        (
            "Underground Throwdown",
            (34, &["Underground", "Throwdown"]),
            (72, &["Underground", "Throwdown"]),
        ),
        (
            "Seven to Smoke Night",
            (40, &["Seven to", "Smoke", "Night"]),
            (84, &["Seven to", "Smoke", "Night"]),
        ),
        (
            "The International Breaking Championship of the Alps",
            (
                24,
                &[
                    "The International",
                    "Breaking",
                    "Championship of",
                    "the Alps",
                ],
            ),
            (50, &["The…"]),
        ),
        (
            "Supercalifragilisticexpialidocious Jam",
            (24, &["Supercalifragilisticexpialidocious", "Jam"]),
            (50, &["Supercalifragilisticexpialidocious…"]),
        ),
        (
            "A B C D E F G H I J K L M N O P Q R S T U V W X Y Z Jam",
            (
                28,
                &[
                    "A B C D E F G H",
                    "I J K L M N O P",
                    "Q R S T U V W X",
                    "Y Z Jam",
                ],
            ),
            (50, &["A B C D E F G H…"]),
        ),
        ("Jam", (46, &["Jam"]), (84, &["Jam"])),
        (
            "Battle of the Year Switzerland Qualifier",
            (28, &["Battle of the", "Year", "Switzerland", "Qualifier"]),
            (50, &["Battle of the", "Year Switzerland", "Qualifier"]),
        ),
        (
            "Paris Cypher Sessions",
            (40, &["Paris", "Cypher", "Sessions"]),
            (84, &["Paris", "Cypher", "Sessions"]),
        ),
        (
            "Bboy & Bgirl \"Open\" <Jam>",
            (34, &["Bboy & Bgirl", "\"Open\" <Jam>"]),
            (60, &["Bboy & Bgirl", "\"Open\" <Jam>"]),
        ),
    ];
    for (name, (ffs, flines), (ofs, olines)) in cases {
        assert_eq!(flyer(name), (ffs, lines(flines)), "flyer {name:?}");
        assert_eq!(og(name), (ofs, lines(olines)), "og {name:?}");
    }
}

#[test]
fn text_is_escaped_including_quotes() {
    let (mut text, look) = sample("concrete");
    text.name = r#"Jam" onload="alert(1)"#.into();
    text.city = "<script>".into();
    let svg = flyer_svg(
        &text,
        look,
        FlyerOptions {
            compact: false,
            label: "Generated flyer:",
            cancelled: None,
            uid: "f",
        },
    );
    assert!(!svg.contains(r#"" onload=""#));
    assert!(!svg.contains("<script>"));
    assert!(svg.contains("&quot;") && svg.contains("&lt;script&gt;"));
}

#[test]
fn missing_time_is_left_out() {
    let (mut text, look) = sample("concrete");
    text.time = None;
    let svg = flyer_svg(
        &text,
        look,
        FlyerOptions {
            compact: false,
            label: "Generated flyer:",
            cancelled: None,
            uid: "f",
        },
    );
    assert!(!svg.contains(r#"y="188""#), "no empty time line");
    let og = og_svg(&text, look, "og");
    assert!(og.contains(">SAT 14 NOV</text>"), "no dangling separator");
}

#[test]
fn og_without_battles_has_no_dangling_separator() {
    let (mut text, look) = sample("concrete");
    text.cats.clear();
    let og = og_svg(&text, look, "og");
    assert!(og.contains(">BREAKINGJAM.COM</text>"));
    assert!(!og.contains("·   BREAKINGJAM.COM"));
}

#[test]
fn categories_fit_their_line() {
    let names = |n: &[&str]| n.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>();
    let few = names(&["1v1 Bboy", "1v1 Bgirl", "2v2"]);
    assert_eq!(fit_categories(&few, 36), few);
    let many = names(&[
        "1v1 Bboy",
        "1v1 Bgirl",
        "2v2 Mixed",
        "Seven to Smoke",
        "Kids 1v1",
    ]);
    // "1v1 Bboy · 1v1 Bgirl · 2v2 Mixed · +2" is 37 characters: one over 36, within 40.
    assert_eq!(
        fit_categories(&many, 36),
        names(&["1v1 Bboy", "1v1 Bgirl", "+3"])
    );
    assert_eq!(
        fit_categories(&many, 40),
        names(&["1v1 Bboy", "1v1 Bgirl", "2v2 Mixed", "+2"])
    );
    let twice = names(&["1v1 Bboy", "1v1 Bboy"]);
    assert_eq!(fit_categories(&twice, 36), names(&["1v1 Bboy"]));
    let long = names(&["An extremely long battle name that cannot fit"]);
    assert_eq!(fit_categories(&long, 12), names(&["An extremel…"]));
    assert!(fit_categories(&[], 36).is_empty());
}

#[test]
fn og_png_is_a_1200_by_630_png() {
    let (text, look) = sample("long");
    let png = og_png(&og_svg(&text, look, "og")).unwrap();
    assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    // IHDR: width and height as big-endian u32 at bytes 16..24.
    assert_eq!(u32::from_be_bytes(png[16..20].try_into().unwrap()), 1200);
    assert_eq!(u32::from_be_bytes(png[20..24].try_into().unwrap()), 630);
}

#[test]
fn embedded_fonts_are_the_brand_fonts() {
    let families: Vec<String> = FONTS
        .faces()
        .flat_map(|face| face.families.iter().map(|(name, _)| name.clone()))
        .collect();
    assert!(families.contains(&"Unbounded".to_owned()), "{families:?}");
    assert!(families.contains(&"Manrope".to_owned()), "{families:?}");
}
