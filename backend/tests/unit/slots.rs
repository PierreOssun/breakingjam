//! Unit tests of `crate::slots`.

use std::{sync::mpsc, time::Duration};

use tokio::{sync::oneshot, task::JoinHandle, time::timeout};

use crate::{error::AppError, slots::Slots};

/// A job that takes a slot of `slots` and keeps it until the returned sender is dropped.
async fn hold(slots: &'static Slots) -> (mpsc::Sender<()>, JoinHandle<Result<(), AppError>>) {
    let (release, held) = mpsc::channel::<()>();
    let (started, running) = oneshot::channel();
    let job = tokio::spawn(slots.run(move || {
        started.send(()).unwrap();
        // Ends when the sender is dropped.
        let _ = held.recv();
    }));
    running.await.unwrap();
    (release, job)
}

/// Whether `job` is still waiting for a slot after a moment.
async fn waits<T>(job: &mut JoinHandle<T>) -> bool {
    timeout(Duration::from_millis(100), job).await.is_err()
}

#[tokio::test]
async fn one_runs_one_waits_and_the_next_is_refused() {
    static SLOTS: Slots = Slots::new(1, 1);
    let (release, first) = hold(&SLOTS).await;
    let mut second = tokio::spawn(SLOTS.run(|| 2));
    assert!(waits(&mut second).await, "ran with the only slot taken");

    assert!(matches!(SLOTS.run(|| 3).await, Err(AppError::Busy)));

    drop(release);
    first.await.unwrap().unwrap();
    assert_eq!(second.await.unwrap().unwrap(), 2);
    assert_eq!(SLOTS.run(|| 4).await.unwrap(), 4);
}

#[tokio::test]
async fn a_dropped_request_gives_its_place_back() {
    static SLOTS: Slots = Slots::new(1, 1);
    let (release, first) = hold(&SLOTS).await;
    let mut gone = tokio::spawn(SLOTS.run(|| ()));
    assert!(waits(&mut gone).await);
    // The client hung up: axum drops the handler's future.
    gone.abort();
    assert!(gone.await.unwrap_err().is_cancelled());

    let mut next = tokio::spawn(SLOTS.run(|| 5));
    assert!(waits(&mut next).await, "refused though the queue has room");
    drop(release);
    first.await.unwrap().unwrap();
    assert_eq!(next.await.unwrap().unwrap(), 5);
}
