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

#[test]
fn a_new_account_skips_only_the_jam_form() {
    assert_eq!(after_sign_up("/org/jams/new"), "/");
    assert_eq!(
        after_sign_up("/dancers/01920000-0000-7000-8000-000000000001"),
        "/dancers/01920000-0000-7000-8000-000000000001"
    );
    assert_eq!(after_sign_up("/"), "/");
}
