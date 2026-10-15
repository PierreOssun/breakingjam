//! Dancers: profile fields, origin and who may edit them.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::{Validate, ValidationError};

use super::{
    battle::{BattleAge, BattleFormat, BattleGender, BracketStage, EntryStatus, StaffRole},
    country_code,
    crew::CrewRef,
    event::EventStatus,
    not_blank,
    user::{Role, User},
};

/// Where a dancer row came from (§4 "Dancer identity").
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, utoipa::ToSchema,
)]
#[sqlx(type_name = "dancer_source", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum DancerSource {
    /// Entered by a `seed_admin`; marked notable.
    Seed,
    /// Created during jam registration.
    Organizer,
    /// A logged-in user creating their own page.
    #[sqlx(rename = "self")]
    #[serde(rename = "self")]
    SelfCreated,
}

impl DancerSource {
    /// The origin implied by who creates the row.
    pub fn for_creator(role: Role) -> Self {
        match role {
            Role::User => Self::SelfCreated,
            Role::Organizer => Self::Organizer,
            Role::SeedAdmin | Role::Admin => Self::Seed,
        }
    }
}

/// A stored dancer; `user_id` and `created_by` are never serialized.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Dancer {
    /// Primary key, UUIDv7.
    pub id: Uuid,
    /// Owner account, set only by an approved claim.
    #[serde(skip)]
    pub user_id: Option<Uuid>,
    /// Stage name; not unique.
    pub dancer_name: String,
    /// Other names the dancer goes by.
    pub aliases: Vec<String>,
    /// Legal name, when shared.
    pub real_name: Option<String>,
    /// Primary flag, ISO 3166-1 alpha-2.
    pub country: String,
    /// Optional second flag.
    pub country2: Option<String>,
    /// Home city.
    pub city: Option<String>,
    /// Free text.
    pub bio: Option<String>,
    /// Lower case, no `@`; the identity key when present.
    pub instagram_handle: Option<String>,
    /// Where the row came from.
    pub source: DancerSource,
    /// Set once a claim is approved; the UI shows a verified tick.
    pub verified_at: Option<DateTime<Utc>>,
    /// Uploaded picture; null means the generated avatar.
    pub avatar_url: Option<String>,
    #[serde(skip)]
    pub created_by: Option<Uuid>,
    /// Set when an admin merged this row into another; it is then only a redirect.
    pub merged_into_id: Option<Uuid>,
    /// Row creation time.
    pub created_at: DateTime<Utc>,
    /// Last write, maintained by a trigger.
    pub updated_at: DateTime<Utc>,
}

impl Dancer {
    /// `seed_admin`+ always; a verified page only by its owner; an unverified one by its creator.
    pub fn can_edit(&self, user: &User) -> bool {
        if user.role >= Role::SeedAdmin {
            return true;
        }
        match self.verified_at {
            Some(_) => self.user_id == Some(user.id),
            None => self.created_by == Some(user.id),
        }
    }
}

/// A search result: enough to tell two "Lil G"s apart (§4: name · @handle · country · crew).
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct DancerSummary {
    /// Dancer id.
    pub id: Uuid,
    /// Stage name.
    pub dancer_name: String,
    /// Other names the dancer goes by.
    pub aliases: Vec<String>,
    /// Primary flag, ISO 3166-1 alpha-2.
    pub country: String,
    /// Optional second flag.
    pub country2: Option<String>,
    /// Home city.
    pub city: Option<String>,
    /// Lower case, no `@`.
    pub instagram_handle: Option<String>,
    /// Whether an approved claim links the page to its owner.
    pub verified: bool,
    /// Current crews.
    pub crews: Vec<CrewRef>,
}

/// One changed field for the `dancer_edits` log: `(field, old, new)`, values as text.
pub type FieldChange = (&'static str, Option<String>, Option<String>);

/// The profile fields that differ between two versions of a dancer.
pub fn changes(old: &Dancer, new: &Dancer) -> Vec<FieldChange> {
    let aliases = |d: &Dancer| (!d.aliases.is_empty()).then(|| d.aliases.join(", "));
    let fields: [FieldChange; 8] = [
        (
            "dancer_name",
            Some(old.dancer_name.clone()),
            Some(new.dancer_name.clone()),
        ),
        ("aliases", aliases(old), aliases(new)),
        ("real_name", old.real_name.clone(), new.real_name.clone()),
        (
            "country",
            Some(old.country.clone()),
            Some(new.country.clone()),
        ),
        ("country2", old.country2.clone(), new.country2.clone()),
        ("city", old.city.clone(), new.city.clone()),
        ("bio", old.bio.clone(), new.bio.clone()),
        (
            "instagram_handle",
            old.instagram_handle.clone(),
            new.instagram_handle.clone(),
        ),
    ];
    fields.into_iter().filter(|(_, a, b)| a != b).collect()
}

/// Aliases after merging `loser` into `survivor`: both lists plus the loser's name,
/// without duplicates (case-insensitive) and without the survivor's own name.
pub fn merged_aliases(survivor: &Dancer, loser: &Dancer) -> Vec<String> {
    let mut seen = vec![survivor.dancer_name.to_lowercase()];
    survivor
        .aliases
        .iter()
        .chain(&loser.aliases)
        .chain(std::iter::once(&loser.dancer_name))
        .filter(|alias| {
            let key = alias.to_lowercase();
            let fresh = !seen.contains(&key);
            seen.push(key);
            fresh
        })
        .cloned()
        .collect()
}

/// A dancer as linked from a jam page: enough to render the name, flags and handle.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct DancerRef {
    /// Dancer id.
    pub id: Uuid,
    /// Stage name.
    pub dancer_name: String,
    /// Primary flag, ISO 3166-1 alpha-2.
    pub country: String,
    /// Optional second flag.
    pub country2: Option<String>,
    /// Lower case, no `@`.
    pub instagram_handle: Option<String>,
}

/// One appearance at a public jam: the jam, the battle when competing, the result when known.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct Participation {
    /// The jam.
    pub event: EventRef,
    /// The battle entered; null for staff.
    pub battle: Option<BattleRef>,
    /// Competitor, or the staff role held.
    pub role: ParticipationRole,
    /// Registration state; null for staff.
    pub entry_status: Option<EntryStatus>,
    /// Furthest stage reached; null for staff.
    pub reached: Option<BracketStage>,
    /// Exact placement when known.
    pub final_rank: Option<i32>,
    /// Battle video, when attached.
    pub video_url: Option<String>,
    /// Whether the jam starts today or later; splits the dancer page's two lists.
    #[serde(skip)]
    pub upcoming: bool,
}

/// The jam side of a participation.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct EventRef {
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
    /// Where it is in its lifecycle.
    pub status: EventStatus,
}

/// The battle side of a participation.
#[derive(Debug, Clone, Serialize, utoipa::ToSchema)]
pub struct BattleRef {
    /// Battle id.
    pub id: Uuid,
    /// Display name, e.g. "1v1 Bboy".
    pub name: String,
    /// How it is run.
    pub format: BattleFormat,
    /// Team size for team battles.
    pub team_size: Option<i16>,
    /// Who may enter.
    pub gender: BattleGender,
    /// Age category.
    pub age: BattleAge,
}

/// Competitor, or the staff role held at the jam.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ParticipationRole {
    /// Entered a battle.
    Competitor,
    /// Judged.
    Judge,
    /// Played the music.
    Dj,
    /// Hosted.
    Mc,
    /// Ran the jam.
    Organizer,
    /// Any other staff role.
    Other,
}

impl From<Option<StaffRole>> for ParticipationRole {
    fn from(role: Option<StaffRole>) -> Self {
        match role {
            None => Self::Competitor,
            Some(StaffRole::Judge) => Self::Judge,
            Some(StaffRole::Dj) => Self::Dj,
            Some(StaffRole::Mc) => Self::Mc,
            Some(StaffRole::Organizer) => Self::Organizer,
            Some(StaffRole::Other) => Self::Other,
        }
    }
}

/// Everything set when creating or editing a dancer.
#[derive(Debug, Clone, Deserialize, Validate, utoipa::ToSchema)]
pub struct DancerFields {
    /// Stage name, up to 100 characters; not unique.
    #[validate(length(max = 100), custom(function = "not_blank"))]
    pub dancer_name: String,
    /// Other names the dancer goes by, at most 10.
    #[serde(default)]
    #[validate(length(max = 10), custom(function = "aliases"))]
    pub aliases: Vec<String>,
    /// Blank is stored as null.
    #[validate(length(max = 100))]
    pub real_name: Option<String>,
    /// Primary flag, ISO 3166-1 alpha-2.
    #[validate(custom(function = "country_code"))]
    pub country: String,
    /// Optional second flag.
    #[validate(custom(function = "country_code"))]
    pub country2: Option<String>,
    /// Blank is stored as null.
    #[validate(length(max = 100))]
    pub city: Option<String>,
    /// Blank is stored as null.
    #[validate(length(max = 2000))]
    pub bio: Option<String>,
    /// `@handle` or `handle`; the identity key when present, unique case-insensitively.
    #[validate(custom(function = "crate::domain::instagram_handle"))]
    pub instagram_handle: Option<String>,
}

fn aliases(values: &[String]) -> Result<(), ValidationError> {
    if values
        .iter()
        .all(|a| !a.trim().is_empty() && a.chars().count() <= 100)
    {
        return Ok(());
    }
    Err(ValidationError::new("aliases")
        .with_message("each alias must be 1 to 100 characters".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dancer(verified: bool, user_id: Option<Uuid>, created_by: Option<Uuid>) -> Dancer {
        Dancer {
            id: Uuid::now_v7(),
            user_id,
            dancer_name: "Lil G".into(),
            aliases: vec![],
            real_name: None,
            country: "FR".into(),
            country2: None,
            city: None,
            bio: None,
            instagram_handle: None,
            source: DancerSource::Organizer,
            verified_at: verified.then(Utc::now),
            avatar_url: None,
            created_by,
            merged_into_id: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    fn user(role: Role) -> User {
        User {
            id: Uuid::now_v7(),
            email: String::new(),
            display_name: String::new(),
            role,
        }
    }

    #[test]
    fn edit_rights() {
        let creator = user(Role::Organizer);
        let owner = user(Role::User);
        let stranger = user(Role::Organizer);

        let unverified = dancer(false, None, Some(creator.id));
        assert!(unverified.can_edit(&creator));
        assert!(!unverified.can_edit(&stranger));

        let verified = dancer(true, Some(owner.id), Some(creator.id));
        assert!(verified.can_edit(&owner));
        assert!(
            !verified.can_edit(&creator),
            "verification hands the page to its owner"
        );
        assert!(verified.can_edit(&user(Role::SeedAdmin)));
    }

    #[test]
    fn changes_list_only_differences() {
        let old = dancer(false, None, None);
        let mut new = old.clone();
        new.city = Some("Lyon".into());
        new.aliases = vec!["G".into()];
        let changed: Vec<&str> = changes(&old, &new).iter().map(|c| c.0).collect();
        assert_eq!(changed, ["aliases", "city"]);
        assert_eq!(changes(&old, &new)[1], ("city", None, Some("Lyon".into())));
    }

    #[test]
    fn merged_aliases_union_without_duplicates() {
        let mut survivor = dancer(false, None, None);
        survivor.dancer_name = "Kid Rocket".into();
        survivor.aliases = vec!["Rocket".into()];
        let mut loser = dancer(false, None, None);
        loser.dancer_name = "Kid Rockett".into();
        loser.aliases = vec!["rocket".into(), "KR".into(), "kid rocket".into()];
        assert_eq!(
            merged_aliases(&survivor, &loser),
            ["Rocket", "KR", "Kid Rockett"]
        );
    }

    #[test]
    fn source_follows_creator_role() {
        assert_eq!(
            DancerSource::for_creator(Role::User),
            DancerSource::SelfCreated
        );
        assert_eq!(
            DancerSource::for_creator(Role::Organizer),
            DancerSource::Organizer
        );
        assert_eq!(
            DancerSource::for_creator(Role::SeedAdmin),
            DancerSource::Seed
        );
    }
}
