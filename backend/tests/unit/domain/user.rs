//! Unit tests of `crate::domain::user`.

use crate::domain::user::*;

#[test]
fn roles_are_ordered_by_privilege() {
    assert!(Role::User < Role::Organizer);
    assert!(Role::Organizer < Role::SeedAdmin);
    assert!(Role::SeedAdmin < Role::Admin);
}

#[test]
fn codes_are_six_digits() {
    for _ in 0..1000 {
        let code = random_code();
        assert_eq!(code.len(), 6);
        assert!(code.bytes().all(|b| b.is_ascii_digit()));
    }
}
