//! Accounts and roles.

use chrono::{DateTime, Utc};
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
    /// Everything but managing admins.
    Admin,
    /// Everything; the only one who makes or removes admins (M31). One at most, set with SQL.
    SuperAdmin,
}

impl Role {
    /// Whether this role may give an account whose role is `current` the team role `next` (M31).
    pub fn may_set(self, current: Role, next: TeamRole) -> bool {
        match self {
            Role::SuperAdmin => current < Role::SuperAdmin,
            Role::Admin => current <= Role::SeedAdmin && next != TeamRole::Admin,
            _ => false,
        }
    }
}

/// A place on the BreakingJam team, or none: what `PUT /admin/users/{id}/role` sets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum TeamRole {
    /// Off the team: `organizer` when the account owns a jam, else `user`.
    None,
    /// Enters and fixes jams, dancers and crews.
    SeedAdmin,
    /// Also reviews jams and claims, merges dancers and manages seed admins.
    Admin,
}

impl TeamRole {
    /// Every team role, from none up.
    pub const ALL: [TeamRole; 3] = [TeamRole::None, TeamRole::SeedAdmin, TeamRole::Admin];

    /// The role it grants; `None` when the account's jams decide.
    pub fn role(self) -> Option<Role> {
        match self {
            TeamRole::None => None,
            TeamRole::SeedAdmin => Some(Role::SeedAdmin),
            TeamRole::Admin => Some(Role::Admin),
        }
    }
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

/// A row of the admin Accounts tab (M31).
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct Account {
    /// Account id.
    pub id: Uuid,
    /// Login email.
    pub email: String,
    /// Public name.
    pub display_name: String,
    /// Privilege level.
    pub role: Role,
    /// Sign-up time.
    pub created_at: DateTime<Utc>,
    /// When the email was confirmed; null while it is not.
    pub email_verified_at: Option<DateTime<Utc>>,
    /// Last login or visit; null when never seen since M31 and without a session.
    pub last_seen_at: Option<DateTime<Utc>>,
    /// Its own public jams (the team's left out).
    pub public_jams: i64,
    /// Its own drafts and jams in review.
    pub private_jams: i64,
}

/// An account as the Accounts tab shows it to one admin, with what that admin may change.
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct AccountRow {
    /// The account itself.
    #[serde(flatten)]
    pub account: Account,
    /// The team roles the viewer may give it; empty for their own account and those above them.
    pub team_roles: Vec<TeamRole>,
}

impl AccountRow {
    /// `account` as `viewer` sees it.
    pub fn new(account: Account, viewer: &User) -> Self {
        let team_roles = if account.id == viewer.id {
            Vec::new()
        } else {
            TeamRole::ALL
                .into_iter()
                .filter(|next| viewer.role.may_set(account.role, *next))
                .collect()
        };
        Self {
            account,
            team_roles,
        }
    }
}

/// Which accounts the Accounts tab lists, and in which order (M31).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum AccountView {
    /// Seen at least once, the most recent first.
    #[default]
    LastSeen,
    /// Confirmed accounts, the most recently confirmed first.
    New,
    /// Accounts that never confirmed their email, the newest first.
    Unconfirmed,
    /// Accounts with at least one jam of their own, the newest first.
    Organizers,
    /// `seed_admin` and above, the newest first.
    Team,
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
