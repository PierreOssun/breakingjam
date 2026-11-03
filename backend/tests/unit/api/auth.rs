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
fn a_new_account_is_welcomed_then_skips_only_the_jam_form() {
    assert_eq!(after_sign_up("/org/jams/new"), "/welcome?next=%2F");
    assert_eq!(
        after_sign_up("/dancers/01920000-0000-7000-8000-000000000001"),
        "/welcome?next=%2Fdancers%2F01920000-0000-7000-8000-000000000001"
    );
    assert_eq!(after_sign_up("/"), "/welcome?next=%2F");
    // A path's own query stays inside `next`.
    assert_eq!(
        after_sign_up("/search?q=lil g&x=1"),
        "/welcome?next=%2Fsearch%3Fq%3Dlil+g%26x%3D1"
    );
}
