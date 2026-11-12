//! Unit tests of `crate::domain::place`.

use crate::domain::place::*;

#[test]
fn search_keys_ignore_case_accents_and_punctuation() {
    assert_eq!(search_key("Zürich"), "zurich");
    assert_eq!(search_key("  Saint-Louis "), "saint louis");
    assert_eq!(search_key("L'Haÿ-les-Roses"), "l hay les roses");
    assert_eq!(search_key("??"), "");
}

#[test]
fn reads_a_geonames_line_with_its_keys() {
    let line =
        "2657896\tZürich\tZurich\tZuerich,Zürich,ZRH,8001,Zur,Цюрих,\tCH\t47.36667\t8.55\t415367";
    let parsed = parse_geonames_line(line).unwrap();
    assert_eq!(parsed.geonames_id, 2657896);
    assert_eq!(
        parsed.place,
        Place {
            name: "Zürich".into(),
            country: "CH".into(),
            lat: 47.36667,
            lng: 8.55,
            population: 415367,
        }
    );
    assert_eq!(parsed.ascii_name, "Zurich");
    // Folded, without repeats or blanks: "Zürich" and "Zurich" are one key.
    assert_eq!(parsed.own_keys, ["zurich"]);
    // Codes ("ZRH", "8001") and short ASCII names ("Zur") are left out.
    assert_eq!(parsed.alternate_keys, ["zuerich", "цюрих"]);
}

#[test]
fn skips_lines_that_are_not_cities() {
    assert_eq!(parse_geonames_line(""), None);
    assert_eq!(parse_geonames_line("x\tName\tName\t\tFR\t1\t2\t3"), None);
    assert_eq!(parse_geonames_line("1\tName\tName\t\tFRA\t1\t2\t3"), None);
}
