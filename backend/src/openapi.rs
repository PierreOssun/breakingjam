//! OpenAPI document: metadata, tags and the session cookie; paths come from `api` handlers.

use utoipa::{
    Modify, OpenApi,
    openapi::security::{ApiKey, ApiKeyValue, SecurityScheme},
};
use utoipa_axum::router::OpenApiRouter;

use crate::state::AppState;

#[derive(OpenApi)]
#[openapi(
    info(
        title = "BreakingJam API",
        description = "The central place for breaking jams. Authenticated calls use the `bj_session` cookie set by register, login or Google sign-in."
    ),
    modifiers(&SessionCookie),
    tags(
        (name = "health", description = "Liveness"),
        (name = "auth", description = "Accounts and sessions"),
        (name = "events", description = "Jams, their status and the map"),
        (name = "battles", description = "Battles, entries and staff of a jam"),
        (name = "dancers", description = "Dancer pages and search-before-create"),
        (name = "crews", description = "Crews and memberships"),
        (name = "claims", description = "\"Verify me\" claims and their review"),
        (name = "admin", description = "Merging dancers and changing roles"),
        (name = "organizers", description = "Organiser pages and their Instagram verification")
    )
)]
struct ApiDoc;

/// Declares the `session` security scheme that protected operations refer to.
struct SessionCookie;

impl Modify for SessionCookie {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi.components.get_or_insert_with(Default::default);
        components.add_security_scheme(
            "session",
            SecurityScheme::ApiKey(ApiKey::Cookie(ApiKeyValue::new("bj_session"))),
        );
    }
}

/// Every `/api` route together with its OpenAPI description, from the same handlers.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::with_openapi(ApiDoc::openapi()).nest("/api", crate::api::router())
}
