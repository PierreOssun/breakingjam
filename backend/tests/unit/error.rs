//! Unit tests of `crate::error`.

use axum::{http::StatusCode, response::IntoResponse};
use http_body_util::BodyExt;
use serde_json::{Value, json};

use crate::error::*;

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
