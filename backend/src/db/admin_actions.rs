//! `admin_actions` queries: the admins' log (M31).

use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::domain::{
    admin_action::{AdminAction, JamDecision, Logged},
    dancer::EventRef,
    event::{EventStatus, Phase},
    user::Role,
};

/// Logs what `admin_id` did, inside the transaction that does it.
pub async fn record(
    conn: &mut PgConnection,
    admin_id: Uuid,
    logged: Logged<'_>,
) -> sqlx::Result<()> {
    let (action, event_id, dancer_id, user_id, role, note) = match logged {
        Logged::JamApproved(event) => (
            AdminAction::JamApproved,
            Some(event),
            None,
            None,
            None,
            None,
        ),
        Logged::JamRejected(event, note) => (
            AdminAction::JamRejected,
            Some(event),
            None,
            None,
            None,
            Some(note),
        ),
        Logged::DancerMerged(dancer) => (
            AdminAction::DancerMerged,
            None,
            Some(dancer),
            None,
            None,
            None,
        ),
        Logged::RoleChanged(user, role) => (
            AdminAction::RoleChanged,
            None,
            None,
            Some(user),
            Some(role),
            None,
        ),
    };
    sqlx::query!(
        "insert into admin_actions (id, admin_id, action, event_id, dancer_id, user_id, role, note)
         values ($1, $2, $3, $4, $5, $6, $7, $8)",
        Uuid::now_v7(),
        admin_id,
        action as AdminAction,
        event_id,
        dancer_id,
        user_id,
        role as Option<Role>,
        note,
    )
    .execute(conn)
    .await?;
    Ok(())
}

/// Every jam approval and rejection, the newest first.
pub async fn jam_history(pool: &PgPool, window: super::Window) -> sqlx::Result<Vec<JamDecision>> {
    let rows = sqlx::query!(
        r#"select a.id, a.action as "action: AdminAction", a.note, a.created_at,
                  admin.email::text as "admin_email!", owner.email::text as "organizer_email!",
                  e.id as event_id, e.name, e.slug, e.starts_on, e.ends_on, e.city, e.country,
                  e.status as "status: EventStatus",
                  jam_phase(e.starts_on, e.ends_on, e.timezone) as "phase!: Phase"
           from admin_actions a
           join app_users admin on admin.id = a.admin_id
           join events e on e.id = a.event_id
           join app_users owner on owner.id = e.organizer_id
           where a.action in ('jam_approved', 'jam_rejected')
           order by a.created_at desc, a.id desc
           limit $1 offset $2"#,
        window.limit,
        window.offset,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| JamDecision {
            id: r.id,
            action: r.action,
            note: r.note,
            decided_at: r.created_at,
            admin_email: r.admin_email,
            organizer_email: r.organizer_email,
            jam: EventRef {
                id: r.event_id,
                name: r.name,
                slug: r.slug,
                starts_on: r.starts_on,
                ends_on: r.ends_on,
                city: r.city,
                country: r.country,
                status: r.status,
                phase: r.phase,
            },
        })
        .collect())
}
