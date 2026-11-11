//! Unit tests of `crate::domain::dancer`.

use chrono::Utc;
use serde_json::json;
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
        country: "FR".into(),
        country2: None,
        city: None,
        bio: None,
        instagram_handle: None,
        instagram_hidden: false,
        source: DancerSource::Organizer,
        verified_at: verified.then(Utc::now),
        avatar_url: None,
        avatar: None,
        titles: Vec::new(),
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
fn an_avatar_is_known_slots_with_known_values() {
    let ok = |avatar| avatar_shape(&avatar).is_ok();
    assert!(ok(json!({})), "every slot at its default");
    assert!(ok(
        json!({ "style": "flame", "head": "bucket", "fx": "aura", "lashes": true })
    ));
    assert!(ok(json!({
        "skin": "deep", "style": "twintails", "hair": "pink", "head": "hood", "accent": "black",
        "brows": "fierce", "mouth": "grin", "face": "mask", "outfit": "bomber", "cloth": "red",
        "extra": "chain", "bg": "crimson", "fx": "city",
        "lashes": false, "lips": true, "hoops": true,
    })));
    assert!(!ok(json!({ "style": "mullet" })), "unknown value");
    assert!(!ok(json!({ "hat": "cap" })), "unknown slot");
    assert!(!ok(json!({ "style": 3 })), "a slot holds a name");
    assert!(!ok(json!({ "lashes": "yes" })), "a detail is on or off");
    assert!(
        !ok(json!({ "style": "cap" })),
        "headgear left the hair styles"
    );
    assert!(
        !ok(json!("h2-s1-c0-o3-e0-b1")),
        "the code from before the rework"
    );
    assert!(!ok(json!([])));
}

#[test]
fn bgirls_get_long_hair_and_lashes_bboys_short_hair_mixed_nothing() {
    const LONG: [&str; 7] = ["bun", "long", "space", "braids", "puffs", "pony", "bangs"];
    for _ in 0..200 {
        let id = Uuid::now_v7();
        let bgirl = default_look(id, BattleGender::Bgirl).unwrap();
        assert!(avatar_shape(&bgirl).is_ok(), "{bgirl}");
        assert!(LONG.contains(&bgirl["style"].as_str().unwrap()), "{bgirl}");
        assert_eq!(bgirl["lashes"], true, "lash flicks always: {bgirl}");

        let bboy = default_look(id, BattleGender::Bboy).unwrap();
        assert!(avatar_shape(&bboy).is_ok(), "{bboy}");
        assert!(
            ["spiky", "buzz", "afro"].contains(&bboy["style"].as_str().unwrap()),
            "{bboy}"
        );
        assert_eq!(
            [&bboy["lashes"], &bboy["lips"], &bboy["hoops"]],
            [&json!(false); 3],
            "no details: {bboy}"
        );
        // What is worn takes the hoodie's colour, ink reading as black.
        let accent = bboy["accent"].as_str().unwrap();
        let cloth = bboy["cloth"].as_str().unwrap();
        assert_eq!(accent, if cloth == "ink" { "black" } else { cloth });

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
    // An account's own page is `SelfCreated` through its own route, never by role.
    assert_eq!(
        DancerSource::for_creator(Role::User),
        DancerSource::Organizer
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
