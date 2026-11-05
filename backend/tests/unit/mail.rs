//! Unit tests of `crate::mail`.

use crate::{
    domain::user::CodePurpose::{ResetPassword, VerifyEmail},
    mail::*,
};

#[test]
fn the_code_leads_the_subject_and_stands_alone_in_the_body() {
    let message = Message::code(VerifyEmail, Language::En, "b@example.com", "042917");
    assert_eq!(message.to, "b@example.com");
    assert_eq!(message.subject, "042917 is your BreakingJam code");
    assert!(message.text.contains("\n\n042917\n\n"));
    assert!(message.text.contains("confirm your email"));
}

#[test]
fn a_reset_says_so_in_each_language() {
    let text = |language| Message::code(ResetPassword, language, "b@example.com", "1").text;
    assert!(text(Language::En).contains("new BreakingJam password"));
    assert!(text(Language::Fr).contains("nouveau mot de passe"));
    assert!(text(Language::De).contains("neues BreakingJam-Passwort"));
}

#[test]
fn an_unknown_language_is_refused_and_none_is_english() {
    assert!(serde_json::from_str::<Language>(r#""es""#).is_err());
    assert_eq!(Language::default(), Language::En);
}
