//! "Verify me" claims: a user asks to own a dancer page, an admin checks Instagram (§4).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::dancer::DancerRef;

/// Review state of a claim.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "claim_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum ClaimStatus {
    Pending,
    Approved,
    Rejected,
}

/// A claim as its author sees it.
#[derive(Debug, Clone, Serialize)]
pub struct Claim {
    pub id: Uuid,
    pub dancer_id: Uuid,
    pub user_id: Uuid,
    /// Shown to the user, who puts it in their Instagram bio or DMs it to @breakingjam.
    pub code: String,
    pub status: ClaimStatus,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// A claim in the admin review queue, with who is claiming which page.
#[derive(Debug, Clone, Serialize)]
pub struct ClaimForReview {
    #[serde(flatten)]
    pub claim: Claim,
    pub dancer: DancerRef,
    pub user: ClaimUser,
}

/// The account behind a claim.
#[derive(Debug, Clone, Serialize)]
pub struct ClaimUser {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
}

/// No 0/O, 1/I/L: the code is read off a screen and typed into Instagram.
const CODE_ALPHABET: &[u8] = b"23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/// A fresh claim code, `BJ-` + 4 characters, e.g. `BJ-7K2M`.
pub fn new_code() -> String {
    let random = Uuid::new_v4();
    let chars: String = random.as_bytes()[..4]
        .iter()
        .map(|b| CODE_ALPHABET[usize::from(*b) % CODE_ALPHABET.len()] as char)
        .collect();
    format!("BJ-{chars}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_use_the_unambiguous_alphabet() {
        for _ in 0..200 {
            let code = new_code();
            assert_eq!(code.len(), 7);
            assert!(code.starts_with("BJ-"));
            assert!(code[3..].bytes().all(|b| CODE_ALPHABET.contains(&b)));
        }
    }
}
