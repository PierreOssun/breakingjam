//! Battles, entries and staff: enums, fields and the rules §4 leaves to domain code.

use chrono::{DateTime, Utc};
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
    Na,
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
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, utoipa::ToSchema,
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
    Na,
}

/// Registration state of an entry.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, utoipa::ToSchema,
)]
#[sqlx(type_name = "entry_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum EntryStatus {
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
    /// 1 = 1v1 … 10 = 10v10; set only for team battles.
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
    /// 1 = 1v1 … 10 = 10v10; required for team battles, absent otherwise.
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
}

// The §4 table checks, so a bad combination is a 422 naming the field, not a DB error.
fn team_size_matches_format(fields: &BattleFields) -> Result<(), ValidationError> {
    match (fields.format, fields.team_size) {
        (BattleFormat::Team, None) => Err(rule("team_size", "required for team battles")),
        (BattleFormat::SevenToSmoke | BattleFormat::Na, Some(_)) => {
            Err(rule("team_size", "only for team battles"))
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
    #[serde(default = "pending")]
    pub status: EntryStatus,
    /// Furthest stage reached; `na` when omitted.
    #[serde(default = "not_applicable")]
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

fn pending() -> EntryStatus {
    EntryStatus::Pending
}

fn not_applicable() -> BracketStage {
    BracketStage::Na
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
        self.video_url = self
            .video_url
            .take()
            .map(|url| url.trim().to_owned())
            .filter(|url| !url.is_empty())
            .map(|url| {
                youtube_id(&url).map_or(url, |id| format!("https://www.youtube.com/watch?v={id}"))
            });
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
            (BattleFormat::Team, Some(size)) if members > size as usize => {
                errors.push(("dancer_ids", "more dancers than the team size"))
            }
            (BattleFormat::Team, Some(size))
                if self.status == EntryStatus::Confirmed && members != size as usize =>
            {
                errors.push((
                    "dancer_ids",
                    "a confirmed team entry needs exactly team_size dancers",
                ))
            }
            _ => {}
        }
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
