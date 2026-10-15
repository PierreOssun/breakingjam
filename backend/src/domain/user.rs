//! Accounts and roles.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Account role; declaration order is privilege order, so `>=` means "at least".
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Serialize,
    Deserialize,
    sqlx::Type,
    utoipa::ToSchema,
)]
#[sqlx(type_name = "user_role", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum Role {
    /// Claims and edits unverified dancers.
    User,
    /// Creates and manages their own jams.
    Organizer,
    /// Edits any jam, dancer or crew; no claim review or user management.
    SeedAdmin,
    /// Everything.
    Admin,
}

/// A registered account, without credentials.
#[derive(Debug, Clone)]
pub struct User {
    /// Primary key, UUIDv7.
    pub id: Uuid,
    /// Login email, unique and case-insensitive.
    pub email: String,
    /// Public name.
    pub display_name: String,
    /// Privilege level.
    pub role: Role,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roles_are_ordered_by_privilege() {
        assert!(Role::User < Role::Organizer);
        assert!(Role::Organizer < Role::SeedAdmin);
        assert!(Role::SeedAdmin < Role::Admin);
    }
}
