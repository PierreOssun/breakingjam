//! sqlx queries, one module per aggregate.

pub mod battles;
pub mod claims;
pub mod crews;
pub mod dancers;
pub mod dataset;
pub mod events;
pub mod organizers;
pub mod sessions;
pub mod stats;
pub mod users;

/// Rows `offset .. offset + limit` of an ordered query, for offset-paged lists.
#[derive(Debug, Clone, Copy)]
pub struct Window {
    /// Maximum rows returned.
    pub limit: i64,
    /// Rows skipped first.
    pub offset: i64,
}

/// `%text%` for `ilike`, with the user's `%`, `_` and `\` matched literally.
pub(crate) fn contains_pattern(text: &str) -> String {
    let escaped = text
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}
