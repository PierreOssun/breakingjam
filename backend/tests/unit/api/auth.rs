//! Unit tests of `crate::api::auth`.

use crate::api::auth::*;

#[test]
fn safe_next_rejects_other_origins() {
    assert_eq!(safe_next(Some("/org/jams/new")), "/org/jams/new");
    assert_eq!(safe_next(Some("//evil.com")), "/");
    assert_eq!(safe_next(Some("https://evil.com")), "/");
    assert_eq!(safe_next(Some("/\\evil.com")), "/");
    assert_eq!(safe_next(Some("/jams\nSet-Cookie: x=1")), "/");
    assert_eq!(safe_next(None), "/");
}
