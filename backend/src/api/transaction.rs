//! Transactions that write dancers or the rows pointing at them.

use sqlx::{PgPool, Postgres, Transaction};

use crate::{
    db::{self, dancers::MergeLock},
    error::AppError,
};

/// Opens a transaction holding the merge lock in `mode`.
pub(super) async fn begin(
    pool: &PgPool,
    mode: MergeLock,
) -> Result<Transaction<'static, Postgres>, AppError> {
    let mut tx = pool.begin().await?;
    db::dancers::lock_merges(&mut tx, mode).await?;
    Ok(tx)
}

/// Runs `attempt` once more when Postgres aborted its transaction to break a deadlock or a
/// serialisation conflict, so a race nobody foresaw costs a retry instead of a 500.
pub(super) async fn retrying<T, F>(attempt: impl Fn() -> F) -> Result<T, AppError>
where
    F: Future<Output = Result<T, AppError>>,
{
    match attempt().await {
        Err(err) if err.is_transient() => attempt().await,
        result => result,
    }
}
