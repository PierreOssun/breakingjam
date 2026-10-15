//! Organisers: the public side of an account that runs jams, verified by Instagram (M12c).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use super::{
    claim::{ClaimStatus, ClaimUser},
    not_blank,
};

/// An organiser's page; never the account's email or role.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Organizer {
    /// The account id.
    pub id: Uuid,
    /// Public name, shown on their jams.
    pub display_name: String,
    /// Lower case, no `@`.
    pub instagram_handle: Option<String>,
    /// ISO 3166-1 alpha-2.
    pub country: Option<String>,
    /// Home city.
    pub city: Option<String>,
    /// Free text.
    pub bio: Option<String>,
    /// Set when an admin confirmed the handle; cleared when the handle changes.
    pub verified_at: Option<DateTime<Utc>>,
}

/// The organiser shown on a jam page: name, tick and where to contact them.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct OrganizerRef {
    /// The account id; the page is `/organizers/{id}`.
    pub id: Uuid,
    /// Public name.
    pub display_name: String,
    /// Lower case, no `@`.
    pub instagram_handle: Option<String>,
    /// Whether the handle is confirmed.
    pub verified: bool,
}

/// Everything an organiser sets on their page.
#[derive(Debug, Clone, Deserialize, Validate, utoipa::ToSchema)]
pub struct OrganizerFields {
    /// Public name, up to 80 characters; also the account's display name.
    #[validate(length(max = 80), custom(function = "not_blank"))]
    pub display_name: String,
    /// `@handle` or `handle`; unique case-insensitively. Changing it drops the tick.
    #[validate(custom(function = "crate::domain::instagram_handle"))]
    pub instagram_handle: Option<String>,
    /// ISO 3166-1 alpha-2.
    #[validate(custom(function = "crate::domain::country_code"))]
    pub country: Option<String>,
    /// Blank is stored as null.
    #[validate(length(max = 100))]
    pub city: Option<String>,
    /// Blank is stored as null.
    #[validate(length(max = 2000))]
    pub bio: Option<String>,
}

/// A request to confirm an organiser's Instagram handle.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct OrganizerClaim {
    /// Primary key, UUIDv7.
    pub id: Uuid,
    /// The organiser.
    pub user_id: Uuid,
    /// The handle as it was when the claim was opened; approval confirms this one.
    pub instagram_handle: String,
    /// Shown to the organiser, who puts it in their Instagram bio or DMs it to @breaking.jam.
    pub code: String,
    /// Review state.
    pub status: ClaimStatus,
    /// When an admin decided; null while pending.
    pub reviewed_at: Option<DateTime<Utc>>,
    /// When the claim was opened.
    pub created_at: DateTime<Utc>,
}

/// An organiser claim in the admin review queue.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct OrganizerClaimForReview {
    /// The claim itself.
    #[serde(flatten)]
    pub claim: OrganizerClaim,
    /// Who is asking.
    pub user: ClaimUser,
}
