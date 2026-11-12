//! `/sitemap.xml`: every public page for search engines; the Worker serves it at the site's root.

use axum::{
    extract::State,
    http::header::{CACHE_CONTROL, CONTENT_TYPE},
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::{
    db::{self, sitemap::SitemapPage},
    error::{AppError, ErrorEnvelope},
    state::AppState,
};

/// The site's own pages, listed before the jams, dancers and organisers.
const SITE_PAGES: [&str; 7] = [
    "", "/jams", "/dancers", "/map", "/team", "/contact", "/privacy",
];

/// `/sitemap.xml`, public.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(sitemap))
}

/// The sitemap protocol's list of every public page, with when each last changed.
#[utoipa::path(
    get,
    path = "/sitemap.xml",
    tag = "sitemap",
    operation_id = "sitemap",
    responses(
        (status = OK, description = "A sitemaps.org `urlset`", content_type = "application/xml", body = String),
        (status = INTERNAL_SERVER_ERROR, description = "Database unreachable", body = ErrorEnvelope),
    )
)]
async fn sitemap(State(state): State<AppState>) -> Result<Response, AppError> {
    let pages = db::sitemap::pages(&state.pool).await?;
    let base = state.config.app_base_url.trim_end_matches('/');
    let headers = [
        (CONTENT_TYPE, "application/xml; charset=utf-8"),
        (CACHE_CONTROL, "public, max-age=3600"),
    ];
    Ok((headers, urlset(base, &pages)).into_response())
}

/// The XML document: the site's pages, then one `<url>` per listed page.
fn urlset(base: &str, pages: &[SitemapPage]) -> String {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n",
    );
    for path in SITE_PAGES {
        url(&mut xml, &format!("{base}{path}"), None);
    }
    for page in pages {
        let loc = format!("{base}/{}/{}", page.section.path(), segment(&page.key));
        url(&mut xml, &loc, page.updated_at);
    }
    xml.push_str("</urlset>\n");
    xml
}

/// Appends one `<url>`; `loc` is already percent-encoded, so it holds nothing XML must escape.
fn url(xml: &mut String, loc: &str, updated_at: Option<DateTime<Utc>>) {
    let lastmod = updated_at
        .map(|at| format!("<lastmod>{}</lastmod>", at.date_naive()))
        .unwrap_or_default();
    xml.push_str(&format!("<url><loc>{loc}</loc>{lastmod}</url>\n"));
}

/// The key as one URL path segment: slugs keep any letter, which a URL must percent-encode.
fn segment(key: &str) -> String {
    key.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                char::from(b).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}
