//! Unit tests of `crate::dataset::wikitext`.

use crate::dataset::wikitext::{country_code, flags, plain, split_outside, table_rows};

#[test]
fn table_rows_pair_cells_with_headers() {
    let table = r#"intro
{|class="wikitable"
|-
! scope="col" style="background:#efefef;" | Year
! scope="col" | First place
|-
! scope="row" style="background:#efefef;" | 2023
| {{flagicon|RUS}} Predatorz
|-
|2022 || {{flagicon|NED}} [[The Ruggeds|Ruggeds]]
|}
after"#;

    let rows = table_rows(table);
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0][0], ("year".into(), "2023".into()));
    assert_eq!(rows[0][1].0, "first place");
    assert_eq!(plain(&rows[0][1].1), "Predatorz");
    assert_eq!(plain(&rows[1][1].1), "Ruggeds");
}

#[test]
fn splits_ignore_separators_inside_templates_and_links() {
    assert_eq!(
        split_outside("{{flagicon|JPN}} A / {{flagicon|PRC}} B", "/"),
        ["{{flagicon|JPN}} A ", " {{flagicon|PRC}} B"]
    );
    assert_eq!(split_outside("[[A|B]] & C", "&"), ["[[A|B]] ", " C"]);
}

#[test]
fn flags_in_both_template_styles() {
    assert_eq!(
        flags(
            "{{flagicon|DZA}}{{flagicon|FRA}} Sarah Bee and {{#invoke:flag|icon|JAP}} Ayumi {{flagicon|}}"
        ),
        ["DZA", "FRA", "JAP"]
    );
}

#[test]
fn plain_drops_markup() {
    assert_eq!(
        plain("{{flagicon|NED}} '''[[Menno van Gorp|Menno]]'''<sup>2</sup>"),
        "Menno"
    );
    assert_eq!(plain("'''''Differ'''''<sup>2/2</sup>"), "Differ");
}

#[test]
fn flags_map_to_iso_codes() {
    for (flag, code) in [
        ("JAP", "JP"),
        ("Holland", "NL"),
        ("UK", "GB"),
        ("RSA", "ZA"),
        ("Taiwan", "TW"),
        ("PRC", "CN"),
        ("SVK", "SK"),
    ] {
        assert_eq!(country_code(flag), Some(code), "{flag}");
    }
    assert_eq!(country_code("Atlantis"), None);
}
