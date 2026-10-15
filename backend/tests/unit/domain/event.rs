//! Unit tests of `crate::domain::event`.

use uuid::Uuid;

use crate::domain::{
    country_code,
    event::*,
    user::{Role, User},
};
use EventStatus::*;
use Transition::*;

#[test]
fn transitions_follow_the_table() {
    assert_eq!(Draft.apply(Submit).unwrap(), InReview);
    assert_eq!(Draft.apply(Publish).unwrap(), Published);
    assert_eq!(
        Published.apply(CloseRegistration).unwrap(),
        RegistrationClosed
    );
    assert_eq!(RegistrationClosed.apply(Complete).unwrap(), Completed);
    for from in [Draft, InReview, Published, RegistrationClosed] {
        assert_eq!(from.apply(Cancel).unwrap(), Cancelled);
    }
}

#[test]
fn only_jams_in_review_are_reviewed() {
    let reject = Review::Reject("Add the venue".into());
    assert_eq!(InReview.review(&Review::Approve), Some(Published));
    assert_eq!(InReview.review(&reject), Some(Draft));
    for from in [Draft, Published, RegistrationClosed, Completed, Cancelled] {
        assert_eq!(from.review(&Review::Approve), None, "{from:?}");
        assert_eq!(from.review(&reject), None, "{from:?}");
    }
}

#[test]
fn publishing_without_review_is_the_teams() {
    assert_eq!(Publish.required_role(), Role::SeedAdmin);
    for transition in [Submit, CloseRegistration, Complete, Cancel] {
        assert_eq!(transition.required_role(), Role::User, "{transition:?}");
    }
}

#[test]
fn drafts_and_jams_in_review_are_private() {
    assert!(!Draft.is_public());
    assert!(!InReview.is_public());
    for status in [Published, RegistrationClosed, Completed, Cancelled] {
        assert!(status.is_public(), "{status:?}");
    }
}

#[test]
fn transitions_reject_everything_else() {
    let invalid = [
        (Draft, CloseRegistration),
        (Draft, Complete),
        (InReview, Submit),
        (InReview, Publish),
        (InReview, CloseRegistration),
        (Published, Submit),
        (Published, Publish),
        (Published, Complete),
        (RegistrationClosed, Publish),
        (Completed, Cancel),
        (Completed, Publish),
        (Cancelled, Cancel),
        (Cancelled, Publish),
    ];
    for (from, transition) in invalid {
        assert!(from.apply(transition).is_err(), "{from:?} + {transition:?}");
    }
}

#[test]
fn slug_keeps_words_and_id_suffix() {
    let id = Uuid::parse_str("01920000-0000-7000-8000-0000003f9a1c").unwrap();
    assert_eq!(
        slug("Paris Cypher Sessions!", id),
        "paris-cypher-sessions-3f9a1c"
    );
    assert_eq!(slug("서울 잼", id), "서울-잼-3f9a1c");
}

#[test]
fn writers_are_owner_or_seed_admin() {
    let user = |role| User {
        id: Uuid::now_v7(),
        email: String::new(),
        display_name: String::new(),
        role,
    };
    let organizer = user(Role::Organizer);
    assert!(can_write(&organizer, organizer.id));
    assert!(!can_write(&organizer, Uuid::now_v7()));
    assert!(can_write(&user(Role::SeedAdmin), Uuid::now_v7()));
}

#[test]
fn timezone_and_country_shapes() {
    assert!(iana_timezone("Europe/Zurich").is_ok());
    assert!(iana_timezone("America/Argentina/Buenos_Aires").is_ok());
    assert!(iana_timezone("UTC").is_ok());
    assert!(iana_timezone("Zurich").is_err());
    assert!(iana_timezone("Europe/Zurich; drop").is_err());
    assert!(country_code("FR").is_ok());
    assert!(country_code("fr").is_err());
    assert!(country_code("FRA").is_err());
}

#[test]
fn links_are_blank_or_http() {
    assert!(web_url("").is_ok());
    assert!(web_url("  ").is_ok());
    assert!(web_url("https://example.com/register").is_ok());
    assert!(web_url("http://example.com").is_ok());
    assert!(web_url("javascript:alert(1)").is_err());
    assert!(web_url("https://").is_err());
    assert!(web_url("https://exa mple.com").is_err());
    assert!(web_url("example.com").is_err());
}

#[test]
fn invalid_transition_reads_like_the_api() {
    let err = RegistrationClosed.apply(CloseRegistration).unwrap_err();
    assert_eq!(
        err.to_string(),
        "cannot close-registration a registration_closed jam"
    );
}
