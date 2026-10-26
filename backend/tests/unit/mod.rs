//! Unit tests, kept out of the source files: compiled into the crate under `cfg(test)`
//! (see `src/lib.rs`), so they reach `pub(crate)` items. Integration tests live in `tests/*.rs`.

mod api;
mod auth;
mod calendar;
mod config;
mod dataset;
mod db;
mod domain;
mod error;
mod flyer;
mod media;
