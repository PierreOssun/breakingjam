//! The admins' log: jam decisions, merges and role changes (M31).

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use super::{dancer::EventRef, user::Role};

/// What an admin did.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, sqlx::Type, utoipa::ToSchema)]
#[sqlx(type_name = "admin_action", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum AdminAction {
    /// A jam in review went public.
    JamApproved,
    /// A jam in review went back to draft, with a note.
    JamRejected,
    /// A dancer page was merged into another.
    DancerMerged,
    /// An account's role changed.
    RoleChanged,
}

/// One entry to log, with what it is about.
#[derive(Debug, Clone, Copy)]
pub enum Logged<'a> {
    /// The approved jam.
    JamApproved(Uuid),
    /// The rejected jam and the note its organiser sees.
    JamRejected(Uuid, &'a str),
    /// The dancer merged away.
    DancerMerged(Uuid),
    /// The account and its new role.
    RoleChanged(Uuid, Role),
}

/// An approval or a rejection, for the history under the jam queue.
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct JamDecision {
    /// Log entry id.
    pub id: Uuid,
    /// `jam_approved` or `jam_rejected`.
    pub action: AdminAction,
    /// The rejection note; null for an approval.
    pub note: Option<String>,
    /// When it was decided.
    pub decided_at: DateTime<Utc>,
    /// The admin who decided.
    pub admin_email: String,
    /// The login email of the account that owns the jam now.
    pub organizer_email: String,
    /// The jam.
    pub jam: EventRef,
}
