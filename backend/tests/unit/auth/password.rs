//! Unit tests of `crate::auth::password`.

use crate::{auth::password::*, config::Secret};

fn pepper() -> Secret {
    Secret("test pepper".into())
}

#[tokio::test]
async fn hash_then_verify() {
    let hash = hash("correct horse".into(), &pepper()).await.unwrap();
    assert!(hash.starts_with("$argon2id$"));
    assert!(
        verify("correct horse".into(), hash.clone(), &pepper())
            .await
            .unwrap()
    );
    assert!(!verify("wrong".into(), hash, &pepper()).await.unwrap());
}

#[tokio::test]
async fn another_pepper_does_not_verify() {
    let hash = hash("correct horse".into(), &pepper()).await.unwrap();
    assert!(
        !verify(
            "correct horse".into(),
            hash,
            &Secret("another pepper".into())
        )
        .await
        .unwrap()
    );
}

#[tokio::test]
async fn nothing_matches_the_stand_in_hash() {
    assert!(
        !verify("".into(), NO_PASSWORD.into(), &pepper())
            .await
            .unwrap()
    );
}
