//! Battles, entries and staff: enums, fields and the rules §4 leaves to domain code.

use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::{Validate, ValidationError, ValidationErrors};

use super::{dancer::DancerRef, rule, upper_ascii_code};

/// How a battle is run.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, utoipa::ToSchema,
)]
#[sqlx(type_name = "battle_format", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum BattleFormat {
    /// 1v1 … 10v10, size in `team_size`.
    Team,
    SevenToSmoke,
    /// Not known, e.g. an imported crew battle of no fixed size.
    Na,
    /// Entries perform rather than battle in a bracket; any size in `team_size`, or none.
    Showcase,
}

/// Who may enter.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, utoipa::ToSchema,
)]
#[sqlx(type_name = "battle_gender", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum BattleGender {
    Bboy,
    Bgirl,
    /// Open to both.
    Mixed,
}

/// Age category.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, utoipa::ToSchema,
)]
#[sqlx(type_name = "battle_age", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum BattleAge {
    Kids,
    Adult,
    Na,
}

/// Furthest stage an entry reached; `Winner` is first place.
#[derive(
    Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, utoipa::ToSchema,
)]
#[sqlx(type_name = "bracket_stage", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum BracketStage {
    Prelims,
    Top64,
    Top32,
    Top16,
    Top8,
    Top4,
    Top2,
    Winner,
    #[default]
    Na,
}

/// Registration state of an entry.
#[derive(
    Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, utoipa::ToSchema,
)]
#[sqlx(type_name = "entry_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum EntryStatus {
    #[default]
    Pending,
    Confirmed,
    Withdrawn,
}

/// What a staff member does at a jam.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type, utoipa::ToSchema,
)]
#[sqlx(type_name = "staff_role", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum StaffRole {
    Judge,
    Dj,
    Mc,
    Organizer,
    Other,
}

/// A competition inside a jam, e.g. "1v1 Bboy".
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Battle {
    /// Primary key, UUIDv7.
    pub id: Uuid,
    /// The jam it belongs to.
    pub event_id: Uuid,
    /// Display name, given or generated.
    pub name: String,
    /// How it is run.
    pub format: BattleFormat,
    /// 1 = 1v1 … 10 = 10v10; set for team battles, and for showcases that fix a size.
    pub team_size: Option<i16>,
    /// Who may enter.
    pub gender: BattleGender,
    /// Age category.
    pub age: BattleAge,
    /// Lower age bound.
    pub age_min: Option<i16>,
    /// Upper age bound.
    pub age_max: Option<i16>,
    /// Starting bracket after prelims; null = unknown.
    pub bracket_size: Option<i16>,
    /// Registration cap; null = unlimited.
    pub max_entries: Option<i32>,
    /// ISO 4217 code of the prizes, e.g. `CHF`; null when there are none.
    pub prize_currency: Option<String>,
    /// Cash prize for 1st place, in whole units of `prize_currency`.
    pub prize_first: Option<i32>,
    /// Cash prize for 2nd place.
    pub prize_second: Option<i32>,
    /// Cash prize for 3rd place.
    pub prize_third: Option<i32>,
    /// Display order on the jam page.
    pub position: i16,
    /// When it starts, as wall-clock time in the jam's timezone; null until announced.
    pub starts_at: Option<NaiveDateTime>,
    /// Row creation time.
    pub created_at: DateTime<Utc>,
    /// Last write, maintained by a trigger.
    pub updated_at: DateTime<Utc>,
}

/// What the map's category chips filter on, derived from a battle's structured fields.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    /// Team battle of one: 1v1.
    OneVOne,
    /// Team battle of two: 2v2.
    TwoVTwo,
    /// Team battle of three or more.
    Crew,
    SevenToSmoke,
    Bgirl,
    Kids,
}

/// How many dancers an entry of such a battle holds: one in a seven-to-smoke, else the team
/// size; none while that is open.
pub fn entry_size(format: BattleFormat, team_size: Option<i16>) -> Option<i16> {
    match format {
        BattleFormat::SevenToSmoke => Some(1),
        // A battle of unknown shape holds whatever the team size says, as the entry rules do.
        BattleFormat::Team | BattleFormat::Showcase | BattleFormat::Na => team_size,
    }
}

impl Battle {
    /// The categories this battle counts for; a 1v1 Bgirl Kids battle is all three.
    pub fn categories(&self) -> Vec<Category> {
        let mut categories = Vec::new();
        match (self.format, self.team_size) {
            (BattleFormat::Team, Some(1)) => categories.push(Category::OneVOne),
            (BattleFormat::Team, Some(2)) => categories.push(Category::TwoVTwo),
            (BattleFormat::Team, Some(_)) => categories.push(Category::Crew),
            (BattleFormat::SevenToSmoke, _) => categories.push(Category::SevenToSmoke),
            _ => {}
        }
        if self.gender == BattleGender::Bgirl {
            categories.push(Category::Bgirl);
        }
        if self.age == BattleAge::Kids {
            categories.push(Category::Kids);
        }
        categories
    }
}

/// Everything set when creating or editing a battle.
#[derive(Debug, Clone, Deserialize, Validate, utoipa::ToSchema)]
#[validate(
    schema(function = "team_size_matches_format"),
    schema(function = "age_bounds_match_category"),
    schema(function = "age_max_not_below_min"),
    schema(function = "bracket_size_is_valid"),
    schema(function = "prizes_have_a_currency")
)]
pub struct BattleFields {
    /// Free text; blank means "generate from the structured fields".
    #[validate(length(max = 100))]
    pub name: Option<String>,
    /// How the battle is run.
    pub format: BattleFormat,
    /// 1 = 1v1 … 10 = 10v10; required for team battles, optional for showcases, absent otherwise.
    #[validate(range(min = 1, max = 10))]
    pub team_size: Option<i16>,
    /// Who may enter.
    pub gender: BattleGender,
    /// Age category; kids need `age_max` of 17 or less, adults `age_min` of 18 or more.
    pub age: BattleAge,
    /// Lower age bound.
    #[validate(range(min = 0, max = 120))]
    pub age_min: Option<i16>,
    /// Upper age bound.
    #[validate(range(min = 0, max = 120))]
    pub age_max: Option<i16>,
    /// Starting bracket after prelims: 2, 4, 8, 16, 32 or 64; null = unknown.
    pub bracket_size: Option<i16>,
    /// Registration cap; null = unlimited.
    #[validate(range(min = 1))]
    pub max_entries: Option<i32>,
    /// ISO 4217 code, upper case (`EUR`, `CHF`, `CNY`…); required when a prize is set.
    #[validate(custom(function = "currency_code"))]
    pub prize_currency: Option<String>,
    /// Cash prize for 1st place, in whole units.
    #[validate(range(min = 0))]
    pub prize_first: Option<i32>,
    /// Cash prize for 2nd place, in whole units.
    #[validate(range(min = 0))]
    pub prize_second: Option<i32>,
    /// Cash prize for 3rd place, in whole units.
    #[validate(range(min = 0))]
    pub prize_third: Option<i32>,
    /// When it starts, wall-clock time in the jam's timezone, on one of its days; null = not announced.
    pub starts_at: Option<NaiveDateTime>,
}

// The §4 table checks, so a bad combination is a 422 naming the field, not a DB error.
fn team_size_matches_format(fields: &BattleFields) -> Result<(), ValidationError> {
    match (fields.format, fields.team_size) {
        (BattleFormat::Team, None) => Err(rule("team_size", "required for team battles")),
        (BattleFormat::SevenToSmoke | BattleFormat::Na, Some(_)) => {
            Err(rule("team_size", "only for team battles and showcases"))
        }
        _ => Ok(()),
    }
}

fn age_bounds_match_category(fields: &BattleFields) -> Result<(), ValidationError> {
    match fields.age {
        BattleAge::Kids if !fields.age_max.is_some_and(|max| max <= 17) => Err(rule(
            "age_max",
            "kids battles need an upper age of 17 or less",
        )),
        BattleAge::Adult if !fields.age_min.is_some_and(|min| min >= 18) => Err(rule(
            "age_min",
            "adult battles need a lower age of 18 or more",
        )),
        _ => Ok(()),
    }
}

fn age_max_not_below_min(fields: &BattleFields) -> Result<(), ValidationError> {
    match (fields.age_min, fields.age_max) {
        (Some(min), Some(max)) if max < min => Err(rule("age_max", "must not be below age_min")),
        _ => Ok(()),
    }
}

fn bracket_size_is_valid(fields: &BattleFields) -> Result<(), ValidationError> {
    match fields.bracket_size {
        Some(size) if ![2, 4, 8, 16, 32, 64].contains(&size) => {
            Err(rule("bracket_size", "must be 2, 4, 8, 16, 32 or 64"))
        }
        _ => Ok(()),
    }
}

/// Three upper-case letters: the shape of an ISO 4217 code (the list itself isn't embedded).
pub(crate) fn currency_code(value: &str) -> Result<(), ValidationError> {
    if upper_ascii_code(value, 3) {
        return Ok(());
    }
    Err(ValidationError::new("currency").with_message("must be an ISO 4217 code, e.g. EUR".into()))
}

fn prizes_have_a_currency(fields: &BattleFields) -> Result<(), ValidationError> {
    let any_prize = [fields.prize_first, fields.prize_second, fields.prize_third]
        .iter()
        .any(Option::is_some);
    match (any_prize, &fields.prize_currency) {
        (true, None) => Err(rule("prize_currency", "required with a prize")),
        (false, Some(_)) => Err(rule("prize_currency", "only with a prize")),
        _ => Ok(()),
    }
}

/// Battles one jam may hold: real jams run a handful, and every flyer lists them all.
pub const MAX_BATTLES: usize = 32;

/// Whether a start, if any, falls on one of the jam's days.
pub fn starts_during(
    start: Option<NaiveDateTime>,
    first_day: NaiveDate,
    last_day: NaiveDate,
) -> bool {
    start.is_none_or(|at| (first_day..=last_day).contains(&at.date()))
}

impl BattleFields {
    /// The organiser's name, or one built from the structured fields (§4: "2v2 Mixed Kids").
    pub fn display_name(&self) -> String {
        if let Some(name) = self
            .name
            .as_deref()
            .map(str::trim)
            .filter(|n| !n.is_empty())
        {
            return name.to_owned();
        }
        let format = match (self.format, self.team_size) {
            (BattleFormat::Team, Some(n)) => format!("{n}v{n}"),
            (BattleFormat::SevenToSmoke, _) => "Seven to Smoke".to_owned(),
            (BattleFormat::Showcase, _) => "Showcase".to_owned(),
            _ => "Battle".to_owned(),
        };
        let gender = match self.gender {
            BattleGender::Bboy => "Bboy",
            BattleGender::Bgirl => "Bgirl",
            BattleGender::Mixed => "Mixed",
        };
        let age = match self.age {
            BattleAge::Kids => " Kids",
            BattleAge::Adult if self.age_min.is_some_and(|min| min >= 40) => " Masters",
            _ => "",
        };
        format!("{format} {gender}{age}")
    }
}

/// Everything set when registering or editing an entry; results are optional on create.
#[derive(Debug, Clone, Deserialize, Validate, utoipa::ToSchema)]
pub struct EntryFields {
    /// Null for 1v1; blank is stored as null.
    #[validate(length(max = 100))]
    pub team_name: Option<String>,
    /// The crew this entry represents, if any.
    pub crew_id: Option<Uuid>,
    /// Members: 1 to 10 distinct dancers.
    #[validate(length(min = 1, max = 10))]
    pub dancer_ids: Vec<Uuid>,
    /// Registration state; `pending` when omitted.
    #[serde(default)]
    pub status: EntryStatus,
    /// Furthest stage reached; `na` when omitted.
    #[serde(default)]
    pub reached: BracketStage,
    /// Exact placement when known; filled from `reached` for `winner` (1) and `top2` (2).
    #[validate(range(min = 1))]
    pub final_rank: Option<i32>,
    /// YouTube link; stored as `https://www.youtube.com/watch?v=<id>`.
    #[validate(length(max = 500))]
    pub video_url: Option<String>,
    #[validate(range(min = 0))]
    pub video_offset_seconds: Option<i32>,
}

impl EntryFields {
    /// Fills derived values: `final_rank` from `reached`, canonical YouTube URL, blank → null.
    pub fn normalize(&mut self) {
        if self.final_rank.is_none() {
            self.final_rank = match self.reached {
                BracketStage::Winner => Some(1),
                BracketStage::Top2 => Some(2),
                _ => None,
            };
        }
        self.video_url = self.video_url.take().and_then(|url| canonical_video(&url));
    }

    /// Rules §4 leaves to domain code, checked against the battle; run after `normalize`.
    pub fn errors_for(&self, battle: &Battle) -> Vec<(&'static str, &'static str)> {
        let mut errors = Vec::new();
        let mut ids = self.dancer_ids.clone();
        ids.sort();
        ids.dedup();
        if ids.len() != self.dancer_ids.len() {
            errors.push(("dancer_ids", "a dancer is listed twice"));
        }
        let members = self.dancer_ids.len();
        match (battle.format, battle.team_size) {
            (BattleFormat::SevenToSmoke, _) if members != 1 => {
                errors.push(("dancer_ids", "seven-to-smoke entries are one dancer"))
            }
            (BattleFormat::Team | BattleFormat::Showcase, Some(size))
                if members > size as usize =>
            {
                errors.push(("dancer_ids", "more dancers than the team size"))
            }
            (BattleFormat::Team | BattleFormat::Showcase, Some(size))
                if self.status == EntryStatus::Confirmed && members != size as usize =>
            {
                errors.push((
                    "dancer_ids",
                    "a confirmed team entry needs exactly team_size dancers",
                ))
            }
            _ => {}
        }
        errors.extend(self.result_errors());
        errors
    }

    /// The rules of the result and its video alone, which the schema also holds; run after
    /// `normalize`. The curated-data import checks only these: its teams may be known by name.
    pub fn result_errors(&self) -> Vec<(&'static str, &'static str)> {
        let mut errors = Vec::new();
        if (self.reached == BracketStage::Winner) != (self.final_rank == Some(1)) {
            errors.push(("final_rank", "winner and final_rank 1 go together"));
        }
        if self.reached == BracketStage::Top2 && self.final_rank != Some(2) {
            errors.push(("final_rank", "top2 means final_rank 2"));
        }
        if let Some(url) = &self.video_url
            && youtube_id(url).is_none()
        {
            errors.push(("video_url", "must be a YouTube video link"));
        }
        if self.video_offset_seconds.is_some() && self.video_url.is_none() {
            errors.push(("video_offset_seconds", "needs a video_url"));
        }
        errors
    }
}

/// A registration in a battle, with its members and result.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Entry {
    /// Primary key, UUIDv7.
    pub id: Uuid,
    /// The battle entered.
    pub battle_id: Uuid,
    /// Team name for crew and duo entries; null for 1v1.
    pub team_name: Option<String>,
    /// The crew represented, if any.
    pub crew: Option<CrewName>,
    /// Registration state.
    pub status: EntryStatus,
    /// Furthest stage reached.
    pub reached: BracketStage,
    /// Exact placement when known.
    pub final_rank: Option<i32>,
    /// Canonical YouTube watch link of the battle video.
    pub video_url: Option<String>,
    /// Where the battle starts inside the video.
    pub video_offset_seconds: Option<i32>,
    /// By dancer name.
    pub members: Vec<DancerRef>,
    /// Row creation time.
    pub created_at: DateTime<Utc>,
    /// Last write, maintained by a trigger.
    pub updated_at: DateTime<Utc>,
}

/// A bracket round, named by how many entries it starts with; `Top4` is the semi-finals and
/// `Third` the small final (M29).
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Serialize,
    Deserialize,
    sqlx::Type,
    utoipa::ToSchema,
)]
#[sqlx(type_name = "match_round", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum MatchRound {
    Top64,
    Top32,
    Top16,
    Top8,
    Top4,
    Third,
    Final,
}

/// One battle of a bracket between two entries of the same battle; the winner first (M29).
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Match {
    /// Primary key, UUIDv7.
    pub id: Uuid,
    /// Its round.
    pub round: MatchRound,
    /// Its place in the round, from 0: battles 0 and 1 feed battle 0 of the next round.
    pub position: i16,
    /// The entry that won.
    pub winner_id: Uuid,
    /// The entry that lost.
    pub loser_id: Uuid,
    /// Canonical YouTube watch link of the match.
    pub video_url: Option<String>,
    /// Where the match starts inside the video.
    pub video_offset_seconds: Option<i32>,
}

impl MatchRound {
    /// Matches a round holds: half its entries, one for the final and the small final.
    pub fn capacity(self) -> usize {
        match self {
            Self::Top64 => 32,
            Self::Top32 => 16,
            Self::Top16 => 8,
            Self::Top8 => 4,
            Self::Top4 => 2,
            Self::Third | Self::Final => 1,
        }
    }

    /// How far into the bracket the round is; the final and the small final are both last.
    fn depth(self) -> u8 {
        match self {
            Self::Top64 => 0,
            Self::Top32 => 1,
            Self::Top16 => 2,
            Self::Top8 => 3,
            Self::Top4 => 4,
            Self::Third | Self::Final => 5,
        }
    }

    /// The placing of the round's loser.
    fn losers_stage(self) -> BracketStage {
        match self {
            Self::Top64 => BracketStage::Top64,
            Self::Top32 => BracketStage::Top32,
            Self::Top16 => BracketStage::Top16,
            Self::Top8 => BracketStage::Top8,
            Self::Top4 | Self::Third => BracketStage::Top4,
            Self::Final => BracketStage::Top2,
        }
    }
}

/// A match as its organiser enters it in the battle sheet's Results step (M29).
#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
pub struct MatchInput {
    /// Its round.
    pub round: MatchRound,
    /// Its place in the round, from 0, kept when battles before it are not entered yet.
    pub position: i16,
    /// The entry that won.
    pub winner_id: Uuid,
    /// The entry that lost.
    pub loser_id: Uuid,
    /// A YouTube link to the match; blank or absent for none.
    pub video_url: Option<String>,
    /// Where the match starts inside the video, kept from the curated data; dropped without one.
    pub video_offset_seconds: Option<i32>,
}

/// Body of `PUT /battles/{id}/matches`: every match of the battle.
#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
#[serde(transparent)]
pub struct MatchList(pub Vec<MatchInput>);

impl Validate for MatchList {
    fn validate(&self) -> Result<(), ValidationErrors> {
        Ok(())
    }
}

impl MatchList {
    /// The matches to store, with canonical videos.
    pub fn fields(&self) -> Vec<MatchFields> {
        self.0
            .iter()
            .map(|m| {
                let video_url = m.video_url.as_deref().and_then(canonical_video);
                MatchFields {
                    round: m.round,
                    position: m.position,
                    winner_id: m.winner_id,
                    loser_id: m.loser_id,
                    video_offset_seconds: video_url
                        .as_ref()
                        .and(m.video_offset_seconds)
                        .filter(|at| *at >= 0),
                    video_url,
                }
            })
            .collect()
    }
}

/// Why `matches` can't be the bracket of a battle with these `entries`, if they can't: both sides
/// are its entries, none withdrawn; an entry plays once a round, and each battle has its own
/// place in its round; an entry knocked out plays no later round, but a semi-final loser the
/// small final.
pub fn bracket_problem(matches: &[MatchFields], entries: &[Entry]) -> Option<&'static str> {
    use std::collections::{BTreeSet, HashMap, HashSet};
    let playing: HashSet<Uuid> = entries
        .iter()
        .filter(|e| e.status != EntryStatus::Withdrawn)
        .map(|e| e.id)
        .collect();
    let mut seen = HashSet::new();
    let mut places = BTreeSet::new();
    let mut knocked_out = HashMap::<Uuid, MatchRound>::new();
    for m in matches {
        if !playing.contains(&m.winner_id) || !playing.contains(&m.loser_id) {
            return Some("a side is not an entry of this battle");
        }
        if m.winner_id == m.loser_id {
            return Some("an entry can't battle itself");
        }
        if m.video_url
            .as_deref()
            .is_some_and(|url| youtube_id(url).is_none())
        {
            return Some("a video must be a YouTube link");
        }
        let in_round = usize::try_from(m.position).is_ok_and(|at| at < m.round.capacity());
        if !in_round || !places.insert((m.round, m.position)) {
            return Some("a battle's place in its round is taken or out of range");
        }
        // The final and the small final share their depth: one entry plays only one of them.
        for side in [m.winner_id, m.loser_id] {
            if !seen.insert((side, m.round.depth())) {
                return Some("an entry battles twice in one round");
            }
        }
        // The earliest loss, whatever order the matches come in.
        knocked_out
            .entry(m.loser_id)
            .and_modify(|out| {
                if m.round.depth() < out.depth() {
                    *out = m.round;
                }
            })
            .or_insert(m.round);
    }
    let out_too_early = matches.iter().any(|m| {
        [m.winner_id, m.loser_id].iter().any(|side| {
            knocked_out.get(side).is_some_and(|out| {
                let semi_loser_in_small_final =
                    *out == MatchRound::Top4 && m.round == MatchRound::Third;
                out.depth() < m.round.depth() && !semi_loser_in_small_final
            })
        })
    });
    out_too_early.then_some("an entry knocked out battles again")
}

/// Where an entry finished, as its matches say.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Placing {
    /// The entry.
    pub entry_id: Uuid,
    /// Furthest stage reached.
    pub reached: BracketStage,
    /// Exact placement, for the final's and the small final's sides.
    pub final_rank: Option<i32>,
    /// The video of its last match, when that match has one.
    pub video_url: Option<String>,
    /// Where that match starts inside the video.
    pub video_offset_seconds: Option<i32>,
}

/// The placings `matches` decide: every loser's, and the winners' of the final and the small
/// final; an entry that only won so far keeps the one it has.
pub fn placings(matches: &[MatchFields]) -> Vec<Placing> {
    let mut last = std::collections::BTreeMap::<Uuid, &MatchFields>::new();
    for m in matches {
        for side in [m.winner_id, m.loser_id] {
            let later = last
                .get(&side)
                .is_none_or(|seen| seen.round.depth() < m.round.depth());
            if later {
                last.insert(side, m);
            }
        }
    }
    last.into_iter()
        .filter_map(|(entry_id, m)| {
            let won = m.winner_id == entry_id;
            let (reached, final_rank) = match (m.round, won) {
                (MatchRound::Final, true) => (BracketStage::Winner, Some(1)),
                (MatchRound::Final, false) => (BracketStage::Top2, Some(2)),
                (MatchRound::Third, true) => (BracketStage::Top4, Some(3)),
                (MatchRound::Third, false) => (BracketStage::Top4, Some(4)),
                (round, false) => (round.losers_stage(), None),
                (_, true) => return None,
            };
            Some(Placing {
                entry_id,
                reached,
                final_rank,
                video_url: m.video_url.clone(),
                video_offset_seconds: m.video_offset_seconds,
            })
        })
        .collect()
}

/// A match to store; `position` orders it within its round.
#[derive(Debug, Clone)]
pub struct MatchFields {
    /// Its round.
    pub round: MatchRound,
    /// Order within the round, from 0.
    pub position: i16,
    /// The entry that won.
    pub winner_id: Uuid,
    /// The entry that lost.
    pub loser_id: Uuid,
    /// Canonical video link, if any.
    pub video_url: Option<String>,
    /// Where the match starts inside the video.
    pub video_offset_seconds: Option<i32>,
}

/// A crew as named on an entry.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct CrewName {
    /// Crew id.
    pub id: Uuid,
    /// Crew name.
    pub name: String,
}

/// A staff member as shown on the jam page.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct StaffMember {
    /// What they do at the jam.
    pub role: StaffRole,
    /// Who.
    pub dancer: DancerRef,
}

/// One person on a jam's staff.
#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
pub struct StaffAssignment {
    /// The dancer's id.
    pub dancer_id: Uuid,
    /// The role they hold.
    pub role: StaffRole,
}

/// Body of `PUT /events/{id}/staff`: the full list, replacing the old one.
#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
#[serde(transparent)]
pub struct StaffList(pub Vec<StaffAssignment>);

impl Validate for StaffList {
    fn validate(&self) -> Result<(), ValidationErrors> {
        let mut seen = std::collections::HashSet::new();
        if self.0.iter().all(|s| seen.insert((s.dancer_id, s.role))) {
            return Ok(());
        }
        let mut errors = ValidationErrors::new();
        errors.add(
            "staff",
            validator::ValidationError::new("duplicate")
                .with_message("the same dancer and role appear twice".into()),
        );
        Err(errors)
    }
}

/// Body of `PUT /events/{id}/battles/order`: every battle id of the jam, in display order.
#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
#[serde(transparent)]
pub struct BattleOrder(pub Vec<Uuid>);

impl Validate for BattleOrder {
    fn validate(&self) -> Result<(), ValidationErrors> {
        Ok(())
    }
}

/// A video link as stored: trimmed, and a YouTube one as its `watch?v=` link; `None` when blank.
pub fn canonical_video(link: &str) -> Option<String> {
    let link = link.trim();
    if link.is_empty() {
        return None;
    }
    Some(youtube_id(link).map_or_else(
        || link.to_owned(),
        |id| format!("https://www.youtube.com/watch?v={id}"),
    ))
}

/// The 11-character video id of a YouTube watch, live or youtu.be link (§6 Video embeds).
pub fn youtube_id(link: &str) -> Option<String> {
    let url = url::Url::parse(link).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    let host = url
        .host_str()?
        .trim_start_matches("www.")
        .trim_start_matches("m.");
    let mut path = url.path_segments()?;
    let id = match (host, path.next()) {
        ("youtu.be", Some(id)) => id.to_owned(),
        ("youtube.com", Some("watch")) => url
            .query_pairs()
            .find_map(|(key, value)| (key == "v").then(|| value.into_owned()))?,
        ("youtube.com", Some("live")) => path.next()?.to_owned(),
        _ => return None,
    };
    let valid = id.len() == 11
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    valid.then_some(id)
}
