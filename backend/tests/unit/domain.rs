//! Unit tests of `crate::domain`.

mod battle;
mod claim;
mod dancer;
mod event;
mod user;

use crate::domain::*;

#[test]
fn instagram_handle_shapes() {
    assert!(instagram_handle("@Lil_G.bboy").is_ok());
    assert!(instagram_handle("lilg").is_ok());
    assert!(instagram_handle("").is_ok());
    assert!(instagram_handle("@").is_err());
    assert!(instagram_handle("lil g").is_err());
    assert!(instagram_handle("https://instagram.com/lilg").is_err());
    assert!(instagram_handle(&"a".repeat(31)).is_err());
}
