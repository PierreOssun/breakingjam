//! Unit tests of `crate::auth::session`.

use uuid::Uuid;

use crate::{
    auth::session::*,
    domain::user::{Role, User},
    error::AppError,
};

fn current(role: Role) -> CurrentUser {
    CurrentUser {
        user: User {
            id: Uuid::nil(),
            email: "a@b.c".into(),
            display_name: "A".into(),
            role,
        },
        session_id: Uuid::nil(),
    }
}

#[test]
fn require_passes_for_higher_roles() {
    assert!(current(Role::Admin).require(Role::Organizer).is_ok());
    assert!(current(Role::Organizer).require(Role::Organizer).is_ok());
    assert!(matches!(
        current(Role::User).require(Role::Organizer),
        Err(AppError::Forbidden)
    ));
}
