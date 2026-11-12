//! The pages the sitemap lists: public jams, live dancer pages and organisers with a public jam.

use chrono::{DateTime, Utc};
use sqlx::PgPool;

/// The kind of page a sitemap row is.
#[derive(Debug, Clone, Copy, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
pub enum Section {
    /// `/jams/{slug}`.
    Jams,
    /// `/dancers/{id}`.
    Dancers,
    /// `/organizers/{id}`.
    Organizers,
}

impl Section {
    /// The first segment of its pages' paths.
    pub fn path(self) -> &'static str {
        match self {
            Self::Jams => "jams",
            Self::Dancers => "dancers",
            Self::Organizers => "organizers",
        }
    }
}

/// One page: `/{section}/{key}`, and when it last changed when that is known.
#[derive(Debug)]
pub struct SitemapPage {
    /// Which pages it belongs to.
    pub section: Section,
    /// The jam's slug, or the dancer's or organiser's id.
    pub key: String,
    /// The row's last write; null for organisers, whose page also changes with their jams.
    pub updated_at: Option<DateTime<Utc>>,
}

/// Every page a search engine may index, by section then key, so the file only changes with them.
pub async fn pages(pool: &PgPool) -> sqlx::Result<Vec<SitemapPage>> {
    // Same visibility as the pages themselves: drafts and jams in review are private, merged
    // dancers redirect, only `organizer`+ accounts have a page, and the team's would list
    // jams it doesn't run.
    sqlx::query_as!(
        SitemapPage,
        r#"select 'jams' as "section!: Section", slug as "key!", updated_at as "updated_at?"
           from events
           where deleted_at is null and status not in ('draft', 'in_review')
           union all
           select 'dancers', id::text, updated_at
           from dancers
           where deleted_at is null and merged_into_id is null
           union all
           select 'organizers', u.id::text, null
           from app_users u
           where u.role >= 'organizer'
             and exists (select 1 from events e
                         where e.organizer_id = u.id and e.deleted_at is null
                           and not e.entered_by_team and e.status not in ('draft', 'in_review'))
           order by 1, 2"#,
    )
    .fetch_all(pool)
    .await
}
