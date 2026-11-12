//! Unit tests of `crate::domain::event`.

use uuid::Uuid;

use crate::{
    domain::{
        country_code,
        event::*,
        user::{Role, User},
    },
    unit_tests::bare_draft,
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
    for from in [Published, RegistrationClosed] {
        assert_eq!(from.apply(Cancel).unwrap(), Cancelled);
    }
    // A cancelled jam is public: one that never was would skip its review. It is deleted instead.
    for from in [Draft, InReview, Cancelled] {
        assert!(from.apply(Cancel).is_err(), "{from:?}");
    }
}

#[test]
fn only_jams_in_review_are_reviewed() {
    let reject = Review::Reject("Add the venue".into());
    assert_eq!(InReview.review(&Review::Approve), Some(Published));
    assert_eq!(InReview.review(&reject), Some(Draft));
    for from in [Draft, Published, RegistrationClosed, Cancelled] {
        assert_eq!(from.review(&Review::Approve), None, "{from:?}");
        assert_eq!(from.review(&reject), None, "{from:?}");
    }
}

#[test]
fn publishing_without_review_is_the_teams() {
    assert_eq!(Publish.required_role(), Role::SeedAdmin);
    for transition in [Submit, CloseRegistration, Cancel] {
        assert_eq!(transition.required_role(), Role::User, "{transition:?}");
    }
}

#[test]
fn drafts_and_jams_in_review_are_private() {
    assert!(!Draft.is_public());
    assert!(!InReview.is_public());
    for status in [Published, RegistrationClosed, Cancelled] {
        assert!(status.is_public(), "{status:?}");
    }
}

#[test]
fn transitions_reject_everything_else() {
    let invalid = [
        (Draft, CloseRegistration),
        (InReview, Submit),
        (InReview, Publish),
        (InReview, CloseRegistration),
        (Published, Submit),
        (Published, Publish),
        (RegistrationClosed, Publish),
        (RegistrationClosed, CloseRegistration),
        (Cancelled, Cancel),
        (Cancelled, Publish),
    ];
    for (from, transition) in invalid {
        assert!(from.apply(transition).is_err(), "{from:?} + {transition:?}");
    }
}

#[test]
fn the_publish_checklist_wants_a_placed_venue_a_battle_and_a_contact() {
    let mut jam = bare_draft();
    jam.contact_email = Some("crew@example.com".into());
    assert_eq!(jam.missing(0), [Missing::Place, Missing::Battle]);
    assert_eq!(jam.missing(2), [Missing::Place]);
    jam.city = Some("Zürich".into());
    jam.country = Some("CH".into());
    assert_eq!(jam.missing(1), [Missing::Place], "a city without a pin");
    jam.lat = Some(47.38);
    jam.lng = Some(8.54);
    assert_eq!(jam.missing(0), [Missing::Battle]);
    assert!(jam.missing(1).is_empty());
    assert_eq!(Missing::Place.as_field().0, "place");
    assert_eq!(Missing::Battle.as_field().0, "battles");
}

#[test]
fn the_team_reaches_the_organiser_by_instagram_or_email() {
    let mut jam = bare_draft();
    jam.city = Some("Zürich".into());
    jam.country = Some("CH".into());
    jam.lat = Some(47.38);
    jam.lng = Some(8.54);
    assert_eq!(jam.missing(1), [Missing::Contact]);
    assert_eq!(Missing::Contact.as_field().0, "contact");
    jam.instagram_url = Some("https://www.instagram.com/zurich.jam".into());
    assert!(jam.missing(1).is_empty(), "Instagram is enough");
    jam.instagram_url = None;
    jam.contact_email = Some("crew@example.com".into());
    assert!(jam.missing(1).is_empty(), "so is an email");
}

#[test]
fn only_a_place_it_has_can_be_lost() {
    let fields = |city: Option<&str>, country: Option<&str>, lat: Option<f64>| EventFields {
        name: "Jam".into(),
        description: None,
        starts_on: chrono::NaiveDate::from_ymd_opt(2030, 6, 1).unwrap(),
        ends_on: chrono::NaiveDate::from_ymd_opt(2030, 6, 1).unwrap(),
        timezone: "Europe/Paris".into(),
        opens_at: None,
        closes_at: None,
        venue_name: None,
        address: None,
        city: city.map(Into::into),
        country: country.map(Into::into),
        lat,
        lng: lat,
        registration_url: None,
        instagram_url: None,
        website_url: None,
        contact_email: None,
    };
    let mut jam = bare_draft();
    assert!(
        !jam.loses_place(&fields(None, None, None)),
        "nothing to lose"
    );

    jam.city = Some("Paris".into());
    jam.country = Some("FR".into());
    assert!(
        !jam.loses_place(&fields(Some("Lyon"), Some("FR"), None)),
        "never had a pin"
    );
    assert!(jam.loses_place(&fields(None, Some("FR"), None)));
    assert!(jam.loses_place(&fields(Some("  "), Some("FR"), None)));
    assert!(jam.loses_place(&fields(Some("Paris"), None, None)));

    jam.lat = Some(48.86);
    assert!(jam.loses_place(&fields(Some("Paris"), Some("FR"), None)));
    assert!(!jam.loses_place(&fields(Some("Paris"), Some("FR"), Some(45.7))));
}

#[test]
fn the_last_contact_can_be_lost_but_not_one_of_two() {
    let fields = |instagram: Option<&str>, email: Option<&str>| EventFields {
        name: "Jam".into(),
        description: None,
        starts_on: chrono::NaiveDate::from_ymd_opt(2030, 6, 1).unwrap(),
        ends_on: chrono::NaiveDate::from_ymd_opt(2030, 6, 1).unwrap(),
        timezone: "Europe/Paris".into(),
        opens_at: None,
        closes_at: None,
        venue_name: None,
        address: None,
        city: None,
        country: None,
        lat: None,
        lng: None,
        registration_url: None,
        instagram_url: instagram.map(Into::into),
        website_url: None,
        contact_email: email.map(Into::into),
    };
    let mut jam = bare_draft();
    assert!(!jam.loses_contact(&fields(None, None)), "nothing to lose");

    jam.instagram_url = Some("https://www.instagram.com/zurich.jam".into());
    assert!(jam.loses_contact(&fields(None, None)));
    assert!(
        jam.loses_contact(&fields(Some("  "), None)),
        "blank is none"
    );
    assert!(
        !jam.loses_contact(&fields(None, Some("crew@example.com"))),
        "an email instead"
    );
}

#[test]
fn submitting_and_publishing_announce_a_jam() {
    assert!(Submit.announces() && Publish.announces());
    for transition in [CloseRegistration, Cancel] {
        assert!(!transition.announces(), "{transition:?}");
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

fn user(role: Role) -> User {
    User {
        id: Uuid::now_v7(),
        email: String::new(),
        display_name: String::new(),
        role,
    }
}

#[test]
fn writers_are_owner_or_seed_admin() {
    let organizer = user(Role::Organizer);
    assert!(can_write(&organizer, organizer.id));
    assert!(!can_write(&organizer, Uuid::now_v7()));
    assert!(can_write(&user(Role::SeedAdmin), Uuid::now_v7()));
}

#[test]
fn a_public_jam_that_is_over_is_locked_for_its_organiser_only() {
    let organizer = user(Role::Organizer);
    let team = user(Role::SeedAdmin);
    let mut jam = bare_draft();
    jam.organizer_id = organizer.id;
    jam.phase = Phase::Past;
    assert!(!jam.is_over(), "a stale draft can still be moved");
    assert!(jam.editable_by(&organizer));

    jam.status = Published;
    assert!(jam.is_over());
    assert!(!jam.editable_by(&organizer));
    assert!(jam.actions(&organizer).is_empty(), "not even cancel");
    assert!(jam.editable_by(&team), "the team fixes history");

    jam.phase = Phase::Live;
    assert!(!jam.is_over());
    assert!(jam.editable_by(&organizer));
}

#[test]
fn actions_are_what_the_status_and_role_allow() {
    let organizer = user(Role::Organizer);
    let mut jam = bare_draft();
    jam.organizer_id = organizer.id;
    assert_eq!(jam.actions(&organizer), [Submit]);
    assert_eq!(jam.actions(&user(Role::SeedAdmin)), [Submit, Publish]);
    assert!(jam.actions(&user(Role::Organizer)).is_empty(), "not theirs");
    jam.status = InReview;
    assert!(
        jam.actions(&organizer).is_empty(),
        "it waits for its review"
    );
    jam.status = Published;
    assert_eq!(jam.actions(&organizer), [CloseRegistration, Cancel]);
    jam.status = Cancelled;
    assert!(jam.actions(&organizer).is_empty());
}

#[test]
fn rows_split_by_phase_with_the_past_most_recent_first() {
    use Phase::*;
    let rows = vec![
        (1, Past),
        (2, Past),
        (3, Live),
        (4, Upcoming),
        (5, Upcoming),
    ];
    let [live, upcoming, past] = by_phase(rows, |r| r.1);
    let ids = |rows: Vec<(i32, Phase)>| rows.into_iter().map(|r| r.0).collect::<Vec<_>>();
    assert_eq!(ids(live), [3]);
    assert_eq!(ids(upcoming), [4, 5]);
    assert_eq!(ids(past), [2, 1]);
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
fn contact_emails_are_blank_or_addresses() {
    assert!(email_or_blank("").is_ok());
    assert!(email_or_blank("  ").is_ok());
    assert!(email_or_blank(" hello@pariscypher.com ").is_ok());
    assert!(email_or_blank("hello").is_err());
    assert!(email_or_blank("hello@").is_err());
    assert!(email_or_blank("mailto:hello@pariscypher.com").is_err());
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
