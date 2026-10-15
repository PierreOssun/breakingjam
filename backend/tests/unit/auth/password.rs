//! Unit tests of `crate::auth::password`.

use crate::auth::password::*;

#[tokio::test]
async fn hash_then_verify() {
    let hash = hash("correct horse".into()).await.unwrap();
    assert!(hash.starts_with("$argon2id$"));
    assert!(verify("correct horse".into(), hash.clone()).await.unwrap());
    assert!(!verify("wrong".into(), hash).await.unwrap());
}
