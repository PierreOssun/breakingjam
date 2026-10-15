//! Cursor pagination: `?limit=&cursor=` in, `{ items, next_cursor }` out (§5 Handlers).

use serde::Serialize;

use crate::{db, error::AppError};

const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 200;

/// One page of a list endpoint; `next_cursor` is null on the last page.
#[derive(Debug, Serialize, utoipa::ToSchema)]
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

/// 422 on field `cursor`, for cursors this API did not issue.
pub fn invalid_cursor() -> AppError {
    AppError::invalid("cursor", "invalid cursor")
}

/// Rows to skip for search lists, whose cursor is the count already returned.
pub fn offset(cursor: Option<&str>) -> Result<i64, AppError> {
    match cursor {
        None => Ok(0),
        Some(cursor) => cursor
            .parse()
            .ok()
            .filter(|n: &i64| *n >= 0)
            .ok_or_else(invalid_cursor),
    }
}

/// The rows `from_offset` needs: one past `limit`, which only tells whether another page exists.
pub fn window(limit: i64, offset: i64) -> db::Window {
    db::Window {
        limit: limit + 1,
        offset,
    }
}

impl<T> Page<T> {
    /// Builds an offset page from `limit + 1` fetched rows; the next cursor is the count returned so far.
    pub fn from_offset(rows: Vec<T>, limit: i64, offset: i64) -> Self {
        Self::from_rows(rows, limit, |_| offset.saturating_add(limit).to_string())
    }

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
