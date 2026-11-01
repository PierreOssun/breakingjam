//! Unit tests, kept out of the source files: compiled into the crate under `cfg(test)`
//! (see `src/lib.rs`), so they reach `pub(crate)` items. Integration tests live in `tests/*.rs`.

mod api;
mod auth;
mod calendar;
mod config;
mod dataset;
mod db;
mod domain;
mod error;
mod flyer;
mod media;

use chrono::{NaiveDate, Utc};
use uuid::Uuid;

use crate::domain::event::{Event, EventStatus};

/// A draft as the start sheet creates it: a name, a day and a timezone, nothing else.
pub(crate) fn bare_draft() -> Event {
    let now = Utc::now();
    let day = NaiveDate::from_ymd_opt(2030, 12, 12).unwrap();
    Event {
        id: Uuid::now_v7(),
        organizer_id: Uuid::now_v7(),
        name: "Winter Cypher Jam".into(),
        slug: "winter-cypher-jam-000000".into(),
        description: None,
        status: EventStatus::Draft,
        starts_on: day,
        ends_on: day,
        timezone: "Europe/Zurich".into(),
        opens_at: None,
        closes_at: None,
        venue_name: None,
        address: None,
        city: None,
        country: None,
        lat: None,
        lng: None,
        registration_url: None,
        instagram_url: None,
        website_url: None,
        contact_email: None,
        flyer_url: None,
        flyer_card_url: None,
        review_note: None,
        created_at: now,
        updated_at: now,
    }
}
