mod test_app;

use axum::{Router, http::StatusCode};
use breakingjam::domain::battle::MAX_BATTLES;
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{
    TestResponse, app, delete, get, id_of, post, publish, put, send, set_role, sign_up,
};

struct Jam {
    app: Router,
    pool: PgPool,
    owner: String,
    event_id: String,
}

/// A logged-in organiser with one draft jam.
async fn jam(pool: PgPool) -> Jam {
    let app = app(pool.clone());
    let owner = sign_up(&app, &pool, "org@example.com").await;
    let body = json!({
        "name": "Paris Cypher", "starts_on": "2030-06-01", "ends_on": "2030-06-01",
        "timezone": "Europe/Paris", "city": "Paris", "country": "FR"
    });
    let event_id = send(&app, post("/api/events", body, Some(&owner)))
        .await
        .json["id"]
        .as_str()
        .unwrap()
        .to_owned();
    Jam {
        app,
        pool,
        owner,
        event_id,
    }
}

impl Jam {
    async fn battle(&self, body: Value) -> TestResponse {
        let uri = format!("/api/events/{}/battles", self.event_id);
        send(&self.app, post(&uri, body, Some(&self.owner))).await
    }

    async fn dancer(&self, name: &str) -> String {
        let body = json!({ "dancer_name": name, "country": "FR" });
        send(&self.app, post("/api/dancers", body, Some(&self.owner)))
            .await
            .json["id"]
            .as_str()
            .unwrap()
            .to_owned()
    }

    async fn entry(&self, battle_id: &str, body: Value) -> TestResponse {
        let uri = format!("/api/battles/{battle_id}/entries");
        send(&self.app, post(&uri, body, Some(&self.owner))).await
    }

    async fn publish(&self) {
        publish(&self.pool, &self.event_id).await;
    }
}

fn one_v_one() -> Value {
    json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "adult", "age_min": 18 })
}

#[sqlx::test]
async fn battles_get_default_names_and_positions(pool: PgPool) {
    let jam = jam(pool).await;
    let first = jam.battle(one_v_one()).await;
    assert_eq!(first.status, StatusCode::CREATED);
    assert_eq!(first.json["name"], "1v1 Bboy");
    assert_eq!(first.json["position"], 0);

    let kids = json!({ "format": "team", "team_size": 2, "gender": "mixed", "age": "kids",
                       "age_min": 8, "age_max": 17, "name": "  " });
    let second = jam.battle(kids).await;
    assert_eq!(second.json["name"], "2v2 Mixed Kids");
    assert_eq!(second.json["position"], 1);

    let renamed = json!({ "format": "seven_to_smoke", "gender": "bgirl", "age": "adult",
                          "age_min": 18, "name": "Queen of the Floor" });
    let uri = format!("/api/battles/{}", id_of(&second));
    let updated = send(&jam.app, put(&uri, renamed, Some(&jam.owner))).await;
    assert_eq!(updated.json["name"], "Queen of the Floor");
    assert_eq!(updated.json["team_size"], Value::Null);

    let showcase = json!({ "format": "showcase", "team_size": 5, "gender": "mixed",
                           "age": "adult", "age_min": 18 });
    let third = jam.battle(showcase).await;
    assert_eq!(third.status, StatusCode::CREATED);
    assert_eq!(third.json["name"], "Showcase Mixed");
    assert_eq!(third.json["format"], "showcase");
    assert_eq!(third.json["team_size"], 5);
}

#[sqlx::test]
async fn battle_rules_are_422s(pool: PgPool) {
    let jam = jam(pool).await;
    let no_size = json!({ "format": "team", "gender": "bboy", "age": "adult", "age_min": 18 });
    let response = jam.battle(no_size).await;
    assert_eq!(response.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(response.json["error"]["fields"][0]["field"], "team_size");

    let old_kids = json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "kids",
                           "age_min": 8, "age_max": 18 });
    let response = jam.battle(old_kids).await;
    assert_eq!(response.json["error"]["fields"][0]["field"], "age_max");

    let mut no_currency = one_v_one();
    no_currency["prize_first"] = json!(500);
    let response = jam.battle(no_currency).await;
    assert_eq!(
        response.json["error"]["fields"][0]["field"],
        "prize_currency"
    );
}

#[sqlx::test]
async fn a_jam_holds_a_bounded_number_of_battles(pool: PgPool) {
    let jam = jam(pool).await;
    for _ in 0..MAX_BATTLES {
        assert_eq!(jam.battle(one_v_one()).await.status, StatusCode::CREATED);
    }
    let one_more = jam.battle(one_v_one()).await;
    assert_eq!(one_more.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(one_more.json["error"]["fields"][0]["field"], "battles");
}

#[sqlx::test]
async fn a_battle_starts_on_one_of_the_jams_days(pool: PgPool) {
    let jam = jam(pool).await;
    // The jam is one day: 1 June 2030.
    let unannounced = jam.battle(one_v_one()).await;
    assert_eq!(unannounced.json["starts_at"], Value::Null);

    let mut body = one_v_one();
    body["starts_at"] = json!("2030-06-01T14:30:00");
    let battle = jam.battle(body.clone()).await;
    assert_eq!(battle.status, StatusCode::CREATED);
    assert_eq!(battle.json["starts_at"], "2030-06-01T14:30:00");

    body["starts_at"] = json!("2030-06-02T14:30:00");
    let outside = jam.battle(body.clone()).await;
    assert_eq!(outside.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(outside.json["error"]["fields"][0]["field"], "starts_at");
    let uri = format!("/api/battles/{}", id_of(&battle));
    let moved = send(&jam.app, put(&uri, body, Some(&jam.owner))).await;
    assert_eq!(moved.status, StatusCode::UNPROCESSABLE_ENTITY);

    // Nor can the jam move away from under the battle: the boundary that would drop it is named.
    let jam_uri = format!("/api/events/{}", jam.event_id);
    let mut days = json!({
        "name": "Paris Cypher", "starts_on": "2030-06-02", "ends_on": "2030-06-02",
        "timezone": "Europe/Paris", "city": "Paris", "country": "FR"
    });
    let dropped = send(&jam.app, put(&jam_uri, days.clone(), Some(&jam.owner))).await;
    assert_eq!(dropped.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(dropped.json["error"]["fields"][0]["field"], "starts_on");
    days["starts_on"] = json!("2030-05-31");
    days["ends_on"] = json!("2030-05-31");
    let dropped = send(&jam.app, put(&jam_uri, days.clone(), Some(&jam.owner))).await;
    assert_eq!(dropped.json["error"]["fields"][0]["field"], "ends_on");
    days["ends_on"] = json!("2030-06-01");
    let kept = send(&jam.app, put(&jam_uri, days, Some(&jam.owner))).await;
    assert_eq!(kept.status, StatusCode::OK);
}

#[sqlx::test]
async fn prizes_are_per_place_in_one_currency(pool: PgPool) {
    let jam = jam(pool).await;
    let mut body = one_v_one();
    body["prize_currency"] = json!("CHF");
    body["prize_first"] = json!(1000);
    body["prize_second"] = json!(500);
    let created = jam.battle(body).await;
    assert_eq!(created.status, StatusCode::CREATED);
    assert_eq!(created.json["prize_currency"], "CHF");
    assert_eq!(created.json["prize_first"], 1000);
    assert_eq!(created.json["prize_second"], 500);
    assert_eq!(created.json["prize_third"], Value::Null);

    let uri = format!("/api/battles/{}", id_of(&created));
    let cleared = send(&jam.app, put(&uri, one_v_one(), Some(&jam.owner))).await;
    assert_eq!(cleared.json["prize_currency"], Value::Null);
    assert_eq!(cleared.json["prize_first"], Value::Null);
}

#[sqlx::test]
async fn battles_follow_jam_visibility_and_rights(pool: PgPool) {
    let jam = jam(pool.clone()).await;
    jam.battle(one_v_one()).await;
    let uri = format!("/api/events/{}/battles", jam.event_id);

    assert_eq!(
        send(&jam.app, get(&uri, None)).await.status,
        StatusCode::NOT_FOUND
    );
    jam.publish().await;
    let public = send(&jam.app, get(&uri, None)).await;
    assert_eq!(public.json.as_array().unwrap().len(), 1);

    let stranger = sign_up(&jam.app, &pool, "other@example.com").await;
    let response = send(&jam.app, post(&uri, one_v_one(), Some(&stranger))).await;
    assert_eq!(response.status, StatusCode::FORBIDDEN);
}

#[sqlx::test]
async fn reorder_needs_every_battle_once(pool: PgPool) {
    let jam = jam(pool).await;
    let a = id_of(&jam.battle(one_v_one()).await);
    let b = id_of(&jam.battle(one_v_one()).await);
    let uri = format!("/api/events/{}/battles/order", jam.event_id);

    let reordered = send(&jam.app, put(&uri, json!([b, a]), Some(&jam.owner))).await;
    assert_eq!(reordered.status, StatusCode::OK);
    assert_eq!(reordered.json[0]["id"], b);
    assert_eq!(reordered.json[1]["position"], 1);

    let partial = send(&jam.app, put(&uri, json!([a]), Some(&jam.owner))).await;
    assert_eq!(partial.status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn entries_enforce_one_entry_per_dancer_and_team_size(pool: PgPool) {
    let jam = jam(pool).await;
    let solo = id_of(&jam.battle(one_v_one()).await);
    let lilg = jam.dancer("Lil G").await;

    let entered = jam
        .entry(
            &solo,
            json!({ "dancer_ids": [lilg], "status": "confirmed" }),
        )
        .await;
    assert_eq!(entered.status, StatusCode::CREATED);
    assert_eq!(entered.json["members"][0]["dancer_name"], "Lil G");
    assert_eq!(entered.json["reached"], "na");

    let again = jam.entry(&solo, json!({ "dancer_ids": [lilg] })).await;
    assert_eq!(again.status, StatusCode::CONFLICT);

    let duo = json!({ "format": "team", "team_size": 2, "gender": "mixed", "age": "adult", "age_min": 18 });
    let duo = id_of(&jam.battle(duo).await);
    let short = jam
        .entry(&duo, json!({ "dancer_ids": [lilg], "status": "confirmed" }))
        .await;
    assert_eq!(short.status, StatusCode::UNPROCESSABLE_ENTITY);
    let pending = jam.entry(&duo, json!({ "dancer_ids": [lilg] })).await;
    assert_eq!(
        pending.status,
        StatusCode::CREATED,
        "pending teams may be incomplete"
    );

    let unknown = jam
        .entry(&duo, json!({ "dancer_ids": [uuid::Uuid::now_v7()] }))
        .await;
    assert_eq!(unknown.status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn entering_a_battle_leaves_the_avatar_as_it_was(pool: PgPool) {
    let jam = jam(pool).await;
    let mut bgirl_battle = one_v_one();
    bgirl_battle["gender"] = json!("bgirl");
    let bgirls = id_of(&jam.battle(bgirl_battle).await);
    let bboys = id_of(&jam.battle(one_v_one()).await);
    let ami = jam.dancer("Ami").await;
    let menno = jam.dancer("Menno").await;

    for (battle, dancer) in [(&bgirls, &ami), (&bboys, &menno)] {
        let body = json!({ "dancer_ids": [dancer] });
        assert_eq!(jam.entry(battle, body).await.status, StatusCode::CREATED);
    }

    // A page someone has seen keeps its face: the battle draws no look over it.
    for dancer in [&ami, &menno] {
        let page = send(&jam.app, get(&format!("/api/dancers/{dancer}"), None)).await;
        assert_eq!(page.json["avatar"], Value::Null);
    }
}

#[sqlx::test]
async fn max_entries_fills_up(pool: PgPool) {
    let jam = jam(pool).await;
    let mut body = one_v_one();
    body["max_entries"] = json!(1);
    let battle = id_of(&jam.battle(body).await);
    let a = jam.dancer("A").await;
    let b = jam.dancer("B").await;

    assert_eq!(
        jam.entry(&battle, json!({ "dancer_ids": [a] }))
            .await
            .status,
        StatusCode::CREATED
    );
    let full = jam.entry(&battle, json!({ "dancer_ids": [b] })).await;
    assert_eq!(full.status, StatusCode::CONFLICT);
    assert_eq!(full.json["error"]["message"], "battle is full");

    // A withdrawn entry does not count, and cannot sneak back in through an update.
    let withdrawn = jam
        .entry(&battle, json!({ "dancer_ids": [b], "status": "withdrawn" }))
        .await;
    assert_eq!(withdrawn.status, StatusCode::CREATED);
    let uri = format!("/api/entries/{}", id_of(&withdrawn));
    let revived = json!({ "dancer_ids": [b], "status": "pending" });
    let response = send(&jam.app, put(&uri, revived, Some(&jam.owner))).await;
    assert_eq!(response.status, StatusCode::CONFLICT);
    assert_eq!(response.json["error"]["message"], "battle is full");
}

#[sqlx::test]
async fn results_and_video_are_normalised(pool: PgPool) {
    let jam = jam(pool).await;
    let battle = id_of(&jam.battle(one_v_one()).await);
    let lilg = jam.dancer("Lil G").await;
    let entry = id_of(&jam.entry(&battle, json!({ "dancer_ids": [lilg] })).await);
    let uri = format!("/api/entries/{entry}");

    let result = json!({
        "dancer_ids": [lilg], "status": "confirmed", "reached": "winner",
        "video_url": "https://youtu.be/dQw4w9WgXcQ?t=90", "video_offset_seconds": 90
    });
    let updated = send(&jam.app, put(&uri, result, Some(&jam.owner))).await;
    assert_eq!(updated.status, StatusCode::OK);
    assert_eq!(updated.json["final_rank"], 1);
    assert_eq!(
        updated.json["video_url"],
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );

    let vimeo = json!({ "dancer_ids": [lilg], "video_url": "https://vimeo.com/1" });
    let rejected = send(&jam.app, put(&uri, vimeo, Some(&jam.owner))).await;
    assert_eq!(rejected.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(rejected.json["error"]["fields"][0]["field"], "video_url");

    let wrong_rank = json!({ "dancer_ids": [lilg], "reached": "top8", "final_rank": 1 });
    let rejected = send(&jam.app, put(&uri, wrong_rank, Some(&jam.owner))).await;
    assert_eq!(rejected.json["error"]["fields"][0]["field"], "final_rank");

    // The dancer page sees the result once the jam is public.
    jam.publish().await;
    let events = send(&jam.app, get(&format!("/api/dancers/{lilg}/events"), None)).await;
    let item = &events.json["upcoming"][0];
    assert_eq!(item["battle"]["name"], "1v1 Bboy");
    assert_eq!(item["reached"], "winner");
    assert_eq!(item["final_rank"], 1);

    assert_eq!(
        send(&jam.app, delete(&uri, Some(&jam.owner))).await.status,
        StatusCode::NO_CONTENT
    );
    let battles = send(
        &jam.app,
        get(&format!("/api/events/{}/battles", jam.event_id), None),
    )
    .await;
    assert_eq!(battles.json[0]["entries"], json!([]));
}

#[sqlx::test]
async fn battles_carry_their_matches_winner_first(pool: PgPool) {
    let jam = jam(pool).await;
    let battle = id_of(&jam.battle(one_v_one()).await);
    let (lilg, ventus) = (jam.dancer("Lil G").await, jam.dancer("Ventus").await);
    let winner = id_of(&jam.entry(&battle, json!({ "dancer_ids": [lilg] })).await);
    let loser = id_of(&jam.entry(&battle, json!({ "dancer_ids": [ventus] })).await);
    // What the curated import or (later) the organiser's Results step writes.
    sqlx::query!(
        "insert into battle_matches (id, battle_id, round, position, winner_id, loser_id, video_url)
         values (gen_random_uuid(), $1::text::uuid, 'final', 0, $2::text::uuid, $3::text::uuid,
                 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')",
        battle,
        winner,
        loser,
    )
    .execute(&jam.pool)
    .await
    .unwrap();

    let uri = format!("/api/events/{}/battles", jam.event_id);
    let battles = send(&jam.app, get(&uri, Some(&jam.owner))).await;
    let matches = &battles.json[0]["matches"];
    assert_eq!(matches.as_array().unwrap().len(), 1);
    assert_eq!(matches[0]["round"], "final");
    assert_eq!(matches[0]["winner_id"], winner.as_str());
    assert_eq!(matches[0]["loser_id"], loser.as_str());
    assert_eq!(
        matches[0]["video_url"],
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );

    // An entry deleted takes its matches with it.
    let deleted = send(
        &jam.app,
        delete(&format!("/api/entries/{loser}"), Some(&jam.owner)),
    )
    .await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);
    let battles = send(&jam.app, get(&uri, Some(&jam.owner))).await;
    assert_eq!(battles.json[0]["matches"], json!([]));
}

#[sqlx::test]
async fn organisers_enter_matches_and_placings_follow(pool: PgPool) {
    let jam = jam(pool).await;
    let battle = id_of(&jam.battle(one_v_one()).await);
    let mut ids = Vec::new();
    for name in ["Lil G", "Ventus", "Kami", "Roxy"] {
        let dancer = jam.dancer(name).await;
        ids.push(id_of(
            &jam.entry(&battle, json!({ "dancer_ids": [dancer] })).await,
        ));
    }
    let uri = format!("/api/battles/{battle}/matches");
    let bracket = json!([
        { "round": "top4", "position": 0, "winner_id": ids[0], "loser_id": ids[1] },
        { "round": "top4", "position": 1, "winner_id": ids[2], "loser_id": ids[3] },
        { "round": "final", "position": 0, "winner_id": ids[0], "loser_id": ids[2],
          "video_url": "https://youtu.be/dQw4w9WgXcQ", "video_offset_seconds": 1234 },
    ]);

    // Public, so a stranger sees it but may not write it.
    jam.publish().await;
    let stranger = sign_up(&jam.app, &jam.pool, "other@example.com").await;
    let refused = send(&jam.app, put(&uri, bracket.clone(), Some(&stranger))).await;
    assert_eq!(refused.status, StatusCode::FORBIDDEN);

    let twice = json!([
        { "round": "top4", "position": 0, "winner_id": ids[0], "loser_id": ids[1] },
        { "round": "top4", "position": 1, "winner_id": ids[0], "loser_id": ids[2] },
    ]);
    let refused = send(&jam.app, put(&uri, twice, Some(&jam.owner))).await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(refused.json["error"]["fields"][0]["field"], "matches");

    let saved = send(&jam.app, put(&uri, bracket, Some(&jam.owner))).await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.json);
    assert_eq!(saved.json.as_array().unwrap().len(), 3);
    assert_eq!(
        saved.json[2]["video_url"],
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    );

    // The placings follow, and the winners' last battle is their video.
    let battles = send(
        &jam.app,
        get(
            &format!("/api/events/{}/battles", jam.event_id),
            Some(&jam.owner),
        ),
    )
    .await;
    let placing = |id: &str| {
        let entry = battles.json[0]["entries"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["id"] == id)
            .unwrap()
            .clone();
        (
            entry["reached"].clone(),
            entry["final_rank"].clone(),
            entry["video_offset_seconds"].clone(),
        )
    };
    // The video's start comes along, or the entry's video would play from 0:00.
    assert_eq!(placing(&ids[0]), (json!("winner"), json!(1), json!(1234)));
    assert_eq!(placing(&ids[2]), (json!("top2"), json!(2), json!(1234)));
    assert_eq!(placing(&ids[1]), (json!("top4"), json!(null), json!(null)));

    // Saving again replaces the bracket as a whole.
    let only_final =
        json!([{ "round": "final", "position": 0, "winner_id": ids[2], "loser_id": ids[0] }]);
    let saved = send(&jam.app, put(&uri, only_final, Some(&jam.owner))).await;
    assert_eq!(saved.json.as_array().unwrap().len(), 1);
    assert_eq!(saved.json[0]["winner_id"], ids[2].as_str());

    // A battle entered before the one above it keeps its place.
    let second_only =
        json!([{ "round": "top4", "position": 1, "winner_id": ids[2], "loser_id": ids[3] }]);
    let saved = send(&jam.app, put(&uri, second_only, Some(&jam.owner))).await;
    assert_eq!(saved.json[0]["position"], 1);
}

#[sqlx::test]
async fn deleting_a_battle_removes_its_entries(pool: PgPool) {
    let jam = jam(pool).await;
    let battle = id_of(&jam.battle(one_v_one()).await);
    let lilg = jam.dancer("Lil G").await;
    jam.entry(&battle, json!({ "dancer_ids": [lilg] })).await;

    let uri = format!("/api/battles/{battle}");
    assert_eq!(
        send(&jam.app, delete(&uri, Some(&jam.owner))).await.status,
        StatusCode::NO_CONTENT
    );
    let entries = sqlx::query_scalar!(
        r#"select count(*) as "count!" from entries where battle_id = $1"#,
        battle.parse::<uuid::Uuid>().unwrap()
    )
    .fetch_one(&jam.pool)
    .await
    .unwrap();
    assert_eq!(entries, 0);
}

#[sqlx::test]
async fn staff_is_replaced_as_a_whole(pool: PgPool) {
    let jam = jam(pool.clone()).await;
    let judge = jam.dancer("Judge Judy").await;
    let dj = jam.dancer("DJ Spin").await;
    let uri = format!("/api/events/{}/staff", jam.event_id);

    let staff = json!([
        { "dancer_id": dj, "role": "dj" },
        { "dancer_id": judge, "role": "judge" },
        { "dancer_id": judge, "role": "mc" }
    ]);
    let replaced = send(&jam.app, put(&uri, staff, Some(&jam.owner))).await;
    assert_eq!(replaced.status, StatusCode::OK);
    let roles: Vec<&str> = replaced
        .json
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["role"].as_str().unwrap())
        .collect();
    assert_eq!(
        roles,
        ["judge", "dj", "mc"],
        "ordered by role as declared in §4"
    );
    // Read back by its owner: the jam is still a draft, hidden from everyone else.
    let listed = send(&jam.app, get(&uri, Some(&jam.owner))).await;
    assert_eq!(listed.status, StatusCode::OK);
    assert_eq!(listed.json, replaced.json);

    let twice = json!([{ "dancer_id": dj, "role": "dj" }, { "dancer_id": dj, "role": "dj" }]);
    assert_eq!(
        send(&jam.app, put(&uri, twice, Some(&jam.owner)))
            .await
            .status,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let unknown = json!([{ "dancer_id": uuid::Uuid::now_v7(), "role": "dj" }]);
    assert_eq!(
        send(&jam.app, put(&uri, unknown, Some(&jam.owner)))
            .await
            .status,
        StatusCode::UNPROCESSABLE_ENTITY
    );

    let cleared = send(&jam.app, put(&uri, json!([]), Some(&jam.owner))).await;
    assert_eq!(cleared.json, json!([]));

    let stranger = sign_up(&jam.app, &pool, "other@example.com").await;
    jam.publish().await;
    assert_eq!(
        send(&jam.app, put(&uri, json!([]), Some(&stranger)))
            .await
            .status,
        StatusCode::FORBIDDEN
    );
}

#[sqlx::test]
async fn an_entry_keeps_its_deleted_crew_but_no_entry_takes_one_on(pool: PgPool) {
    let jam = jam(pool.clone()).await;
    let duo = json!({ "format": "team", "team_size": 2, "gender": "bboy", "age": "adult", "age_min": 18 });
    let battle = id_of(&jam.battle(duo).await);
    let (a, b) = (jam.dancer("A").await, jam.dancer("B").await);
    let (c, d) = (jam.dancer("C").await, jam.dancer("D").await);
    let crew = json!({ "name": "Floor Lords", "country": "FR" });
    let crew = id_of(&send(&jam.app, post("/api/crews", crew, Some(&jam.owner))).await);
    let body = json!({ "dancer_ids": [a, b], "status": "confirmed", "crew_id": crew });
    let entry = id_of(&jam.entry(&battle, body.clone()).await);
    // Only the team deletes crews.
    let team = sign_up(&jam.app, &pool, "team@example.com").await;
    set_role(&jam.pool, "team@example.com", "seed_admin").await;
    let gone = send(&jam.app, delete(&format!("/api/crews/{crew}"), Some(&team))).await;
    assert_eq!(gone.status, StatusCode::NO_CONTENT);

    // Someone else's delete must not block recording this entry's result.
    let saved = send(
        &jam.app,
        put(&format!("/api/entries/{entry}"), body, Some(&jam.owner)),
    )
    .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.json);
    assert_eq!(saved.json["crew"]["id"], crew);

    let body = json!({ "dancer_ids": [c, d], "status": "confirmed", "crew_id": crew });
    let other = jam.entry(&battle, body).await;
    assert_eq!(other.status, StatusCode::UNPROCESSABLE_ENTITY);
    let body = json!({ "dancer_ids": [c, d], "status": "confirmed" });
    let other = id_of(&jam.entry(&battle, body).await);
    let body = json!({ "dancer_ids": [c, d], "status": "confirmed", "crew_id": crew });
    let switched = send(
        &jam.app,
        put(&format!("/api/entries/{other}"), body, Some(&jam.owner)),
    )
    .await;
    assert_eq!(switched.status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test]
async fn a_battle_over_its_limit_still_saves_its_entries_but_takes_no_more(pool: PgPool) {
    let jam = jam(pool).await;
    let mut fields = json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "adult",
                             "age_min": 18, "max_entries": 3 });
    let battle = id_of(&jam.battle(fields.clone()).await);
    let mut entries = Vec::new();
    let mut dancers = Vec::new();
    for name in ["A", "B", "C"] {
        let dancer = jam.dancer(name).await;
        let body = json!({ "dancer_ids": [dancer], "status": "confirmed" });
        entries.push(id_of(&jam.entry(&battle, body).await));
        dancers.push(dancer);
    }
    fields["max_entries"] = json!(2);
    let lowered = send(
        &jam.app,
        put(&format!("/api/battles/{battle}"), fields, Some(&jam.owner)),
    )
    .await;
    assert_eq!(lowered.status, StatusCode::OK, "{}", lowered.json);
    let save = |entry: &str, dancer: &str, status: &str| {
        let body = json!({ "dancer_ids": [dancer], "status": status, "reached": "top4" });
        put(&format!("/api/entries/{entry}"), body, Some(&jam.owner))
    };

    // An entry already in the battle keeps its place.
    let saved = send(&jam.app, save(&entries[0], &dancers[0], "confirmed")).await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.json);
    let withdrawn = send(&jam.app, save(&entries[1], &dancers[1], "withdrawn")).await;
    assert_eq!(withdrawn.status, StatusCode::OK, "{}", withdrawn.json);

    // Two active entries fill the new limit: coming back or joining takes a place there isn't.
    let back = send(&jam.app, save(&entries[1], &dancers[1], "confirmed")).await;
    assert_eq!(back.status, StatusCode::CONFLICT);
    let newcomer = jam.dancer("D").await;
    let joined = jam
        .entry(
            &battle,
            json!({ "dancer_ids": [newcomer], "status": "confirmed" }),
        )
        .await;
    assert_eq!(joined.status, StatusCode::CONFLICT);
}
