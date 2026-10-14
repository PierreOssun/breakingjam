//! Battles, entries and staff: the Postgres enums (§4). Rules arrive with the M7 endpoints.

use serde::{Deserialize, Serialize};

/// How a battle is run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "battle_format", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum BattleFormat {
    /// 1v1 … 10v10, size in `team_size`.
    Team,
    SevenToSmoke,
    Na,
}

/// Who may enter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "battle_gender", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum BattleGender {
    Bboy,
    Bgirl,
    /// Open to both.
    Mixed,
}

/// Age category.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "battle_age", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum BattleAge {
    Kids,
    Adult,
    Na,
}

/// Furthest stage an entry reached; `Winner` is first place.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
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
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "entry_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum EntryStatus {
    Pending,
    Confirmed,
    Withdrawn,
}

/// What a staff member does at a jam.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "staff_role", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum StaffRole {
    Judge,
    Dj,
    Mc,
    Organizer,
    Other,
}
