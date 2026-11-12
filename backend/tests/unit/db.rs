//! Unit tests of `crate::db`.

use crate::db::*;

#[test]
fn contains_pattern_escapes_wildcards() {
    assert_eq!(contains_pattern("lil_g"), "%lil\\_g%");
    assert_eq!(contains_pattern("100%"), "%100\\%%");
}
