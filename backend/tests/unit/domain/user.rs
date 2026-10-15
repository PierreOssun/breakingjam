//! Unit tests of `crate::domain::user`.

use crate::domain::user::*;

#[test]
fn roles_are_ordered_by_privilege() {
    assert!(Role::User < Role::Organizer);
    assert!(Role::Organizer < Role::SeedAdmin);
    assert!(Role::SeedAdmin < Role::Admin);
}
