//! Jams (`events`): fields, status machine, visibility and write rules.

use std::fmt;

use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;
use validator::{Validate, ValidateEmail, ValidationError};

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
    /// Submitted, waiting for an admin's approval; still visible to its writers only.
    InReview,
    /// Announced and open for registration.
    Published,
    /// Announced, registration closed.
    RegistrationClosed,
    /// Called off.
    Cancelled,
}

impl fmt::Display for EventStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Draft => "draft",
            Self::InReview => "in_review",
            Self::Published => "published",
            Self::RegistrationClosed => "registration_closed",
            Self::Cancelled => "cancelled",
        })
    }
}

/// An explicit status change: the last segment of `POST /events/{id}/{transition}`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Transition {
    /// `draft` → `in_review`: an organiser asks for the jam to go public.
    Submit,
    /// `draft` → `published` without review, for the BreakingJam team.
    Publish,
    /// `published` → `registration_closed`.
    CloseRegistration,
    /// Any status but `cancelled` → `cancelled`.
    Cancel,
}

impl fmt::Display for Transition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Submit => "submit",
            Self::Publish => "publish",
            Self::CloseRegistration => "close-registration",
            Self::Cancel => "cancel",
        })
    }
}

/// An admin's decision on a jam in review.
#[derive(Debug)]
pub enum Review {
    /// `in_review` → `published`.
    Approve,
    /// `in_review` → `draft`, with what the organiser should change.
    Reject(String),
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

impl Transition {
    /// The lowest role that may make this change on a jam it can write: publishing skips
    /// review, so it is the BreakingJam team's.
    pub fn required_role(self) -> Role {
        match self {
            Self::Publish => Role::SeedAdmin,
            _ => Role::User,
        }
    }

    /// Whether this is the step that takes a draft towards the public: it needs the checklist.
    pub fn announces(self) -> bool {
        matches!(self, Self::Submit | Self::Publish)
    }
}

/// What a draft still lacks to go public: the publish checklist, as the API checks it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Missing {
    /// City, country and the map pin.
    Place,
    /// At least one battle.
    Battle,
    /// An Instagram link or a contact email, so the BreakingJam team can reach the organiser
    /// before it goes public.
    Contact,
}

impl Missing {
    /// The field and message the API reports it under.
    pub fn as_field(self) -> (&'static str, &'static str) {
        match self {
            Self::Place => ("place", "add the city and the map pin"),
            Self::Battle => ("battles", "add at least one battle"),
            Self::Contact => ("contact", "add an Instagram link or a contact email"),
        }
    }
}

impl EventStatus {
    /// The status after `transition`, following draft → in_review → published →
    /// registration_closed (the team publishes drafts directly), with cancel allowed from any
    /// state but cancelled. Whether the jam is over is its dates' business, not its status'.
    pub fn apply(self, transition: Transition) -> Result<Self, InvalidTransition> {
        use EventStatus::*;
        match (self, transition) {
            (Draft, Transition::Submit) => Ok(InReview),
            (Draft, Transition::Publish) => Ok(Published),
            (Published, Transition::CloseRegistration) => Ok(RegistrationClosed),
            (Draft | InReview | Published | RegistrationClosed, Transition::Cancel) => {
                Ok(Cancelled)
            }
            (from, transition) => Err(InvalidTransition { from, transition }),
        }
    }

    /// The status after an admin's `review`; `None` unless the jam is in review.
    pub fn review(self, review: &Review) -> Option<Self> {
        (self == Self::InReview).then_some(match review {
            Review::Approve => Self::Published,
            Review::Reject(_) => Self::Draft,
        })
    }

    /// Drafts and jams in review are private to their writers.
    pub fn is_public(self) -> bool {
        match self {
            Self::Draft | Self::InReview => false,
            Self::Published | Self::RegistrationClosed | Self::Cancelled => true,
        }
    }
}

/// Where a jam is in time, by its own calendar: the `jam_phase` SQL function.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, utoipa::ToSchema,
)]
#[sqlx(type_name = "jam_phase", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    /// It starts after today.
    Upcoming,
    /// Today is one of its days.
    Live,
    /// It ended before today.
    Past,
}

/// Rows that come oldest first, split by phase: live and upcoming soonest first, past most
/// recent first, as the dancer and organiser pages list them.
pub fn by_phase<T>(rows: Vec<T>, phase: impl Fn(&T) -> Phase) -> [Vec<T>; 3] {
    let [mut live, mut upcoming, mut past] = [Vec::new(), Vec::new(), Vec::new()];
    for row in rows {
        match phase(&row) {
            Phase::Live => live.push(row),
            Phase::Upcoming => upcoming.push(row),
            Phase::Past => past.push(row),
        }
    }
    past.reverse();
    [live, upcoming, past]
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
    /// Where it is in time, by its own calendar.
    pub phase: Phase,
    /// First day, in the jam's timezone.
    pub starts_on: NaiveDate,
    /// Last day, never before `starts_on`.
    pub ends_on: NaiveDate,
    /// IANA name, e.g. `Europe/Zurich`.
    pub timezone: String,
    /// When it opens, as wall-clock time in its timezone; null until announced.
    pub opens_at: Option<NaiveTime>,
    /// When it closes, as wall-clock time in its timezone; null until announced.
    pub closes_at: Option<NaiveTime>,
    /// Venue, null when blank.
    pub venue_name: Option<String>,
    /// Street address, null when blank.
    pub address: Option<String>,
    /// City shown on cards and in the map popup; null while the venue is not set.
    pub city: Option<String>,
    /// ISO 3166-1 alpha-2; null while the venue is not set.
    pub country: Option<String>,
    /// Latitude; set together with `lng` or not at all.
    pub lat: Option<f64>,
    /// Longitude; set together with `lat` or not at all.
    pub lng: Option<f64>,
    /// Where dancers sign up.
    pub registration_url: Option<String>,
    /// The jam's Instagram page.
    pub instagram_url: Option<String>,
    /// The jam's own website.
    pub website_url: Option<String>,
    /// Where to write to the organisers; public.
    pub contact_email: Option<String>,
    /// The organiser's 1080×1350 flyer; null means the generated one.
    pub flyer_url: Option<String>,
    /// The same flyer at 540×675, for cards, lists and the map; set with `flyer_url`.
    pub flyer_card_url: Option<String>,
    /// Why an admin sent it back to draft; null otherwise.
    pub review_note: Option<String>,
    /// Row creation time.
    pub created_at: DateTime<Utc>,
    /// Last write, maintained by a trigger.
    pub updated_at: DateTime<Utc>,
}

/// Where an uploaded flyer is read from, in both sizes.
#[derive(Debug)]
pub struct UploadedFlyer {
    /// The 1080×1350 image of the jam page.
    pub url: String,
    /// The 540×675 image of cards, lists and the map.
    pub card_url: String,
}

/// Whether `user` writes the jam owned by `organizer_id`: its organiser or the BreakingJam team.
pub fn can_write(user: &User, organizer_id: Uuid) -> bool {
    user.id == organizer_id || user.role >= Role::SeedAdmin
}

impl Event {
    /// Drafts and jams in review are private to their writers; every other status is public.
    pub fn visible_to(&self, user: Option<&User>) -> bool {
        self.status.is_public() || user.is_some_and(|u| can_write(u, self.organizer_id))
    }

    /// Public and over: its organiser may still record its battles' results, nothing else.
    pub fn is_over(&self) -> bool {
        self.status.is_public() && self.phase == Phase::Past
    }

    /// Whether `user` may edit its details, flyer and lineup, change its status or delete it;
    /// the team still may once it is over, to fix history.
    pub fn editable_by(&self, user: &User) -> bool {
        can_write(user, self.organizer_id) && (!self.is_over() || user.role >= Role::SeedAdmin)
    }

    /// The status changes `user` may make now.
    pub fn actions(&self, user: &User) -> Vec<Transition> {
        use Transition::*;
        if !self.editable_by(user) {
            return Vec::new();
        }
        [Submit, Publish, CloseRegistration, Cancel]
            .into_iter()
            .filter(|t| user.role >= t.required_role() && self.status.apply(*t).is_ok())
            .collect()
    }

    /// Whether `fields` would take away the city, country or pin it has; blank counts as none.
    pub fn loses_place(&self, fields: &EventFields) -> bool {
        (self.city.is_some() && blank(&fields.city))
            || (self.country.is_some() && blank(&fields.country))
            || (self.lat.is_some() && fields.lat.is_none())
    }

    /// Whether `fields` would take away the last way to reach its organiser (Instagram or contact
    /// email) while it has one; blank counts as none.
    pub fn loses_contact(&self, fields: &EventFields) -> bool {
        let has = self.instagram_url.is_some() || self.contact_email.is_some();
        has && blank(&fields.instagram_url) && blank(&fields.contact_email)
    }

    /// What keeps the jam from going public, given how many battles it has; empty when ready.
    pub fn missing(&self, battles: usize) -> Vec<Missing> {
        let mut missing = Vec::new();
        if self.city.is_none() || self.country.is_none() || self.lat.is_none() {
            missing.push(Missing::Place);
        }
        if battles == 0 {
            missing.push(Missing::Battle);
        }
        if self.instagram_url.is_none() && self.contact_email.is_none() {
            missing.push(Missing::Contact);
        }
        missing
    }
}

/// Whether an optional text field is missing or only whitespace.
fn blank(value: &Option<String>) -> bool {
    value.as_deref().is_none_or(|v| v.trim().is_empty())
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
    /// A short pitch, up to 200 characters; blank is stored as null.
    #[validate(length(max = 200))]
    pub description: Option<String>,
    /// First day.
    pub starts_on: NaiveDate,
    /// Last day; must not be before `starts_on`.
    pub ends_on: NaiveDate,
    /// IANA name, e.g. `Europe/Zurich`.
    #[validate(custom(function = "iana_timezone"))]
    pub timezone: String,
    /// When it opens, `HH:MM` in its timezone; null when not announced.
    pub opens_at: Option<NaiveTime>,
    /// When it closes, `HH:MM` in its timezone; null when not announced.
    pub closes_at: Option<NaiveTime>,
    /// Venue; blank is stored as null.
    #[validate(length(max = 200))]
    pub venue_name: Option<String>,
    /// Street address; blank is stored as null.
    #[validate(length(max = 500))]
    pub address: Option<String>,
    /// City, up to 100 characters; blank is stored as null.
    #[validate(length(max = 100))]
    pub city: Option<String>,
    /// ISO 3166-1 alpha-2, upper case; null while the venue is not set.
    #[validate(custom(function = "country_code"))]
    pub country: Option<String>,
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
    /// The jam's own website; blank is stored as null.
    #[validate(length(max = 500), custom(function = "web_url"))]
    pub website_url: Option<String>,
    /// Public contact address; blank is stored as null.
    #[validate(length(max = 254), custom(function = "email_or_blank"))]
    pub contact_email: Option<String>,
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
pub(crate) fn web_url(value: &str) -> Result<(), ValidationError> {
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

/// Blank, or an email address.
pub(crate) fn email_or_blank(value: &str) -> Result<(), ValidationError> {
    let value = value.trim();
    if value.is_empty() || value.validate_email() {
        return Ok(());
    }
    Err(ValidationError::new("email").with_message("must be an email address".into()))
}

/// Shape check only (`Area/Location` or `UTC`); the full tz database is not embedded.
pub(crate) fn iana_timezone(value: &str) -> Result<(), ValidationError> {
    let allowed = |c: char| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-' | '+');
    let shaped = value.len() <= 64 && value.chars().all(allowed);
    if shaped && (value == "UTC" || value.split('/').filter(|p| !p.is_empty()).count() >= 2) {
        return Ok(());
    }
    Err(ValidationError::new("timezone")
        .with_message("must be an IANA timezone, e.g. Europe/Zurich".into()))
}
