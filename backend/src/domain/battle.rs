//! Battles, entries and staff: enums, fields and the rules §4 leaves to domain code.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::{Validate, ValidationError, ValidationErrors};

use super::{dancer::DancerRef, rule};

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
    /// Display order on the jam page.
    pub position: i16,
    /// Row creation time.
    pub created_at: DateTime<Utc>,
    /// Last write, maintained by a trigger.
    pub updated_at: DateTime<Utc>,
}

/// Everything set when creating or editing a battle.
#[derive(Debug, Clone, Deserialize, Validate, utoipa::ToSchema)]
#[validate(
    schema(function = "team_size_matches_format"),
    schema(function = "age_bounds_match_category"),
    schema(function = "age_max_not_below_min"),
    schema(function = "bracket_size_is_valid")
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

#[cfg(test)]
mod tests {
    use super::*;

    fn battle_fields(format: BattleFormat, team_size: Option<i16>, age: BattleAge) -> BattleFields {
        BattleFields {
            name: None,
            format,
            team_size,
            gender: BattleGender::Mixed,
            age,
            age_min: match age {
                BattleAge::Kids => Some(8),
                BattleAge::Adult => Some(18),
                BattleAge::Na => None,
            },
            age_max: (age == BattleAge::Kids).then_some(17),
            bracket_size: None,
            max_entries: None,
        }
    }

    fn battle(format: BattleFormat, team_size: Option<i16>) -> Battle {
        Battle {
            id: Uuid::now_v7(),
            event_id: Uuid::now_v7(),
            name: String::new(),
            format,
            team_size,
            gender: BattleGender::Mixed,
            age: BattleAge::Adult,
            age_min: Some(18),
            age_max: None,
            bracket_size: None,
            max_entries: None,
            position: 0,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    fn entry(dancers: usize, status: EntryStatus) -> EntryFields {
        EntryFields {
            team_name: None,
            crew_id: None,
            dancer_ids: (0..dancers).map(|_| Uuid::now_v7()).collect(),
            status,
            reached: BracketStage::Na,
            final_rank: None,
            video_url: None,
            video_offset_seconds: None,
        }
    }

    #[test]
    fn default_names_follow_the_examples() {
        let mut fields = battle_fields(BattleFormat::Team, Some(1), BattleAge::Adult);
        fields.gender = BattleGender::Bboy;
        assert_eq!(fields.display_name(), "1v1 Bboy");
        let kids = battle_fields(BattleFormat::Team, Some(2), BattleAge::Kids);
        assert_eq!(kids.display_name(), "2v2 Mixed Kids");
        let mut smoke = battle_fields(BattleFormat::SevenToSmoke, None, BattleAge::Adult);
        smoke.gender = BattleGender::Bgirl;
        assert_eq!(smoke.display_name(), "Seven to Smoke Bgirl");
        let mut masters = battle_fields(BattleFormat::Team, Some(1), BattleAge::Adult);
        masters.age_min = Some(40);
        assert_eq!(masters.display_name(), "1v1 Mixed Masters");
        masters.name = Some("  Old School 1v1 ".into());
        assert_eq!(masters.display_name(), "Old School 1v1");
    }

    /// Fields named by the struct-level rules that `fields` breaks.
    fn broken_rules(fields: &BattleFields) -> Vec<String> {
        match fields.validate() {
            Ok(()) => Vec::new(),
            Err(errors) => errors.field_errors()["__all__"]
                .iter()
                .map(|e| e.code.to_string())
                .collect(),
        }
    }

    #[test]
    fn battle_checks_mirror_the_schema() {
        let ok = battle_fields(BattleFormat::Team, Some(2), BattleAge::Kids);
        assert!(broken_rules(&ok).is_empty());
        let no_size = battle_fields(BattleFormat::Team, None, BattleAge::Adult);
        assert_eq!(broken_rules(&no_size), ["team_size"]);
        let smoke_with_size = battle_fields(BattleFormat::SevenToSmoke, Some(1), BattleAge::Adult);
        assert_eq!(broken_rules(&smoke_with_size), ["team_size"]);
        let mut old_kids = battle_fields(BattleFormat::Team, Some(1), BattleAge::Kids);
        old_kids.age_max = Some(18);
        assert_eq!(broken_rules(&old_kids), ["age_max"]);
        let mut odd_bracket = battle_fields(BattleFormat::Team, Some(1), BattleAge::Adult);
        odd_bracket.bracket_size = Some(12);
        assert_eq!(broken_rules(&odd_bracket), ["bracket_size"]);
    }

    #[test]
    fn entry_member_counts() {
        let duo = battle(BattleFormat::Team, Some(2));
        assert!(entry(1, EntryStatus::Pending).errors_for(&duo).is_empty());
        assert!(!entry(1, EntryStatus::Confirmed).errors_for(&duo).is_empty());
        assert!(entry(2, EntryStatus::Confirmed).errors_for(&duo).is_empty());
        assert!(!entry(3, EntryStatus::Pending).errors_for(&duo).is_empty());

        let smoke = battle(BattleFormat::SevenToSmoke, None);
        assert!(entry(1, EntryStatus::Pending).errors_for(&smoke).is_empty());
        assert!(!entry(2, EntryStatus::Pending).errors_for(&smoke).is_empty());

        let mut twice = entry(1, EntryStatus::Pending);
        twice.dancer_ids.push(twice.dancer_ids[0]);
        assert!(!twice.errors_for(&duo).is_empty());
    }

    #[test]
    fn reached_and_final_rank_agree() {
        let solo = battle(BattleFormat::Team, Some(1));
        let mut winner = entry(1, EntryStatus::Confirmed);
        winner.reached = BracketStage::Winner;
        winner.normalize();
        assert_eq!(winner.final_rank, Some(1));
        assert!(winner.errors_for(&solo).is_empty());

        let mut wrong = entry(1, EntryStatus::Confirmed);
        wrong.reached = BracketStage::Top8;
        wrong.final_rank = Some(1);
        assert_eq!(wrong.errors_for(&solo)[0].0, "final_rank");

        let mut runner_up = entry(1, EntryStatus::Confirmed);
        runner_up.reached = BracketStage::Top2;
        runner_up.final_rank = Some(3);
        assert_eq!(runner_up.errors_for(&solo)[0].0, "final_rank");
    }

    #[test]
    fn youtube_links() {
        let id = Some("dQw4w9WgXcQ".to_owned());
        assert_eq!(
            youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42"),
            id
        );
        assert_eq!(youtube_id("https://youtu.be/dQw4w9WgXcQ?t=42"), id);
        assert_eq!(youtube_id("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), id);
        assert_eq!(youtube_id("https://www.youtube.com/live/dQw4w9WgXcQ"), id);
        assert_eq!(youtube_id("https://vimeo.com/123"), None);
        assert_eq!(youtube_id("https://www.youtube.com/watch?v=short"), None);
        assert_eq!(
            youtube_id("javascript:alert(1)//youtu.be/dQw4w9WgXcQ"),
            None
        );

        let mut fields = entry(1, EntryStatus::Pending);
        fields.video_url = Some(" https://youtu.be/dQw4w9WgXcQ?t=42 ".into());
        fields.normalize();
        assert_eq!(
            fields.video_url.as_deref(),
            Some("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        );
    }
}
