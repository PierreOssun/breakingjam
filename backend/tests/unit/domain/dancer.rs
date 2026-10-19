//! Unit tests of `crate::domain::dancer`.

use chrono::Utc;
use uuid::Uuid;

use crate::domain::{
    battle::BattleGender,
    dancer::*,
    user::{Role, User},
};

fn dancer(verified: bool, user_id: Option<Uuid>, created_by: Option<Uuid>) -> Dancer {
    Dancer {
        id: Uuid::now_v7(),
        user_id,
        dancer_name: "Lil G".into(),
        aliases: vec![],
        real_name: None,
        country: "FR".into(),
        country2: None,
        city: None,
        bio: None,
        instagram_handle: None,
        source: DancerSource::Organizer,
        verified_at: verified.then(Utc::now),
        avatar_url: None,
        avatar_parts: None,
        created_by,
        merged_into_id: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
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
fn edit_rights() {
    let creator = user(Role::Organizer);
    let owner = user(Role::User);
    let stranger = user(Role::Organizer);

    let unverified = dancer(false, None, Some(creator.id));
    assert!(unverified.can_edit(&creator));
    assert!(!unverified.can_edit(&stranger));

    let verified = dancer(true, Some(owner.id), Some(creator.id));
    assert!(verified.can_edit(&owner));
    assert!(
        !verified.can_edit(&creator),
        "verification hands the page to its owner"
    );
    assert!(verified.can_edit(&user(Role::SeedAdmin)));
}

#[test]
fn changes_list_only_differences() {
    let old = dancer(false, None, None);
    let mut new = old.clone();
    new.city = Some("Lyon".into());
    new.aliases = vec!["G".into()];
    let changed: Vec<&str> = changes(&old, &new).iter().map(|c| c.0).collect();
    assert_eq!(changed, ["aliases", "city"]);
    assert_eq!(changes(&old, &new)[1], ("city", None, Some("Lyon".into())));
}

#[test]
fn merged_aliases_union_without_duplicates() {
    let mut survivor = dancer(false, None, None);
    survivor.dancer_name = "Kid Rocket".into();
    survivor.aliases = vec!["Rocket".into()];
    let mut loser = dancer(false, None, None);
    loser.dancer_name = "Kid Rockett".into();
    loser.aliases = vec!["rocket".into(), "KR".into(), "kid rocket".into()];
    assert_eq!(
        merged_aliases(&survivor, &loser),
        ["Rocket", "KR", "Kid Rockett"]
    );
}

#[test]
fn avatar_parts_are_six_parts_in_range_then_optional_details() {
    assert!(avatar_parts_shape("h2-s1-c0-o3-e0-b1").is_ok());
    assert!(avatar_parts_shape("h12-s3-c4-o4-e2-b3").is_ok());
    assert!(avatar_parts_shape("h8-s1-c0-o3-e0-b1-d7").is_ok());
    assert!(avatar_parts_shape("").is_ok());
    assert!(
        avatar_parts_shape("h13-s1-c0-o3-e0-b1").is_err(),
        "hair out of range"
    );
    assert!(
        avatar_parts_shape("h2-s1-c0-o3-e0-b1-d8").is_err(),
        "details out of range"
    );
    assert!(
        avatar_parts_shape("s1-h2-c0-o3-e0-b1").is_err(),
        "parts out of order"
    );
    assert!(
        avatar_parts_shape("h2-s1-c0-o3-e0").is_err(),
        "a part missing"
    );
    assert!(avatar_parts_shape("h2-s1-c0-o3-e0-b12").is_err());
    assert!(avatar_parts_shape("h2-s1-c0-o3-e0-b1-x1").is_err());
    assert!(avatar_parts_shape("h123-s1-c0-o3-e0-b1").is_err());
}

#[test]
fn bgirls_get_long_hair_and_lashes_bboys_short_hair_mixed_nothing() {
    let hair = |code: &str| code[1..code.find('-').unwrap()].parse::<u32>().unwrap();
    for _ in 0..200 {
        let id = Uuid::now_v7();
        let bgirl = default_look(id, BattleGender::Bgirl).unwrap();
        assert!(avatar_parts_shape(&bgirl).is_ok(), "{bgirl}");
        assert!(
            [3, 6, 7, 8, 9, 10, 11, 12].contains(&hair(&bgirl)),
            "{bgirl}"
        );
        let details: u32 = bgirl.rsplit_once("-d").unwrap().1.parse().unwrap();
        assert_eq!(details & 1, 1, "lash flicks always: {bgirl}");

        let bboy = default_look(id, BattleGender::Bboy).unwrap();
        assert!(avatar_parts_shape(&bboy).is_ok(), "{bboy}");
        assert!([0, 1, 2, 4, 5].contains(&hair(&bboy)), "{bboy}");
        assert!(!bboy.contains("-d"), "no details: {bboy}");

        assert_eq!(default_look(id, BattleGender::Mixed), None);
    }
    let id = Uuid::now_v7();
    assert_eq!(
        default_look(id, BattleGender::Bgirl),
        default_look(id, BattleGender::Bgirl),
        "stable for the id"
    );
}

#[test]
fn source_follows_creator_role() {
    assert_eq!(
        DancerSource::for_creator(Role::User),
        DancerSource::SelfCreated
    );
    assert_eq!(
        DancerSource::for_creator(Role::Organizer),
        DancerSource::Organizer
    );
    assert_eq!(
        DancerSource::for_creator(Role::SeedAdmin),
        DancerSource::Seed
    );
}
