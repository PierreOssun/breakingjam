//! Cursor pagination: `?limit=&cursor=` in, `{ items, next_cursor }` out (§5 Handlers).

use serde::Serialize;

const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 200;

/// One page of a list endpoint; `next_cursor` is null on the last page.
#[derive(Debug, Serialize)]
pub struct Page<T> {
    /// At most `limit` rows.
    pub items: Vec<T>,
    /// Pass as `?cursor=` for the next page; null on the last one.
    pub next_cursor: Option<String>,
}

/// The requested page size, defaulted and clamped to 1..=200.
pub fn limit(requested: Option<i64>) -> i64 {
    requested.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

impl<T> Page<T> {
    /// Builds a page from `limit + 1` fetched rows: the extra row only signals that more exist.
    pub fn from_rows(mut rows: Vec<T>, limit: i64, cursor_of: impl Fn(&T) -> String) -> Self {
        let has_more = rows.len() as i64 > limit;
        rows.truncate(limit as usize);
        let next_cursor = if has_more {
            rows.last().map(cursor_of)
        } else {
            None
        };
        Self {
            items: rows,
            next_cursor,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limit_defaults_and_clamps() {
        assert_eq!(limit(None), 50);
        assert_eq!(limit(Some(0)), 1);
        assert_eq!(limit(Some(1000)), 200);
    }

    #[test]
    fn cursor_only_when_more_rows_exist() {
        let page = Page::from_rows(vec![1, 2, 3], 2, |n| n.to_string());
        assert_eq!(page.items, [1, 2]);
        assert_eq!(page.next_cursor.as_deref(), Some("2"));

        let last = Page::from_rows(vec![1, 2], 2, |n| n.to_string());
        assert_eq!(last.next_cursor, None);
    }
}
