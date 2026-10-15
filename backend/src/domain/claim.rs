//! "Verify me" claims: a user asks to own a dancer page, an admin checks Instagram (§4).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::dancer::DancerRef;

/// Review state of a claim.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, utoipa::ToSchema,
)]
#[sqlx(type_name = "claim_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum ClaimStatus {
    /// Waiting for an admin.
    Pending,
    /// The user now owns the page.
    Approved,
    /// Turned down; the user may claim again.
    Rejected,
}

/// A claim as its author sees it.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Claim {
    /// Primary key, UUIDv7.
    pub id: Uuid,
    /// The page being claimed.
    pub dancer_id: Uuid,
    /// The account claiming it.
    pub user_id: Uuid,
    /// Shown to the user, who puts it in their Instagram bio or DMs it to @breaking.jam.
    pub code: String,
    /// Review state.
    pub status: ClaimStatus,
    /// When an admin decided; null while pending.
    pub reviewed_at: Option<DateTime<Utc>>,
    /// When the claim was opened.
    pub created_at: DateTime<Utc>,
}

/// A claim in the admin review queue, with who is claiming which page.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ClaimForReview {
    /// The claim itself.
    #[serde(flatten)]
    pub claim: Claim,
    /// The page being claimed.
    pub dancer: DancerRef,
    /// Who is claiming it.
    pub user: ClaimUser,
}

/// The account behind a claim.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct ClaimUser {
    /// Account id.
    pub id: Uuid,
    /// Login email, so the admin can reach them.
    pub email: String,
    /// Public name.
    pub display_name: String,
}

/// No 0/O, 1/I/L: the code is read off a screen and typed into Instagram.
pub(crate) const CODE_ALPHABET: &[u8] = b"23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/// A fresh claim code, `BJ-` + 4 characters, e.g. `BJ-7K2M`.
pub fn new_code() -> String {
    let random = Uuid::new_v4();
    let chars: String = random.as_bytes()[..4]
        .iter()
        .map(|b| CODE_ALPHABET[usize::from(*b) % CODE_ALPHABET.len()] as char)
        .collect();
    format!("BJ-{chars}")
}
