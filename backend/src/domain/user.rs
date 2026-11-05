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

/// What a mailed code proves (M27).
#[derive(Debug, Clone, Copy, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "email_code_purpose", rename_all = "snake_case")]
pub enum CodePurpose {
    /// The account owns its email; ends the sign-up.
    VerifyEmail,
    /// The account's owner may choose a new password.
    ResetPassword,
}

/// A fresh 6-digit code, `000000` to `999999`.
pub fn random_code() -> String {
    // A v4 uuid is 122 bits from the OS's secure generator, so the remainder is as good as uniform.
    format!("{:06}", Uuid::new_v4().as_u128() % 1_000_000)
}
