//! Writes that race on one dancer wait for each other instead of deadlocking into a 500.

mod test_app;

use std::time::Duration;

use axum::{Router, http::StatusCode};
use breakingjam::{
    db::{self, dancers::MergeLock},
    domain::battle::EntryStatus,
};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{TestResponse, app, id_of, post, put, send, set_role, sign_up};
use uuid::Uuid;

const ROUNDS: usize = 8;

struct Race {
    app: Router,
    pool: PgPool,
    admin: String,
    event: String,
    battle: String,
}

/// An admin's session and a jam with one 1v1 battle to race on.
async fn race(pool: PgPool) -> Race {
    let app = app(pool.clone());
    let admin = sign_up(&app, "admin@example.com").await;
    set_role(&pool, "admin@example.com", "admin").await;
    let body = json!({
        "name": "Paris Cypher", "starts_on": "2030-06-01", "ends_on": "2030-06-01",
        "timezone": "Europe/Paris", "city": "Paris", "country": "FR"
    });
    let event = id_of(&send(&app, post("/api/events", body, Some(&admin))).await);
    let body = json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "adult", "age_min": 18 });
    let uri = format!("/api/events/{event}/battles");
    let battle = id_of(&send(&app, post(&uri, body, Some(&admin))).await);
    Race {
        app,
        pool,
        admin,
        event,
        battle,
    }
}

impl Race {
    async fn dancer(&self, name: &str) -> String {
        let body = json!({ "dancer_name": name, "country": "FR" });
        id_of(&send(&self.app, post("/api/dancers", body, Some(&self.admin))).await)
    }

    /// A pending claim on `dancer`, by a new account.
    async fn claim(&self, dancer: &str, email: &str) -> Uuid {
        let cookie = sign_up(&self.app, email).await;
        let uri = format!("/api/dancers/{dancer}/claim");
        let claim = send(&self.app, post(&uri, json!({}), Some(&cookie))).await;
        claim.json["id"].as_str().unwrap().parse().unwrap()
    }

    async fn approve(&self, claim: Uuid) -> TestResponse {
        let uri = format!("/api/admin/claims/{claim}/approve");
        send(&self.app, post(&uri, json!({}), Some(&self.admin))).await
    }

    async fn merge(&self, loser: &str, survivor: &str) -> TestResponse {
        let uri = format!("/api/admin/dancers/{loser}/merge");
        let body = json!({ "into": survivor });
        send(&self.app, post(&uri, body, Some(&self.admin))).await
    }

    async fn entry(&self, dancer: &str) -> String {
        let uri = format!("/api/battles/{}/entries", self.battle);
        let body = json!({ "dancer_ids": [dancer], "status": "confirmed" });
        id_of(&send(&self.app, post(&uri, body, Some(&self.admin))).await)
    }

    async fn edit_entry(&self, id: &str, dancer: &str) -> TestResponse {
        let uri = format!("/api/entries/{id}");
        let body = json!({ "dancer_ids": [dancer], "status": "confirmed", "reached": "top8" });
        send(&self.app, put(&uri, body, Some(&self.admin))).await
    }

    async fn set_staff(&self, staff: Value) -> TestResponse {
        let uri = format!("/api/events/{}/staff", self.event);
        send(&self.app, put(&uri, staff, Some(&self.admin))).await
    }
}

/// Neither side of a race may die: an answer of 4xx is a lost race, a 500 a deadlock.
fn assert_no_crash(responses: [&TestResponse; 2]) {
    for response in responses {
        assert!(
            !response.status.is_server_error(),
            "{}: {}",
            response.status,
            response.json
        );
    }
}

#[sqlx::test]
async fn two_approvals_on_one_dancer_let_the_first_win(pool: PgPool) {
    let race = race(pool).await;
    for round in 0..ROUNDS {
        let dancer = race.dancer(&format!("Dancer {round}")).await;
        let first = race
            .claim(&dancer, &format!("first{round}@example.com"))
            .await;
        let second = race
            .claim(&dancer, &format!("second{round}@example.com"))
            .await;

        let (a, b) = tokio::join!(race.approve(first), race.approve(second));

        assert_no_crash([&a, &b]);
        let mut statuses = [a.status, b.status];
        statuses.sort();
        assert_eq!(statuses, [StatusCode::OK, StatusCode::CONFLICT]);
    }
}

#[sqlx::test]
async fn approving_a_claim_during_a_merge_of_its_dancer_answers_both(pool: PgPool) {
    let race = race(pool).await;
    for round in 0..ROUNDS {
        let loser = race.dancer(&format!("Loser {round}")).await;
        let survivor = race.dancer(&format!("Survivor {round}")).await;
        let claim = race
            .claim(&loser, &format!("claimer{round}@example.com"))
            .await;

        let (approved, merged) = tokio::join!(race.approve(claim), race.merge(&loser, &survivor));

        assert_no_crash([&approved, &merged]);
    }
}

/// The merge holds its dancers while the edit starts, so the edit is mid-way when the merge goes on.
#[sqlx::test]
async fn editing_an_entry_during_a_merge_of_its_dancer_answers_both(pool: PgPool) {
    let race = race(pool).await;
    let loser: Uuid = race.dancer("Loser").await.parse().unwrap();
    let survivor: Uuid = race.dancer("Survivor").await.parse().unwrap();
    let name = loser.to_string();
    let entry = race.entry(&name).await;
    let mut merge = race.pool.begin().await.unwrap();
    db::dancers::lock_merges(&mut merge, MergeLock::Exclusive)
        .await
        .unwrap();
    let locked_loser = db::dancers::find_for_update(&mut merge, loser)
        .await
        .unwrap()
        .unwrap();
    let locked_survivor = db::dancers::find_for_update(&mut merge, survivor)
        .await
        .unwrap()
        .unwrap();

    let finish_merge = async {
        tokio::time::sleep(Duration::from_millis(100)).await;
        db::dancers::merge(&mut merge, &locked_loser, &locked_survivor, &[])
            .await
            .unwrap();
        merge.commit().await.unwrap();
    };
    let (edited, ()) = tokio::join!(race.edit_entry(&entry, &name), finish_merge);

    assert_eq!(
        edited.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        edited.json
    );
    let member = sqlx::query_scalar!(
        "select dancer_id from entry_members where entry_id = $1",
        entry.parse::<Uuid>().unwrap()
    )
    .fetch_one(&race.pool)
    .await
    .unwrap();
    assert_eq!(member, survivor);
}

#[sqlx::test]
async fn editing_the_staff_during_a_merge_of_a_member_answers_both(pool: PgPool) {
    let race = race(pool).await;
    for round in 0..ROUNDS {
        let loser = race.dancer(&format!("Loser {round}")).await;
        let survivor = race.dancer(&format!("Survivor {round}")).await;
        let staff = json!([{ "dancer_id": loser, "role": "judge" }]);
        race.set_staff(staff.clone()).await;

        let (saved, merged) = tokio::join!(race.set_staff(staff), race.merge(&loser, &survivor));

        assert_no_crash([&saved, &merged]);
        let staff = sqlx::query_scalar!(
            "select dancer_id from event_staff where dancer_id = $1",
            loser.parse::<Uuid>().unwrap()
        )
        .fetch_all(&race.pool)
        .await
        .unwrap();
        assert!(staff.is_empty(), "the merged dancer stayed on the staff");
    }
}

#[sqlx::test]
async fn two_entries_racing_for_the_last_place_take_one(pool: PgPool) {
    let race = race(pool).await;
    for round in 0..ROUNDS {
        let body = json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "adult",
                           "age_min": 18, "max_entries": 1, "name": format!("Battle {round}") });
        let uri = format!("/api/events/{}/battles", race.event);
        let battle = id_of(&send(&race.app, post(&uri, body, Some(&race.admin))).await);
        let (a, b) = (
            race.dancer(&format!("A{round}")).await,
            race.dancer(&format!("B{round}")).await,
        );
        let uri = format!("/api/battles/{battle}/entries");
        let enter = |dancer: &str| {
            post(
                &uri,
                json!({ "dancer_ids": [dancer], "status": "confirmed" }),
                Some(&race.admin),
            )
        };

        let (first, second) = tokio::join!(send(&race.app, enter(&a)), send(&race.app, enter(&b)));

        let mut statuses = [first.status, second.status];
        statuses.sort();
        assert_eq!(statuses, [StatusCode::CREATED, StatusCode::CONFLICT]);
    }
}

/// A staff save rewrites the rows of the dancers it removes, as a merge does, so it must wait
/// for the merge; otherwise the two can lock those rows in opposite orders.
#[sqlx::test]
async fn a_staff_save_waits_for_a_merge_of_a_dancer_it_removes(pool: PgPool) {
    let race = race(pool).await;
    let loser: Uuid = race.dancer("Loser").await.parse().unwrap();
    let survivor: Uuid = race.dancer("Survivor").await.parse().unwrap();
    let newcomer = race.dancer("Newcomer").await;
    let both_roles =
        json!([{ "dancer_id": loser, "role": "judge" }, { "dancer_id": loser, "role": "mc" }]);
    assert_eq!(race.set_staff(both_roles).await.status, StatusCode::OK);
    let mut merge = race.pool.begin().await.unwrap();
    db::dancers::lock_merges(&mut merge, MergeLock::Exclusive)
        .await
        .unwrap();
    let locked_loser = db::dancers::find_for_update(&mut merge, loser)
        .await
        .unwrap()
        .unwrap();
    let locked_survivor = db::dancers::find_for_update(&mut merge, survivor)
        .await
        .unwrap()
        .unwrap();

    let (app, uri, admin) = (
        race.app.clone(),
        format!("/api/events/{}/staff", race.event),
        race.admin.clone(),
    );
    let save = tokio::spawn(async move {
        let staff = json!([{ "dancer_id": newcomer, "role": "judge" }]);
        send(&app, put(&uri, staff, Some(&admin))).await.status
    });
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(
        !save.is_finished(),
        "the save went ahead while the merge held the loser"
    );
    db::dancers::merge(&mut merge, &locked_loser, &locked_survivor, &[])
        .await
        .unwrap();
    merge.commit().await.unwrap();

    assert_eq!(save.await.unwrap(), StatusCode::OK);
    let staff = sqlx::query_scalar!(
        r#"select d.dancer_name from event_staff s join dancers d on d.id = s.dancer_id
           where s.event_id = $1"#,
        race.event.parse::<Uuid>().unwrap()
    )
    .fetch_all(&race.pool)
    .await
    .unwrap();
    assert_eq!(staff, ["Newcomer"]);
}

/// The other saves of the battle run while this one waits for it: one withdraws the entry this
/// save is about, another fills the place. This save must judge the entry as it is now.
#[sqlx::test]
async fn an_entry_save_reads_the_entry_again_once_it_holds_the_battle(pool: PgPool) {
    let race = race(pool).await;
    let body = json!({ "format": "team", "team_size": 1, "gender": "bboy", "age": "adult",
                       "age_min": 18, "max_entries": 2, "name": "Small battle" });
    let uri = format!("/api/events/{}/battles", race.event);
    let battle: Uuid = id_of(&send(&race.app, post(&uri, body, Some(&race.admin))).await)
        .parse()
        .unwrap();
    let mut entries = Vec::new();
    for name in ["E", "F", "G"] {
        let dancer = race.dancer(name).await;
        let uri = format!("/api/battles/{battle}/entries");
        let status = if name == "F" {
            "withdrawn"
        } else {
            "confirmed"
        };
        let body = json!({ "dancer_ids": [dancer], "status": status });
        let entry = send(&race.app, post(&uri, body, Some(&race.admin))).await;
        entries.push((id_of(&entry), dancer));
    }
    let [(e, e_dancer), (f, _), _] = &entries[..] else {
        unreachable!()
    };
    let mut others = race.pool.begin().await.unwrap();
    db::battles::lock(&mut others, battle).await.unwrap();

    let (app, admin) = (race.app.clone(), race.admin.clone());
    let (uri, e_dancer) = (format!("/api/entries/{e}"), e_dancer.clone());
    let save = tokio::spawn(async move {
        let body = json!({ "dancer_ids": [e_dancer], "status": "confirmed", "reached": "top4" });
        send(&app, put(&uri, body, Some(&admin))).await.status
    });
    tokio::time::sleep(Duration::from_millis(300)).await;
    for (entry, status) in [(e, EntryStatus::Withdrawn), (f, EntryStatus::Confirmed)] {
        sqlx::query!(
            "update entries set status = $2 where id = $1",
            entry.parse::<Uuid>().unwrap(),
            status as EntryStatus,
        )
        .execute(&mut *others)
        .await
        .unwrap();
    }
    others.commit().await.unwrap();

    assert_eq!(save.await.unwrap(), StatusCode::CONFLICT);
    let active = sqlx::query_scalar!(
        r#"select count(*) as "count!" from entries where battle_id = $1 and status <> 'withdrawn'"#,
        battle
    )
    .fetch_one(&race.pool)
    .await
    .unwrap();
    assert_eq!(active, 2);
}

/// Another save of the jam's staff commits while this one waits: this one must replace that
/// list, locking its dancers, not the list it might have read before.
#[sqlx::test]
async fn a_staff_save_waits_for_another_save_of_the_same_jam(pool: PgPool) {
    let race = race(pool).await;
    let event: Uuid = race.event.parse().unwrap();
    let (judge, other) = (race.dancer("Judge").await, race.dancer("Other").await);
    let mut first = race.pool.begin().await.unwrap();
    db::events::lock(&mut first, event).await.unwrap();

    let (app, admin, uri) = (
        race.app.clone(),
        race.admin.clone(),
        format!("/api/events/{event}/staff"),
    );
    let save = tokio::spawn(async move {
        let staff = json!([{ "dancer_id": judge, "role": "judge" }]);
        send(&app, put(&uri, staff, Some(&admin))).await.status
    });
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(
        !save.is_finished(),
        "two saves of one jam's staff ran at once"
    );
    sqlx::query!(
        "insert into event_staff (event_id, dancer_id, role) values ($1, $2, 'judge'), ($1, $2, 'mc')",
        event,
        other.parse::<Uuid>().unwrap(),
    )
    .execute(&mut *first)
    .await
    .unwrap();
    first.commit().await.unwrap();

    assert_eq!(save.await.unwrap(), StatusCode::OK);
    let staff = sqlx::query_scalar!(
        r#"select d.dancer_name from event_staff s join dancers d on d.id = s.dancer_id
           where s.event_id = $1"#,
        event
    )
    .fetch_all(&race.pool)
    .await
    .unwrap();
    assert_eq!(staff, ["Judge"]);
}

/// A stale page sends a dancer merged away long ago while the dancer it points to is merged
/// again, rewriting that old redirect: the save waits, then refuses the merged dancer.
#[sqlx::test]
async fn a_save_naming_a_merged_dancer_during_a_merge_is_refused(pool: PgPool) {
    let race = race(pool).await;
    let redirect = race.dancer("Redirect").await;
    let loser: Uuid = race.dancer("Loser").await.parse().unwrap();
    let survivor: Uuid = race.dancer("Survivor").await.parse().unwrap();
    let merged = race.merge(&redirect, &loser.to_string()).await;
    assert_eq!(merged.status, StatusCode::OK, "{}", merged.json);
    let mut merge = race.pool.begin().await.unwrap();
    db::dancers::lock_merges(&mut merge, MergeLock::Exclusive)
        .await
        .unwrap();
    let locked_loser = db::dancers::find_for_update(&mut merge, loser)
        .await
        .unwrap()
        .unwrap();
    let locked_survivor = db::dancers::find_for_update(&mut merge, survivor)
        .await
        .unwrap()
        .unwrap();

    let (app, admin, uri) = (
        race.app.clone(),
        race.admin.clone(),
        format!("/api/events/{}/staff", race.event),
    );
    let save = tokio::spawn(async move {
        let staff = json!([{ "dancer_id": redirect, "role": "judge" }, { "dancer_id": survivor, "role": "mc" }]);
        send(&app, put(&uri, staff, Some(&admin))).await
    });
    tokio::time::sleep(Duration::from_millis(300)).await;
    db::dancers::merge(&mut merge, &locked_loser, &locked_survivor, &[])
        .await
        .unwrap();
    merge.commit().await.unwrap();

    let saved = save.await.unwrap();
    assert_eq!(
        saved.status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "{}",
        saved.json
    );
}

/// A deadlock nobody planned for: the save is aborted to break it, and runs again instead of
/// answering 500. Here the other side holds the dancer and then asks for the battle.
#[sqlx::test]
async fn a_save_aborted_to_break_a_deadlock_runs_again(pool: PgPool) {
    let race = race(pool).await;
    let battle: Uuid = race.battle.parse().unwrap();
    let dancer: Uuid = race.dancer("Dancer").await.parse().unwrap();
    let mut other = race.pool.begin().await.unwrap();
    db::dancers::find_for_update(&mut other, dancer)
        .await
        .unwrap()
        .unwrap();

    let (app, admin, uri) = (
        race.app.clone(),
        race.admin.clone(),
        format!("/api/battles/{battle}/entries"),
    );
    let save = tokio::spawn(async move {
        let body = json!({ "dancer_ids": [dancer], "status": "confirmed" });
        send(&app, post(&uri, body, Some(&admin))).await
    });
    // The save now holds the battle and waits for the dancer; asking for the battle closes the
    // cycle. The save waited first, so Postgres aborts the save.
    tokio::time::sleep(Duration::from_millis(300)).await;
    db::battles::lock(&mut other, battle).await.unwrap();
    other.commit().await.unwrap();

    let saved = save.await.unwrap();
    assert_eq!(saved.status, StatusCode::CREATED, "{}", saved.json);
}

/// An approval waits out one merge of its dancer while a second merge of the survivor queues
/// behind it: merges run alone, so each goes in turn and nobody is answered 500.
#[sqlx::test]
async fn an_approval_between_two_merges_of_its_dancer_goes_in_turn(pool: PgPool) {
    let race = race(pool).await;
    let loser: Uuid = race.dancer("Loser").await.parse().unwrap();
    let survivor: Uuid = race.dancer("Survivor").await.parse().unwrap();
    let last = race.dancer("Last").await;
    let claim = race.claim(&loser.to_string(), "claimer@example.com").await;
    let mut first = race.pool.begin().await.unwrap();
    db::dancers::lock_merges(&mut first, MergeLock::Exclusive)
        .await
        .unwrap();
    let locked_loser = db::dancers::find_for_update(&mut first, loser)
        .await
        .unwrap()
        .unwrap();
    let locked_survivor = db::dancers::find_for_update(&mut first, survivor)
        .await
        .unwrap()
        .unwrap();

    let (app, admin) = (race.app.clone(), race.admin.clone());
    let approve = tokio::spawn(async move {
        let uri = format!("/api/admin/claims/{claim}/approve");
        send(&app, post(&uri, json!({}), Some(&admin))).await
    });
    tokio::time::sleep(Duration::from_millis(200)).await;
    let (app, admin) = (race.app.clone(), race.admin.clone());
    let second = tokio::spawn(async move {
        let uri = format!("/api/admin/dancers/{survivor}/merge");
        send(&app, post(&uri, json!({ "into": last }), Some(&admin))).await
    });
    tokio::time::sleep(Duration::from_millis(200)).await;
    db::dancers::merge(&mut first, &locked_loser, &locked_survivor, &[])
        .await
        .unwrap();
    first.commit().await.unwrap();

    // The claim moved to the survivor with the first merge; approving it verifies the survivor,
    // which the second merge then may not merge away.
    let (approved, second) = (approve.await.unwrap(), second.await.unwrap());
    assert_eq!(approved.status, StatusCode::OK, "{}", approved.json);
    assert_eq!(second.status, StatusCode::CONFLICT, "{}", second.json);
}
