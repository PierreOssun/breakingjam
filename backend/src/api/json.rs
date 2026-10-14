//! JSON request bodies that are deserialized and validated in one step.

use axum::{
    Json,
    extract::{FromRequest, Request},
};
use serde::de::DeserializeOwned;
use validator::Validate;

use crate::error::{AppError, FieldError};

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
            .map_err(|rejection| {
                AppError::Validation(vec![FieldError {
                    field: "body".into(),
                    message: rejection.body_text(),
                }])
            })?;
        value.validate()?;
        Ok(Self(value))
    }
}
