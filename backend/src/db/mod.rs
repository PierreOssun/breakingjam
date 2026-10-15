//! sqlx queries, one module per aggregate.

pub mod battles;
pub mod claims;
pub mod crews;
pub mod dancers;
pub mod events;
pub mod sessions;
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
fn contains_pattern(text: &str) -> String {
    let escaped = text
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contains_pattern_escapes_wildcards() {
        assert_eq!(contains_pattern("lil_g"), "%lil\\_g%");
        assert_eq!(contains_pattern("100%"), "%100\\%%");
    }
}
