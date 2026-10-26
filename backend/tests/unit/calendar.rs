//! Unit tests of `crate::calendar`.

use crate::calendar::*;

#[test]
fn text_escapes_what_ical_reserves() {
    assert_eq!(text("a\\b;c,d\ne"), "a\\\\b\\;c\\,d\\ne");
    assert_eq!(text("two\r\nlines"), "two\\nlines");
}

#[test]
fn text_never_breaks_out_of_its_property() {
    // A bare CR is a line break to some clients: it becomes an escaped one, never a raw one.
    assert_eq!(
        text("Paris Cypher\rURL:https://evil.example"),
        "Paris Cypher\\nURL:https://evil.example"
    );
    // A tab reads as a space; other control characters have no place in TEXT.
    assert_eq!(text("tab\there\u{7}\u{0}"), "tab here");
    assert!(!text("a\rb\nc\r\nd").contains(['\r', '\n']));
}

#[test]
fn long_lines_fold_after_75_octets() {
    let line = format!("SUMMARY:{}", "x".repeat(100));
    let folded = fold(&line);
    let parts: Vec<&str> = folded.trim_end_matches("\r\n").split("\r\n").collect();
    assert_eq!(parts.len(), 2);
    assert_eq!(parts[0].len(), 75);
    assert!(parts[1].starts_with(' '));
    assert_eq!(parts.concat().replace(' ', ""), line.replace(' ', ""));
}

#[test]
fn folding_never_splits_a_character() {
    // 37 two-octet letters fill 74 octets: the 38th would cross 75, so it moves down.
    let line = "é".repeat(40);
    let folded = fold(&line);
    let first = folded.split("\r\n").next().unwrap();
    assert_eq!(first.len(), 74);
    assert!(folded.split("\r\n").all(|part| part.len() <= 75));
}
