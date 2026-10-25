//! `/events/{id}/flyer`: the flyer an organiser uploads in place of the generated one.

use axum::{
    Json,
    body::Bytes,
    extract::{
        DefaultBodyLimit, Multipart, Path, State,
        multipart::{MultipartError, MultipartRejection},
    },
};
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};
use uuid::Uuid;

use super::events::writable;
use crate::{
    auth::session::CurrentUser,
    db,
    domain::event::{Event, UploadedFlyer},
    error::{AppError, InvalidFields, JamNotVisible, NotJamWriter, Unauthorized},
    media::{self, ImageSpec, MediaStore},
    state::AppState,
};

/// Both images and the multipart framing around them.
const BODY_LIMIT: usize = media::FLYER.max_bytes + media::FLYER_CARD.max_bytes + 64 * 1024;

/// `/events/{id}/flyer` routes.
pub fn router() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(upload, remove))
        .layer(DefaultBodyLimit::max(BODY_LIMIT))
}

/// `POST /events/{id}/flyer` body: one 4:5 crop, cropped and encoded in the browser.
#[derive(Debug, ToSchema)]
pub struct FlyerUpload {
    /// 1080×1350 JPEG of at most 2 MB, for the jam page.
    #[schema(value_type = String, format = Binary)]
    pub flyer: Bytes,
    /// 540×675 JPEG of at most 400 KB, for cards, lists and the map.
    #[schema(value_type = String, format = Binary)]
    pub card: Bytes,
}

/// Replace the jam's flyer, generated or uploaded, with this one; it shows at once, with no
/// review, and admins can remove it.
#[utoipa::path(
    post,
    path = "/events/{id}/flyer",
    tag = "events",
    operation_id = "upload_event_flyer",
    params(("id" = Uuid, Path, description = "Jam id")),
    request_body(content = FlyerUpload, content_type = "multipart/form-data"),
    security(("session" = [])),
    responses(
        (status = OK, body = Event),
        Unauthorized,
        NotJamWriter,
        JamNotVisible,
        InvalidFields,
    )
)]
async fn upload(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
    multipart: Result<Multipart, MultipartRejection>,
) -> Result<Json<Event>, AppError> {
    writable(&state, &current, id).await?;
    let multipart = multipart.map_err(|rejection| unreadable(rejection.body_text()))?;
    let upload = FlyerUpload::read(multipart).await?;
    // A new key per upload, so a URL never shows two different images.
    let key = format!("flyers/{id}/{}", Uuid::now_v7());
    let (full_key, card_key) = (format!("{key}.jpg"), format!("{key}-card.jpg"));
    let (url, card_url) = tokio::try_join!(
        state.media.put_jpeg(&full_key, upload.flyer),
        state.media.put_jpeg(&card_key, upload.card),
    )
    .map_err(|err| AppError::Internal(err.into()))?;
    let flyer = UploadedFlyer { url, card_url };
    let (event, old) = db::events::set_flyer(&state.pool, id, Some(&flyer)).await?;
    discard(&state.media, old);
    Ok(Json(event))
}

/// Go back to the generated flyer; also how admins take down an unsuitable one.
#[utoipa::path(
    delete,
    path = "/events/{id}/flyer",
    tag = "events",
    operation_id = "remove_event_flyer",
    params(("id" = Uuid, Path, description = "Jam id")),
    security(("session" = [])),
    responses(
        (status = OK, body = Event),
        Unauthorized,
        NotJamWriter,
        JamNotVisible,
    )
)]
async fn remove(
    State(state): State<AppState>,
    current: CurrentUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Event>, AppError> {
    writable(&state, &current, id).await?;
    let (event, old) = db::events::set_flyer(&state.pool, id, None).await?;
    discard(&state.media, old);
    Ok(Json(event))
}

impl FlyerUpload {
    /// Both parts, each checked against its spec; a 422 names the one missing or wrong.
    async fn read(mut multipart: Multipart) -> Result<Self, AppError> {
        let (mut flyer, mut card) = (None, None);
        while let Some(part) = multipart.next_field().await.map_err(unreadable_part)? {
            let slot = match part.name() {
                Some("flyer") => &mut flyer,
                Some("card") => &mut card,
                _ => continue,
            };
            *slot = Some(part.bytes().await.map_err(unreadable_part)?);
        }
        Ok(Self {
            flyer: checked("flyer", flyer, &media::FLYER)?,
            card: checked("card", card, &media::FLYER_CARD)?,
        })
    }
}

fn checked(field: &str, bytes: Option<Bytes>, spec: &ImageSpec) -> Result<Bytes, AppError> {
    let bytes = bytes.ok_or_else(|| AppError::invalid(field, "is missing"))?;
    spec.check(&bytes)
        .map_err(|message| AppError::invalid(field, message))?;
    Ok(bytes)
}

/// A body that is not multipart, is malformed or is over the limit.
fn unreadable(reason: String) -> AppError {
    AppError::invalid("body", &reason)
}

fn unreadable_part(err: MultipartError) -> AppError {
    unreadable(err.body_text())
}

/// Deletes a replaced flyer's images in the background, so a request dropped after the save
/// can't leave them public; a failure only leaves unused files behind.
pub(super) fn discard(media: &MediaStore, old: Option<UploadedFlyer>) {
    let Some(old) = old else {
        return;
    };
    let media = media.clone();
    tokio::spawn(async move {
        let (full, card) = tokio::join!(media.delete(&old.url), media.delete(&old.card_url));
        for (url, result) in [(&old.url, full), (&old.card_url, card)] {
            if let Err(error) = result {
                tracing::warn!(%error, url, "could not delete a replaced flyer image");
            }
        }
    });
}
