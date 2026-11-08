//! Writes the jams of `data/` that pass `check` into the database, with the dancers and crews they name.

use std::collections::{BTreeMap, BTreeSet};

use sqlx::PgConnection;
use thiserror::Error;
use uuid::Uuid;
use validator::Validate;

use super::{
    BattleRecord, Dataset, EventRecord, Standing,
    check::{Kind, Problem, check},
};
use crate::{
    db,
    domain::{
        battle::{
            BattleAge, BattleFields, BattleFormat, EntryFields, EntryStatus, MatchFields,
            MatchRound, StaffRole, canonical_video,
        },
        event::{EventFields, EventStatus},
    },
};

/// What an import wrote, and what it left out.
#[derive(Debug, Default)]
pub struct Imported {
    /// Jams written.
    pub events: usize,
    /// Ids of the dancers written, by dancer key.
    pub dancers: BTreeMap<String, Uuid>,
    /// Crews written.
    pub crews: usize,
    /// Jams and battles left out, each with why.
    pub skipped: Vec<String>,
}

/// Why the import stopped.
#[derive(Debug, Error)]
pub enum ImportError {
    /// A query failed.
    #[error(transparent)]
    Db(#[from] sqlx::Error),
    /// A jam names a dancer or crew the import didn't write; `check` should have caught it.
    #[error("{0} is not in the dataset")]
    Unknown(String),
}

/// Who owns the imported jams, and the ids written so far.
struct Context<'a> {
    data: &'a Dataset,
    organizer: Uuid,
    dancers: BTreeMap<String, Uuid>,
    crews: BTreeMap<String, Uuid>,
}

/// Writes every jam that passes `check`, published and owned by `organizer`; its dates say
/// whether it is over.
pub async fn insert_all(
    conn: &mut PgConnection,
    data: &Dataset,
    organizer: Uuid,
) -> Result<Imported, ImportError> {
    let errors = check(data).errors;
    let (events, skipped) = importable(data, &errors);
    let (dancer_keys, crew_keys) = needed(data, &events, &errors);
    let mut cx = Context {
        data,
        organizer,
        dancers: BTreeMap::new(),
        crews: BTreeMap::new(),
    };
    for key in crew_keys {
        cx.crews.insert(
            key.to_owned(),
            db::dataset::insert_crew(conn, &data.crews[key]).await?,
        );
    }
    for key in dancer_keys {
        let dancer = &data.dancers[key];
        let id = db::dataset::insert_dancer(conn, key, dancer, organizer).await?;
        for crew in dancer.crews.iter().filter_map(|crew| cx.crews.get(crew)) {
            db::dataset::add_membership(conn, id, *crew).await?;
        }
        cx.dancers.insert(key.to_owned(), id);
    }
    let mut imported = Imported {
        skipped,
        crews: cx.crews.len(),
        ..Imported::default()
    };
    for key in &events {
        match insert_event(conn, &data.events[*key], &cx).await? {
            Written::Event { skipped_battles } => {
                imported.events += 1;
                imported
                    .skipped
                    .extend(skipped_battles.into_iter().map(|b| format!("{key}: {b}")));
            }
            Written::Refused(why) => imported.skipped.push(format!("{key}: {why}")),
        }
    }
    imported.dancers = cx.dancers;
    Ok(imported)
}

/// The jams with no broken rule, naming no dancer or crew with one; the others, with why.
fn importable<'a>(data: &'a Dataset, problems: &[Problem]) -> (Vec<&'a str>, Vec<String>) {
    let (bad_events, bad_dancers, bad_crews) = (
        broken(problems, Kind::Event),
        broken(problems, Kind::Dancer),
        broken(problems, Kind::Crew),
    );
    let (mut events, mut skipped) = (Vec::new(), Vec::new());
    for (key, event) in &data.events {
        let bad_dancer = dancers_of(event).find(|d| bad_dancers.contains(d));
        let bad_crew = crews_of(data, event).find(|c| bad_crews.contains(c));
        match (bad_events.contains(key.as_str()), bad_dancer, bad_crew) {
            (true, ..) => skipped.push(format!("{key}: breaks a rule of `data check`")),
            (_, Some(dancer), _) => skipped.push(format!("{key}: dancer {dancer} breaks a rule")),
            (_, _, Some(crew)) => skipped.push(format!("{key}: crew {crew} breaks a rule")),
            _ => events.push(key.as_str()),
        }
    }
    (events, skipped)
}

/// The keys of the `kind` that break a rule of `data check`.
fn broken(problems: &[Problem], kind: Kind) -> BTreeSet<&str> {
    problems
        .iter()
        .filter(|p| p.kind == kind)
        .map(|p| p.key.as_str())
        .collect()
}

/// Every dancer of `dancers.toml`, in a jam or not, and the crews the jams' teams and those
/// dancers name; none that breaks a rule.
fn needed<'a>(
    data: &'a Dataset,
    events: &[&str],
    problems: &[Problem],
) -> (BTreeSet<&'a str>, BTreeSet<&'a str>) {
    let (bad_dancers, bad_crews) = (broken(problems, Kind::Dancer), broken(problems, Kind::Crew));
    let dancers: BTreeSet<&str> = data
        .dancers
        .keys()
        .map(String::as_str)
        .filter(|key| !bad_dancers.contains(key))
        .collect();
    let teams = events
        .iter()
        .flat_map(|key| &data.events[*key].battles)
        .flat_map(|battle| {
            battle
                .teams
                .values()
                .filter_map(|team| team.crew.as_deref())
        });
    let members = dancers
        .iter()
        .flat_map(|key| &data.dancers[*key].crews)
        .map(String::as_str)
        .filter(|crew| data.crews.contains_key(*crew) && !bad_crews.contains(crew));
    let crews = teams.chain(members).collect();
    (dancers, crews)
}

fn dancers_of(event: &EventRecord) -> impl Iterator<Item = &str> {
    let staff = event
        .judges
        .iter()
        .chain(&event.mcs)
        .chain(&event.djs)
        .map(String::as_str);
    let entrants = event.battles.iter().flat_map(|battle| {
        let solo = (!battle.is_team_battle()).then(|| {
            battle
                .matches
                .iter()
                .flat_map(|m| [m.a.as_str(), m.b.as_str()])
        });
        let results =
            (!battle.is_team_battle()).then(|| battle.results.iter().map(|r| r.entrant.as_str()));
        let members = battle
            .teams
            .values()
            .flat_map(|team| team.members.iter().map(String::as_str));
        solo.into_iter()
            .flatten()
            .chain(results.into_iter().flatten())
            .chain(members)
    });
    staff.chain(entrants)
}

/// The crews a jam's teams dance for, and those of its dancers that are in the dataset.
fn crews_of<'a>(data: &'a Dataset, event: &'a EventRecord) -> impl Iterator<Item = &'a str> {
    let teams = event
        .battles
        .iter()
        .flat_map(|b| b.teams.values().filter_map(|team| team.crew.as_deref()));
    let dancers = dancers_of(event)
        .flat_map(|d| data.dancers.get(d))
        .flat_map(|d| d.crews.iter().map(String::as_str))
        .filter(|c| data.crews.contains_key(*c));
    teams.chain(dancers)
}

/// What became of one jam.
enum Written {
    /// Written, but for the battles the battle rules refused.
    Event { skipped_battles: Vec<String> },
    /// Refused by the jam rules, with why.
    Refused(String),
}

/// Writes one jam with its staff and battles, unless the API's rules refuse it.
async fn insert_event(
    conn: &mut PgConnection,
    event: &EventRecord,
    cx: &Context<'_>,
) -> Result<Written, ImportError> {
    let fields = event_fields(event);
    if let Err(errors) = fields.validate() {
        return Ok(Written::Refused(format!(
            "refused by the jam rules: {errors}"
        )));
    }
    // `jam_phase` reads the jam's calendar in its timezone, as the API makes sure on every save.
    if !db::events::known_timezone(&mut *conn, &fields.timezone).await? {
        return Ok(Written::Refused(format!(
            "timezone {:?} unknown to Postgres",
            fields.timezone
        )));
    }
    let id = db::events::insert(&mut *conn, Uuid::now_v7(), cx.organizer, &fields)
        .await?
        .id;
    db::dataset::set_status(conn, id, EventStatus::Published).await?;
    for (role, keys) in [
        (StaffRole::Judge, &event.judges),
        (StaffRole::Mc, &event.mcs),
        (StaffRole::Dj, &event.djs),
    ] {
        for key in keys {
            db::dataset::add_staff(conn, id, dancer_id(cx, key)?, role).await?;
        }
    }
    let mut skipped = Vec::new();
    for battle in &event.battles {
        let fields = battle_fields(battle);
        if let Err(errors) = fields.validate() {
            skipped.push(format!(
                "battle {} refused by the battle rules: {errors}",
                battle.key
            ));
            continue;
        }
        let battle_id = db::battles::insert(&mut *conn, id, &battle.name, &fields)
            .await?
            .id;
        // `check` passed, so the bracket holds. Teams may be known by name only, so only the
        // result rules the schema enforces apply; one refused there would abort the import.
        let mut entries = BTreeMap::new();
        for standing in battle.standings().unwrap_or_default() {
            let entry = entry(battle, &standing, cx)?;
            let errors = entry.result_errors();
            if !errors.is_empty() {
                skipped.push(format!(
                    "an entry of battle {} refused by the result rules: {errors:?}",
                    battle.key
                ));
                continue;
            }
            let entry_id =
                db::battles::insert_entry(conn, battle_id, fields.gender, &entry).await?;
            entries.insert(standing.entrant, entry_id);
        }
        insert_matches(conn, battle_id, battle, &entries).await?;
    }
    Ok(Written::Event {
        skipped_battles: skipped,
    })
}

/// The bracket's matches between the entries written, numbered within each round in file
/// order; a match missing an entry the result rules refused is left out.
async fn insert_matches(
    conn: &mut PgConnection,
    battle_id: Uuid,
    battle: &BattleRecord,
    entries: &BTreeMap<&str, Uuid>,
) -> sqlx::Result<()> {
    let mut next = BTreeMap::<MatchRound, i16>::new();
    for record in &battle.matches {
        let loser = if record.winner == record.a {
            &record.b
        } else {
            &record.a
        };
        let (Some(&winner_id), Some(&loser_id)) = (
            entries.get(record.winner.as_str()),
            entries.get(loser.as_str()),
        ) else {
            continue;
        };
        let round = MatchRound::from(record.round);
        let position = next.entry(round).or_default();
        let video_url = record.video.as_deref().and_then(canonical_video);
        let fields = MatchFields {
            round,
            position: *position,
            winner_id,
            loser_id,
            video_offset_seconds: video_url
                .as_ref()
                .and(record.at)
                .and_then(|at| i32::try_from(at).ok()),
            video_url,
        };
        db::battles::insert_match(conn, battle_id, &fields).await?;
        *position += 1;
    }
    Ok(())
}

fn event_fields(event: &EventRecord) -> EventFields {
    EventFields {
        name: event.name.clone(),
        description: None,
        starts_on: event.starts_on,
        ends_on: event.ends_on.unwrap_or(event.starts_on),
        timezone: event.timezone.clone(),
        opens_at: None,
        closes_at: None,
        venue_name: event.venue.clone(),
        address: None,
        city: Some(event.city.clone()),
        country: Some(event.country.clone()),
        lat: event.lat,
        lng: event.lng,
        registration_url: None,
        instagram_url: None,
        website_url: None,
        contact_email: None,
    }
}

/// The battle as the API would receive it; crew battles of no fixed size are of unknown format.
fn battle_fields(battle: &BattleRecord) -> BattleFields {
    let (format, team_size) = match (battle.format, battle.is_team_battle(), battle.team_size) {
        (Some(BattleFormat::SevenToSmoke), ..) => (BattleFormat::SevenToSmoke, None),
        (Some(BattleFormat::Showcase), _, size) => (BattleFormat::Showcase, size.map(i16::from)),
        (_, false, _) => (BattleFormat::Team, Some(1)),
        (_, true, Some(size)) => (BattleFormat::Team, Some(i16::from(size))),
        (_, true, None) => (BattleFormat::Na, None),
    };
    let age = battle.age.unwrap_or(BattleAge::Na);
    BattleFields {
        name: Some(battle.name.clone()),
        format,
        team_size,
        gender: battle.gender,
        age,
        age_min: None,
        // The rules want an upper age for kids; the sources rarely give one, and kids means under 18.
        age_max: (age == BattleAge::Kids).then_some(17),
        bracket_size: battle
            .bracket_size
            .and_then(|size| i16::try_from(size).ok()),
        max_entries: None,
        prize_currency: None,
        prize_first: None,
        prize_second: None,
        prize_third: None,
        // The sources give days, not running orders.
        starts_at: None,
    }
}

/// A confirmed entry with its result; a team known only by name gets no members rather than invented ones.
fn entry(
    battle: &BattleRecord,
    standing: &Standing<'_>,
    cx: &Context<'_>,
) -> Result<EntryFields, ImportError> {
    let (team_name, crew_id, dancer_ids) = match battle.teams.get(standing.entrant) {
        Some(team) => {
            let crew = team.crew.as_ref();
            let crew_name = crew
                .and_then(|c| cx.data.crews.get(c))
                .map(|c| c.name.clone());
            let members = team
                .members
                .iter()
                .map(|m| dancer_id(cx, m))
                .collect::<Result<_, _>>()?;
            (
                team.name.clone().or(crew_name),
                crew.and_then(|c| cx.crews.get(c)).copied(),
                members,
            )
        }
        None => (None, None, vec![dancer_id(cx, standing.entrant)?]),
    };
    let mut fields = EntryFields {
        team_name,
        crew_id,
        dancer_ids,
        status: EntryStatus::Confirmed,
        reached: standing.reached,
        final_rank: standing.rank,
        video_url: standing.video.map(str::to_owned),
        video_offset_seconds: standing.at.and_then(|at| i32::try_from(at).ok()),
    };
    fields.normalize();
    Ok(fields)
}

fn dancer_id(cx: &Context<'_>, key: &str) -> Result<Uuid, ImportError> {
    cx.dancers
        .get(key)
        .copied()
        .ok_or_else(|| ImportError::Unknown(format!("dancer {key}")))
}
