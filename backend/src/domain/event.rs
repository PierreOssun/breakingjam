//! Jams (`events`): fields, status machine, visibility and write rules.

use std::fmt;

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;
use validator::{Validate, ValidationError};

use super::{
    country_code, not_blank, rule,
    user::{Role, User},
};

/// Lifecycle of a jam (§4 "Event status transitions").
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, utoipa::ToSchema,
)]
#[sqlx(type_name = "event_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum EventStatus {
    /// Being prepared; visible to its writers only.
    Draft,
    /// Announced and open for registration.
    Published,
    /// Announced, registration closed.
    RegistrationClosed,
    /// Took place.
    Completed,
    /// Called off.
    Cancelled,
}

impl fmt::Display for EventStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Draft => "draft",
            Self::Published => "published",
            Self::RegistrationClosed => "registration_closed",
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
        })
    }
}

/// An explicit status change: the last segment of `POST /events/{id}/{transition}`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Transition {
    /// `draft` → `published`.
    Publish,
    /// `published` → `registration_closed`.
    CloseRegistration,
    /// `registration_closed` → `completed`.
    Complete,
    /// `draft`, `published` or `registration_closed` → `cancelled`.
    Cancel,
}

impl fmt::Display for Transition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Publish => "publish",
            Self::CloseRegistration => "close-registration",
            Self::Complete => "complete",
            Self::Cancel => "cancel",
        })
    }
}

/// A transition that the current status does not allow.
#[derive(Debug, Error)]
#[error("cannot {transition} a {from} jam")]
pub struct InvalidTransition {
    /// The status the jam is in.
    pub from: EventStatus,
    /// What was asked for.
    pub transition: Transition,
}

impl EventStatus {
    /// The status after `transition`, following draft → published → registration_closed →
    /// completed, with cancel allowed from any state except completed (and cancelled).
    pub fn apply(self, transition: Transition) -> Result<Self, InvalidTransition> {
        use EventStatus::*;
        match (self, transition) {
            (Draft, Transition::Publish) => Ok(Published),
            (Published, Transition::CloseRegistration) => Ok(RegistrationClosed),
            (RegistrationClosed, Transition::Complete) => Ok(Completed),
            (Draft | Published | RegistrationClosed, Transition::Cancel) => Ok(Cancelled),
            (from, transition) => Err(InvalidTransition { from, transition }),
        }
    }
}

/// A stored jam.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Event {
    /// Primary key, UUIDv7.
    pub id: Uuid,
    /// The account that created it and owns it.
    pub organizer_id: Uuid,
    /// Display name.
    pub name: String,
    /// Stable public URL segment; never changes after creation.
    pub slug: String,
    /// Free text, null when blank.
    pub description: Option<String>,
    /// Where it is in its lifecycle.
    pub status: EventStatus,
    /// First day, in the jam's timezone.
    pub starts_on: NaiveDate,
    /// Last day, never before `starts_on`.
    pub ends_on: NaiveDate,
    /// IANA name, e.g. `Europe/Zurich`.
    pub timezone: String,
    /// Venue, null when blank.
    pub venue_name: Option<String>,
    /// Street address, null when blank.
    pub address: Option<String>,
    /// City shown on cards and in the map popup.
    pub city: String,
    /// ISO 3166-1 alpha-2.
    pub country: String,
    /// Latitude; set together with `lng` or not at all.
    pub lat: Option<f64>,
    /// Longitude; set together with `lat` or not at all.
    pub lng: Option<f64>,
    /// Where dancers sign up.
    pub registration_url: Option<String>,
    /// The jam's Instagram page.
    pub instagram_url: Option<String>,
    /// Row creation time.
    pub created_at: DateTime<Utc>,
    /// Last write, maintained by a trigger.
    pub updated_at: DateTime<Utc>,
}

/// Whether `user` may edit, delete or change the status of a jam owned by `organizer_id`.
pub fn can_write(user: &User, organizer_id: Uuid) -> bool {
    user.id == organizer_id || user.role >= Role::SeedAdmin
}

impl Event {
    /// Drafts are private to their writers; every other status is public.
    pub fn visible_to(&self, user: Option<&User>) -> bool {
        self.status != EventStatus::Draft || user.is_some_and(|u| can_write(u, self.organizer_id))
    }
}

/// Everything an organiser sets when creating or editing a jam.
#[derive(Debug, Clone, Deserialize, Validate, utoipa::ToSchema)]
#[validate(
    schema(function = "dates_in_order"),
    schema(function = "coords_together")
)]
pub struct EventFields {
    /// Display name, up to 200 characters.
    #[validate(length(max = 200), custom(function = "not_blank"))]
    pub name: String,
    /// Free text, up to 5000 characters; blank is stored as null.
    #[validate(length(max = 5000))]
    pub description: Option<String>,
    /// First day.
    pub starts_on: NaiveDate,
    /// Last day; must not be before `starts_on`.
    pub ends_on: NaiveDate,
    /// IANA name, e.g. `Europe/Zurich`.
    #[validate(custom(function = "iana_timezone"))]
    pub timezone: String,
    /// Venue; blank is stored as null.
    #[validate(length(max = 200))]
    pub venue_name: Option<String>,
    /// Street address; blank is stored as null.
    #[validate(length(max = 500))]
    pub address: Option<String>,
    /// City, up to 100 characters.
    #[validate(length(max = 100), custom(function = "not_blank"))]
    pub city: String,
    /// ISO 3166-1 alpha-2, upper case.
    #[validate(custom(function = "country_code"))]
    pub country: String,
    /// Latitude; set together with `lng` or not at all.
    #[validate(range(min = -90.0, max = 90.0))]
    pub lat: Option<f64>,
    /// Longitude; set together with `lat` or not at all.
    #[validate(range(min = -180.0, max = 180.0))]
    pub lng: Option<f64>,
    /// Where dancers sign up; blank is stored as null.
    #[validate(length(max = 500), custom(function = "web_url"))]
    pub registration_url: Option<String>,
    /// The jam's Instagram page; blank is stored as null.
    #[validate(length(max = 500), custom(function = "web_url"))]
    pub instagram_url: Option<String>,
}

fn dates_in_order(fields: &EventFields) -> Result<(), ValidationError> {
    if fields.ends_on < fields.starts_on {
        return Err(rule("ends_on", "must not be before starts_on"));
    }
    Ok(())
}

fn coords_together(fields: &EventFields) -> Result<(), ValidationError> {
    if fields.lat.is_some() != fields.lng.is_some() {
        return Err(rule("lat", "lat and lng must be set together"));
    }
    Ok(())
}

/// URL slug: the name's words plus the last 6 hex digits of the id, e.g. `paris-cypher-3f9a1c`.
pub fn slug(name: &str, id: Uuid) -> String {
    let id = id.simple().to_string();
    // Unicode-aware so non-Latin names keep their letters instead of collapsing to the suffix.
    name.split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(str::to_lowercase)
        .chain(std::iter::once(id[id.len() - 6..].to_string()))
        .collect::<Vec<_>>()
        .join("-")
}

/// Blank, or an absolute `http(s)://` link; other schemes would be rendered as `href`s.
fn web_url(value: &str) -> Result<(), ValidationError> {
    let value = value.trim();
    let rest = value
        .strip_prefix("https://")
        .or_else(|| value.strip_prefix("http://"));
    let is_link = rest.is_some_and(|r| !r.is_empty() && !r.contains(char::is_whitespace));
    if value.is_empty() || is_link {
        return Ok(());
    }
    Err(ValidationError::new("url").with_message("must start with http:// or https://".into()))
}

/// Shape check only (`Area/Location` or `UTC`); the full tz database is not embedded.
fn iana_timezone(value: &str) -> Result<(), ValidationError> {
    let allowed = |c: char| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-' | '+');
    let shaped = value.len() <= 64 && value.chars().all(allowed);
    if shaped && (value == "UTC" || value.split('/').filter(|p| !p.is_empty()).count() >= 2) {
        return Ok(());
    }
    Err(ValidationError::new("timezone")
        .with_message("must be an IANA timezone, e.g. Europe/Zurich".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use EventStatus::*;
    use Transition::*;

    #[test]
    fn transitions_follow_the_table() {
        assert_eq!(Draft.apply(Publish).unwrap(), Published);
        assert_eq!(
            Published.apply(CloseRegistration).unwrap(),
            RegistrationClosed
        );
        assert_eq!(RegistrationClosed.apply(Complete).unwrap(), Completed);
        for from in [Draft, Published, RegistrationClosed] {
            assert_eq!(from.apply(Cancel).unwrap(), Cancelled);
        }
    }

    #[test]
    fn transitions_reject_everything_else() {
        let invalid = [
            (Draft, CloseRegistration),
            (Draft, Complete),
            (Published, Publish),
            (Published, Complete),
            (RegistrationClosed, Publish),
            (Completed, Cancel),
            (Completed, Publish),
            (Cancelled, Cancel),
            (Cancelled, Publish),
        ];
        for (from, transition) in invalid {
            assert!(from.apply(transition).is_err(), "{from:?} + {transition:?}");
        }
    }

    #[test]
    fn slug_keeps_words_and_id_suffix() {
        let id = Uuid::parse_str("01920000-0000-7000-8000-0000003f9a1c").unwrap();
        assert_eq!(
            slug("Paris Cypher Sessions!", id),
            "paris-cypher-sessions-3f9a1c"
        );
        assert_eq!(slug("서울 잼", id), "서울-잼-3f9a1c");
    }

    #[test]
    fn writers_are_owner_or_seed_admin() {
        let user = |role| User {
            id: Uuid::now_v7(),
            email: String::new(),
            display_name: String::new(),
            role,
        };
        let organizer = user(Role::Organizer);
        assert!(can_write(&organizer, organizer.id));
        assert!(!can_write(&organizer, Uuid::now_v7()));
        assert!(can_write(&user(Role::SeedAdmin), Uuid::now_v7()));
    }

    #[test]
    fn timezone_and_country_shapes() {
        assert!(iana_timezone("Europe/Zurich").is_ok());
        assert!(iana_timezone("America/Argentina/Buenos_Aires").is_ok());
        assert!(iana_timezone("UTC").is_ok());
        assert!(iana_timezone("Zurich").is_err());
        assert!(iana_timezone("Europe/Zurich; drop").is_err());
        assert!(country_code("FR").is_ok());
        assert!(country_code("fr").is_err());
        assert!(country_code("FRA").is_err());
    }

    #[test]
    fn links_are_blank_or_http() {
        assert!(web_url("").is_ok());
        assert!(web_url("  ").is_ok());
        assert!(web_url("https://example.com/register").is_ok());
        assert!(web_url("http://example.com").is_ok());
        assert!(web_url("javascript:alert(1)").is_err());
        assert!(web_url("https://").is_err());
        assert!(web_url("https://exa mple.com").is_err());
        assert!(web_url("example.com").is_err());
    }

    #[test]
    fn invalid_transition_reads_like_the_api() {
        let err = RegistrationClosed.apply(CloseRegistration).unwrap_err();
        assert_eq!(
            err.to_string(),
            "cannot close-registration a registration_closed jam"
        );
    }
}
