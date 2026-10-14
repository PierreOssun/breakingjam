//! API error type and its JSON envelope.

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;

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
    /// 409: a uniqueness rule was violated.
    #[error("{0}")]
    Conflict(String),
    /// 500: anything unexpected; logged, never shown to the client.
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

/// One invalid input field.
#[derive(Debug, Serialize)]
pub struct FieldError {
    /// Field name as sent by the client.
    pub field: String,
    /// Human-readable reason.
    pub message: String,
}

#[derive(Serialize)]
struct ErrorEnvelope<'a> {
    error: ErrorBody<'a>,
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    code: &'static str,
    message: String,
    #[serde(skip_serializing_if = "<[_]>::is_empty")]
    fields: &'a [FieldError],
}

impl AppError {
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
        let fields = match &self {
            Self::Validation(fields) => fields.as_slice(),
            _ => &[],
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
                    field: field.to_string(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::BodyExt;
    use serde_json::{Value, json};

    async fn render(err: AppError) -> (StatusCode, Value) {
        let response = err.into_response();
        let status = response.status();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&body).unwrap())
    }

    #[tokio::test]
    async fn not_found_has_envelope_without_fields() {
        let (status, body) = render(AppError::NotFound).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(
            body,
            json!({ "error": { "code": "not_found", "message": "not found" } })
        );
    }

    #[tokio::test]
    async fn validation_lists_fields() {
        let err = AppError::Validation(vec![FieldError {
            field: "email".into(),
            message: "invalid email".into(),
        }]);
        let (status, body) = render(err).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(
            body["error"]["fields"],
            json!([{ "field": "email", "message": "invalid email" }])
        );
    }

    #[tokio::test]
    async fn internal_hides_the_cause() {
        let (status, body) = render(anyhow::anyhow!("db password leaked").into()).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["error"]["message"], "internal server error");
    }

    #[test]
    fn row_not_found_maps_to_not_found() {
        assert!(matches!(
            AppError::from(sqlx::Error::RowNotFound),
            AppError::NotFound
        ));
    }

    #[sqlx::test]
    async fn unique_violation_maps_to_conflict(pool: sqlx::PgPool) {
        let insert = |id: uuid::Uuid| {
            sqlx::query!(
                "insert into app_users (id, email, display_name) values ($1, $2, 'Test')",
                id,
                "dup@test.local",
            )
            .execute(&pool)
        };
        insert(uuid::Uuid::now_v7()).await.unwrap();
        let err = insert(uuid::Uuid::now_v7()).await.unwrap_err();

        match AppError::from(err) {
            AppError::Conflict(message) => assert!(message.contains("app_users_email_key")),
            other => panic!("expected Conflict, got {other:?}"),
        }
    }
}
