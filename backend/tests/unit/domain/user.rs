//! Unit tests of `crate::domain::user`.

use crate::domain::user::*;

#[test]
fn roles_are_ordered_by_privilege() {
    assert!(Role::User < Role::Organizer);
    assert!(Role::Organizer < Role::SeedAdmin);
    assert!(Role::SeedAdmin < Role::Admin);
    assert!(Role::Admin < Role::SuperAdmin);
}

#[test]
fn the_super_admin_manages_admins_and_admins_manage_seed_admins() {
    use TeamRole::{Admin, None, SeedAdmin};
    for current in [Role::User, Role::Organizer, Role::SeedAdmin, Role::Admin] {
        for next in [None, SeedAdmin, Admin] {
            assert!(
                Role::SuperAdmin.may_set(current, next),
                "{current:?} → {next:?}"
            );
        }
    }
    assert!(!Role::SuperAdmin.may_set(Role::SuperAdmin, None));

    for current in [Role::User, Role::Organizer, Role::SeedAdmin] {
        assert!(Role::Admin.may_set(current, SeedAdmin));
        assert!(Role::Admin.may_set(current, None));
        assert!(!Role::Admin.may_set(current, Admin));
    }
    for current in [Role::Admin, Role::SuperAdmin] {
        assert!(!Role::Admin.may_set(current, None));
        assert!(!Role::Admin.may_set(current, SeedAdmin));
    }

    for below in [Role::User, Role::Organizer, Role::SeedAdmin] {
        assert!(!below.may_set(Role::User, SeedAdmin));
    }
}

#[test]
fn codes_are_six_digits() {
    for _ in 0..1000 {
        let code = random_code();
        assert_eq!(code.len(), 6);
        assert!(code.bytes().all(|b| b.is_ascii_digit()));
    }
}
