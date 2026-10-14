//! sqlx queries, one module per aggregate.

pub mod crews;
pub mod dancers;
pub mod events;
pub mod sessions;
pub mod users;

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
