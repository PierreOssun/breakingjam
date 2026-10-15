//! Crews and dated memberships.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use super::{country_code, not_blank};

/// A stored crew.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Crew {
    /// Primary key, UUIDv7.
    pub id: Uuid,
    /// Display name; not unique.
    pub name: String,
    /// ISO 3166-1 alpha-2.
    pub country: Option<String>,
    /// Home city.
    pub city: Option<String>,
    /// Lower case, no `@`.
    pub instagram_handle: Option<String>,
    /// Row creation time.
    pub created_at: DateTime<Utc>,
    /// Last write, maintained by a trigger.
    pub updated_at: DateTime<Utc>,
}

/// A crew as shown next to a dancer.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct CrewRef {
    /// Crew id.
    pub id: Uuid,
    /// Crew name.
    pub name: String,
    /// Join date; null when unknown.
    pub since: Option<NaiveDate>,
}

/// A current member as shown on a crew.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Member {
    /// Dancer id.
    pub dancer_id: Uuid,
    /// Stage name.
    pub dancer_name: String,
    /// Primary flag, ISO 3166-1 alpha-2.
    pub country: String,
    /// Join date; null when unknown.
    pub since: Option<NaiveDate>,
}

/// Everything set when creating or editing a crew.
#[derive(Debug, Clone, Deserialize, Validate, utoipa::ToSchema)]
pub struct CrewFields {
    /// Up to 100 characters.
    #[validate(length(max = 100), custom(function = "not_blank"))]
    pub name: String,
    /// ISO 3166-1 alpha-2, upper case; optional.
    #[validate(custom(function = "country_code"))]
    pub country: Option<String>,
    /// Blank is stored as null.
    #[validate(length(max = 100))]
    pub city: Option<String>,
    /// `@handle` or `handle`; blank is stored as null.
    #[validate(custom(function = "crate::domain::instagram_handle"))]
    pub instagram_handle: Option<String>,
}
