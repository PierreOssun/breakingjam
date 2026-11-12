//! `/results`: the latest jams with battle winners, for the landing page's "Just happened".

use std::collections::HashMap;

use axum::{Json, extract::State};
use chrono::NaiveDate;
use serde::Serialize;
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use crate::{
    db::{self, events::FinishedJam},
    domain::battle::{Battle, Entry, EntryStatus, Match},
    error::AppError,
    state::AppState,
};

/// How many jams "Just happened" shows.
const LATEST: i64 = 3;
/// Winner lines per jam card; the other battles become "+N more".
const WINNERS: usize = 2;

/// `/results`, public.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(latest))
}

/// A jam that is over, with its first battles' winners.
#[derive(Debug, Serialize, ToSchema)]
pub struct JamResults {
    /// Jam id.
    pub id: Uuid,
    /// Display name.
    pub name: String,
    /// Link target `/jams/{slug}`.
    pub slug: String,
    /// First day.
    pub starts_on: NaiveDate,
    /// Last day.
    pub ends_on: NaiveDate,
    /// City.
    pub city: String,
    /// ISO 3166-1 alpha-2.
    pub country: String,
    /// The uploaded flyer at 540×675; null means the generated one.
    pub flyer_card_url: Option<String>,
    /// Whether a battle of the jam has a video.
    pub has_videos: bool,
    /// Every battle of the jam, with or without a winner.
    pub battle_count: usize,
    /// At most two winners, in battle display order.
    pub winners: Vec<Winner>,
}

/// Who won one battle.
#[derive(Debug, Serialize, ToSchema)]
pub struct Winner {
    /// The battle's display name.
    pub battle: String,
    /// The winning entry, with its members.
    pub entry: Entry,
}

/// The three announced jams that ended last and have a battle winner, the latest first.
#[utoipa::path(
    get,
    path = "/results",
    tag = "results",
    operation_id = "latest_results",
    responses((status = OK, body = Vec<JamResults>))
)]
async fn latest(State(state): State<AppState>) -> Result<Json<Vec<JamResults>>, AppError> {
    let jams = db::events::finished_with_winners(&state.pool, LATEST).await?;
    let jam_ids: Vec<Uuid> = jams.iter().map(|jam| jam.id).collect();
    let mut conn = state.pool.acquire().await?;
    let mut battles = db::battles::of_events(&mut *conn, &jam_ids).await?;
    let battle_ids: Vec<Uuid> = battles.values().flatten().map(|b| b.id).collect();
    let mut entries = db::battles::entries_of(&mut conn, &battle_ids).await?;
    let matches = db::battles::matches_of(&mut conn, &battle_ids).await?;
    Ok(Json(
        jams.into_iter()
            .map(|jam| {
                let battles = battles.remove(&jam.id).unwrap_or_default();
                results_of(jam, battles, &mut entries, &matches)
            })
            .collect(),
    ))
}

/// One jam's card: its videos flag, battle count and first winners.
fn results_of(
    jam: FinishedJam,
    battles: Vec<Battle>,
    entries: &mut HashMap<Uuid, Vec<Entry>>,
    matches: &HashMap<Uuid, Vec<Match>>,
) -> JamResults {
    let counts = |entry: &Entry| entry.status != EntryStatus::Withdrawn;
    // The same rule as the map's `has_videos`: a withdrawn entry's video is not shown.
    let has_videos = battles.iter().any(|battle| {
        let entry_video = entries.get(&battle.id).is_some_and(|all| {
            all.iter()
                .any(|entry| counts(entry) && entry.video_url.is_some())
        });
        let match_video = matches
            .get(&battle.id)
            .is_some_and(|all| all.iter().any(|m| m.video_url.is_some()));
        entry_video || match_video
    });
    let battle_count = battles.len();
    let winners = battles
        .into_iter()
        .filter_map(|battle| {
            let entry = entries
                .remove(&battle.id)?
                .into_iter()
                .find(|entry| counts(entry) && entry.final_rank == Some(1))?;
            Some(Winner {
                battle: battle.name,
                entry,
            })
        })
        .take(WINNERS)
        .collect();
    JamResults {
        id: jam.id,
        name: jam.name,
        slug: jam.slug,
        starts_on: jam.starts_on,
        ends_on: jam.ends_on,
        city: jam.city,
        country: jam.country,
        flyer_card_url: jam.flyer_card_url,
        has_videos,
        battle_count,
        winners,
    }
}
