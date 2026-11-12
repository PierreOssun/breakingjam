//! CPU-heavy work off the request threads: a few jobs run at once, a few wait, the rest are refused.

use tokio::sync::Semaphore;

use crate::error::AppError;

/// A bounded queue in front of blocking work, so an anonymous flood can't make everyone wait.
#[derive(Debug)]
pub struct Slots {
    running: Semaphore,
    // One permit per job, running or waiting: none left means the queue is full.
    places: Semaphore,
}

impl Slots {
    /// `running` jobs at once, with up to `waiting` more queued behind them.
    pub const fn new(running: usize, waiting: usize) -> Self {
        Self {
            running: Semaphore::const_new(running),
            places: Semaphore::const_new(running + waiting),
        }
    }

    /// Runs `work` on a blocking thread once a slot is free; `Busy` at once when the queue is full.
    pub async fn run<T: Send + 'static>(
        &'static self,
        work: impl FnOnce() -> T + Send + 'static,
    ) -> Result<T, AppError> {
        // A request dropped while it waits gives its place back: only open requests fill the queue.
        let place = self.places.try_acquire().map_err(|_| AppError::Busy)?;
        let slot = self
            .running
            .acquire()
            .await
            .map_err(|err| AppError::Internal(err.into()))?;
        tokio::task::spawn_blocking(move || {
            // Held until the work ends, even if the client hangs up and the request is dropped.
            let _held = (slot, place);
            work()
        })
        .await
        .map_err(|err| AppError::Internal(err.into()))
    }
}
