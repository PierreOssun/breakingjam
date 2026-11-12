//! Pattern: extractor — path, query and JSON body become handler arguments, refused as `AppError`.

use axum::{
    Json,
    extract::{FromRequest, FromRequestParts, Request},
    http::request::Parts,
};
use serde::de::DeserializeOwned;
use validator::Validate;

use crate::error::{AppError, FieldError};

/// Like axum's `Path`, but a segment that doesn't parse (an id that isn't a uuid) is a 404.
pub struct Path<T>(pub T);

impl<S, T> FromRequestParts<S> for Path<T>
where
    S: Send + Sync,
    T: DeserializeOwned + Send,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, AppError> {
        // Nothing can be found at a path that doesn't parse.
        let axum::extract::Path(value) = axum::extract::Path::<T>::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::NotFound)?;
        Ok(Self(value))
    }
}

/// Like axum's `Query`, but a parameter that doesn't parse is a 422 in the error envelope.
pub struct Query<T>(pub T);

impl<S, T> FromRequestParts<S> for Query<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, AppError> {
        let axum::extract::Query(value) =
            axum::extract::Query::<T>::from_request_parts(parts, state)
                .await
                .map_err(|rejection| invalid("query", rejection.body_text()))?;
        Ok(Self(value))
    }
}

/// Like `Json<T>`, but runs `T::validate` and reports every failure in the error envelope.
pub struct ValidJson<T>(pub T);

impl<S, T> FromRequest<S> for ValidJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned + Validate,
{
    type Rejection = AppError;

    async fn from_request(req: Request, state: &S) -> Result<Self, AppError> {
        let Json(value) = Json::<T>::from_request(req, state)
            .await
            .map_err(|rejection| invalid("body", rejection.body_text()))?;
        value.validate()?;
        Ok(Self(value))
    }
}

fn invalid(field: &str, message: String) -> AppError {
    AppError::Validation(vec![FieldError {
        field: field.into(),
        message,
    }])
}
