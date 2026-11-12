//! Unit tests of `crate::api::page`.

use crate::api::page::*;

#[test]
fn limit_defaults_and_clamps() {
    assert_eq!(limit(None), 50);
    assert_eq!(limit(Some(0)), 1);
    assert_eq!(limit(Some(1000)), 200);
}

#[test]
fn cursor_only_when_more_rows_exist() {
    let page = Page::from_rows(vec![1, 2, 3], 2, |n| n.to_string());
    assert_eq!(page.items, [1, 2]);
    assert_eq!(page.next_cursor.as_deref(), Some("2"));

    let last = Page::from_rows(vec![1, 2], 2, |n| n.to_string());
    assert_eq!(last.next_cursor, None);
}

#[test]
fn offset_cursor_counts_rows_and_never_overflows() {
    let page = Page::from_offset(vec![1, 2, 3], 2, 10);
    assert_eq!(page.next_cursor.as_deref(), Some("12"));
    let last = Page::from_offset(vec![1, 2, 3], 2, i64::MAX);
    assert_eq!(
        last.next_cursor.as_deref(),
        Some(i64::MAX.to_string().as_str())
    );
}
