//! The jams still to come of `data/upcoming.toml`, written as the team would enter them on the site.

use std::{collections::BTreeSet, io::ErrorKind, path::Path};

use chrono::NaiveDate;
use serde::Deserialize;
use sqlx::PgConnection;
use thiserror::Error;
use uuid::Uuid;
use validator::Validate;

use super::is_key;
use crate::{
    db,
    domain::{
        battle::{self, BattleFields, MAX_BATTLES},
        event::{EventFields, EventStatus},
    },
};

/// One upcoming jam: its key, the jam editor's fields and its battles (the file's `sources` are
/// for reviewers).
#[derive(Debug, Deserialize)]
pub struct UpcomingJam {
    /// Lower-case words joined by `-`, never changed: how an import finds the jam again.
    pub key: String,
    /// The jam, as `POST /api/events` takes it.
    #[serde(flatten)]
    pub fields: EventFields,
    /// Its battles, as `POST /api/events/{id}/battles` takes them.
    pub battles: Vec<BattleFields>,
}

/// The file's shape: a list of jams.
#[derive(Deserialize)]
struct UpcomingFile {
    jams: Vec<UpcomingJam>,
}

/// What an import of upcoming jams wrote.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Added {
    /// Jams written, published or drafts.
    pub jams: usize,
    /// The jams left as drafts, each with what its publish checklist lacks.
    pub drafts: Vec<String>,
    /// Jams an earlier import wrote, deleted ones included, left as the site has them.
    pub already: usize,
}

/// Why the upcoming jams were not read or written.
#[derive(Debug, Error)]
pub enum UpcomingError {
    /// The file can't be read.
    #[error("upcoming.toml: {0}")]
    Read(#[from] std::io::Error),
    /// The file isn't a list of jams.
    #[error("upcoming.toml: {0}")]
    Parse(#[from] toml::de::Error),
    /// A jam or battle the API would refuse, or a key used twice.
    #[error("upcoming.toml: {0}")]
    Invalid(String),
    /// A query failed.
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Reads `upcoming.toml` from the data folder `dir`; a folder without one has no upcoming jams.
pub fn load(dir: &Path) -> Result<Vec<UpcomingJam>, UpcomingError> {
    let text = match std::fs::read_to_string(dir.join("upcoming.toml")) {
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        read => read?,
    };
    let jams = toml::from_str::<UpcomingFile>(&text)?.jams;
    let mut keys = BTreeSet::new();
    if let Some(jam) = jams.iter().find(|jam| !keys.insert(&jam.key)) {
        return Err(UpcomingError::Invalid(format!(
            "key {} is used twice",
            jam.key
        )));
    }
    Ok(jams)
}

impl UpcomingJam {
    /// What the API would refuse in this jam or its battles, if anything (but for its timezone,
    /// which only Postgres knows).
    pub fn check(&self) -> Result<(), String> {
        let name = &self.fields.name;
        if !is_key(&self.key) {
            return Err(format!("{name}: key must be lower-case words joined by -"));
        }
        self.fields.validate().map_err(|e| format!("{name}: {e}"))?;
        if self.battles.len() > MAX_BATTLES {
            return Err(format!("{name}: more than {MAX_BATTLES} battles"));
        }
        for fields in &self.battles {
            let refused = match fields.validate() {
                Err(e) => Some(e.to_string()),
                Ok(()) if !self.starts_during_the_jam(fields) => {
                    Some("starts outside the jam's days".into())
                }
                Ok(()) => None,
            };
            if let Some(why) = refused {
                return Err(format!("{name}: {}: {why}", fields.display_name()));
            }
        }
        Ok(())
    }

    /// The jam's `events.data_key`: a past jam's key holds a `/`, never a `:`, so the two never meet.
    fn data_key(&self) -> String {
        format!("upcoming:{}", self.key)
    }

    fn starts_during_the_jam(&self, fields: &BattleFields) -> bool {
        battle::starts_during(fields.starts_at, self.fields.starts_on, self.fields.ends_on)
    }
}

/// Writes the jams not over by `today` that no earlier import wrote, owned by `team`: published
/// when the publish checklist holds, else drafts. Stops at the first jam the API would refuse,
/// so the caller's transaction writes none.
pub async fn insert(
    conn: &mut PgConnection,
    jams: &[UpcomingJam],
    team: Uuid,
    today: NaiveDate,
) -> Result<Added, UpcomingError> {
    let before: BTreeSet<String> = db::dataset::event_keys(conn).await?.into_iter().collect();
    let mut added = Added::default();
    for jam in jams.iter().filter(|jam| jam.fields.ends_on >= today) {
        jam.check().map_err(UpcomingError::Invalid)?;
        let key = jam.data_key();
        if before.contains(&key) {
            added.already += 1;
            continue;
        }
        let (name, timezone) = (&jam.fields.name, &jam.fields.timezone);
        if !db::events::known_timezone(&mut *conn, timezone).await? {
            let why = format!("{name}: Postgres doesn't know the timezone {timezone}");
            return Err(UpcomingError::Invalid(why));
        }
        let event = db::events::insert(&mut *conn, Uuid::now_v7(), team, &jam.fields).await?;
        for fields in &jam.battles {
            db::battles::insert(&mut *conn, event.id, &fields.display_name(), fields).await?;
        }
        let lacks: Vec<&str> = event
            .missing(jam.battles.len())
            .into_iter()
            .map(|missing| missing.as_field().1)
            .collect();
        let status = if lacks.is_empty() {
            EventStatus::Published
        } else {
            added.drafts.push(format!("{name}: {}", lacks.join(", ")));
            EventStatus::Draft
        };
        db::dataset::set_imported(conn, event.id, &key, status).await?;
        added.jams += 1;
    }
    Ok(added)
}
