//! Asking to enter a battle "with approval" (M32): what the dancer sends and what each side sees.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use super::{claim::ClaimStatus, dancer::DancerRef};

/// What a dancer sends: for a team battle, the team's name and the teammates beside them.
#[derive(Debug, Clone, Default, Deserialize, Validate, utoipa::ToSchema)]
pub struct RequestFields {
    /// The team's name; null for a solo battle, blank is stored as null.
    #[validate(length(max = 100))]
    pub team_name: Option<String>,
    /// The other members, by page; empty for a solo battle. The asker leads the team.
    #[serde(default)]
    #[validate(length(max = 9))]
    pub teammates: Vec<Uuid>,
}

/// The asker's view of their latest request in a battle.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct MyRequest {
    /// Primary key, UUIDv7.
    pub id: Uuid,
    /// The battle asked for.
    pub battle_id: Uuid,
    /// Pending until the organiser answers.
    pub status: ClaimStatus,
}

/// Someone a request would enter, as its organiser sees them.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct RequestMember {
    /// The page; its Instagram handle is sent even when hidden on the page (the dancer was told).
    #[serde(flatten)]
    pub dancer: DancerRef,
    /// The handle is hidden on the public page.
    pub instagram_hidden: bool,
    /// The page is verified.
    pub verified: bool,
}

/// A request waiting for the organiser, with who it would enter.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct BattleRequest {
    /// Primary key, UUIDv7.
    pub id: Uuid,
    /// The battle asked for.
    pub battle_id: Uuid,
    /// The team's name; null for a solo battle.
    pub team_name: Option<String>,
    /// When it was sent.
    pub created_at: DateTime<Utc>,
    /// The asker first, then their teammates.
    pub members: Vec<RequestMember>,
}

/// The jams of an organiser with requests waiting, for the account menu.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct WaitingRequests {
    /// The jam.
    pub id: Uuid,
    /// Its name.
    pub name: String,
    /// Its page.
    pub slug: String,
    /// Requests waiting in its battles.
    pub count: i64,
}
