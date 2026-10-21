//! API error type and its JSON envelope.

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;
use utoipa::{IntoResponses, ToSchema};

/// Every error a handler can return; maps 1:1 to an HTTP status.
#[derive(Debug, Error)]
pub enum AppError {
    /// 404: the resource does not exist or is soft-deleted.
    #[error("not found")]
    NotFound,
    /// 422: the request body failed validation.
    #[error("validation failed")]
    Validation(Vec<FieldError>),
    /// 401: no valid session.
    #[error("unauthorized")]
    Unauthorized,
    /// 403: logged in but not allowed.
    #[error("forbidden")]
    Forbidden,
    /// 409: a uniqueness rule or a status transition was violated.
    #[error("{0}")]
    Conflict(String),
    /// 500: anything unexpected; logged, never shown to the client.
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

/// 401 of every route behind a session.
#[derive(IntoResponses)]
#[response(status = 401, description = "No valid session")]
pub struct Unauthorized(pub ErrorEnvelope);

/// 403 of the admin-only routes.
#[derive(IntoResponses)]
#[response(status = 403, description = "Not an admin")]
pub struct NotAdmin(pub ErrorEnvelope);

/// 422 of every route with a validated body.
#[derive(IntoResponses)]
#[response(status = 422, description = "Invalid fields")]
pub struct InvalidFields(pub ErrorEnvelope);

/// 422 of every paginated route.
#[derive(IntoResponses)]
#[response(status = 422, description = "Invalid cursor")]
pub struct InvalidCursor(pub ErrorEnvelope);

/// 404 of every route under a jam.
#[derive(IntoResponses)]
#[response(status = 404, description = "No such jam, or a draft you can't see")]
pub struct JamNotVisible(pub ErrorEnvelope);

/// 403 of every route that edits a jam.
#[derive(IntoResponses)]
#[response(
    status = 403,
    description = "Not the jam's organiser nor `seed_admin`+"
)]
pub struct NotJamWriter(pub ErrorEnvelope);

/// One invalid input field.
#[derive(Debug, Serialize, ToSchema)]
pub struct FieldError {
    /// Field name as sent by the client.
    pub field: String,
    /// Human-readable reason.
    pub message: String,
}

/// Body of every error response (§5 Error handling).
#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorEnvelope {
    /// The error itself, under a single key so clients can test for it.
    pub error: ErrorBody,
}

/// What went wrong; `fields` only for validation errors.
#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorBody {
    /// `not_found`, `validation`, `unauthorized`, `forbidden`, `conflict` or `internal`.
    pub code: &'static str,
    /// Human-readable; generic for `internal`.
    pub message: String,
    /// Each invalid field, for `validation`.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub fields: Vec<FieldError>,
}

impl From<(&str, &str)> for FieldError {
    fn from((field, message): (&str, &str)) -> Self {
        Self {
            field: field.into(),
            message: message.into(),
        }
    }
}

impl AppError {
    /// A 422 on one field.
    pub fn invalid(field: &str, message: &str) -> Self {
        Self::Validation(vec![(field, message).into()])
    }

    /// `Ok` when `errors` is empty, else a 422 listing each `(field, message)`.
    pub fn check(errors: Vec<(&'static str, &'static str)>) -> Result<(), Self> {
        if errors.is_empty() {
            return Ok(());
        }
        Err(Self::Validation(
            errors.into_iter().map(FieldError::from).collect(),
        ))
    }

    fn status_and_code(&self) -> (StatusCode, &'static str) {
        match self {
            Self::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            Self::Validation(_) => (StatusCode::UNPROCESSABLE_ENTITY, "validation"),
            Self::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            Self::Forbidden => (StatusCode::FORBIDDEN, "forbidden"),
            Self::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            Self::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal"),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = self.status_and_code();
        let message = match &self {
            Self::Internal(err) => {
                tracing::error!(error = ?err, "internal error");
                "internal server error".to_owned()
            }
            other => other.to_string(),
        };
        let fields = match self {
            Self::Validation(fields) => fields,
            _ => Vec::new(),
        };
        let body = ErrorEnvelope {
            error: ErrorBody {
                code,
                message,
                fields,
            },
        };
        (status, Json(body)).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => Self::NotFound,
            sqlx::Error::Database(db) if db.is_unique_violation() => Self::Conflict(format!(
                "already exists ({})",
                db.constraint().unwrap_or("unique")
            )),
            // Domain validation should catch these first; this keeps a missed rule a 422, not a 500.
            sqlx::Error::Database(db)
                if db.is_check_violation() || db.is_foreign_key_violation() =>
            {
                Self::Validation(vec![FieldError {
                    field: db.constraint().unwrap_or("body").to_owned(),
                    message: "violates a database rule".into(),
                }])
            }
            other => Self::Internal(other.into()),
        }
    }
}

impl From<validator::ValidationErrors> for AppError {
    fn from(errors: validator::ValidationErrors) -> Self {
        let mut fields: Vec<FieldError> = errors
            .field_errors()
            .into_iter()
            .flat_map(|(field, errors)| {
                errors.iter().map(move |error| FieldError {
                    // Struct-level rules land under `__all__` and name their field in `code`.
                    field: if field == "__all__" {
                        error.code.to_string()
                    } else {
                        field.to_string()
                    },
                    message: error
                        .message
                        .as_ref()
                        .map_or_else(|| error.code.to_string(), ToString::to_string),
                })
            })
            .collect();
        // Field errors come from a HashMap; sort for a stable response.
        fields.sort_by(|a, b| a.field.cmp(&b.field));
        Self::Validation(fields)
    }
}
