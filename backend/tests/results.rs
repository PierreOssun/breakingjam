mod test_app;

use axum::{Router, http::StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{app, get, id_of, post, send, sign_up};

/// An organiser entering jams that end a number of days from today.
struct Organiser {
    app: Router,
    pool: PgPool,
    cookie: String,
}

impl Organiser {
    /// A jam of `status` ending `days` from today, whatever day the test runs.
    async fn jam(&self, name: &str, days: i32, status: &str) -> String {
        let body = json!({ "name": name, "starts_on": "2030-06-01", "ends_on": "2030-06-01",
                           "timezone": "Europe/Paris", "city": "Paris", "country": "FR" });
        let id = id_of(&send(&self.app, post("/api/events", body, Some(&self.cookie))).await);
        sqlx::query!(
            "update events
             set status = $1::text::event_status,
                 starts_on = (now() at time zone 'Europe/Paris')::date + $2::int,
                 ends_on = (now() at time zone 'Europe/Paris')::date + $2::int
             where id = $3::text::uuid",
            status,
            days,
            id
        )
        .execute(&self.pool)
        .await
        .unwrap();
        id
    }

    async fn battle(&self, jam: &str, team_size: i32) -> String {
        let body = json!({ "format": "team", "team_size": team_size, "gender": "mixed",
                           "age": "adult", "age_min": 18 });
        let uri = format!("/api/events/{jam}/battles");
        id_of(&send(&self.app, post(&uri, body, Some(&self.cookie))).await)
    }

    async fn entry(&self, battle: &str, dancers: &[&str]) -> String {
        let mut ids = Vec::new();
        for name in dancers {
            let body = json!({ "dancer_name": name, "country": "FR" });
            let dancer = send(&self.app, post("/api/dancers", body, Some(&self.cookie))).await;
            ids.push(id_of(&dancer));
        }
        let uri = format!("/api/battles/{battle}/entries");
        let body = json!({ "dancer_ids": ids });
        id_of(&send(&self.app, post(&uri, body, Some(&self.cookie))).await)
    }

    /// Writes a result straight away: the jam is already over, so the API would refuse it.
    async fn set(&self, entry: &str, final_rank: Option<i32>, status: &str, video: Option<&str>) {
        sqlx::query!(
            // `reached` follows the rank, as the `entries_winner_is_first` check wants.
            "update entries
             set final_rank = $1, status = $2::text::entry_status, video_url = $3,
                 reached = case $1::int when 1 then 'winner' when 2 then 'top2' else 'na' end
                           ::bracket_stage
             where id = $4::text::uuid",
            final_rank,
            status,
            video,
            entry
        )
        .execute(&self.pool)
        .await
        .unwrap();
    }

    /// A finished jam with one battle won by `winner`.
    async fn won(&self, name: &str, days: i32, status: &str, winner: &str) -> String {
        let jam = self.jam(name, days, status).await;
        let battle = self.battle(&jam, 1).await;
        let entry = self.entry(&battle, &[winner]).await;
        self.set(&entry, Some(1), "confirmed", None).await;
        jam
    }
}

async fn organiser(pool: PgPool) -> Organiser {
    let app = app(pool.clone());
    let cookie = sign_up(&app, &pool, "org@example.com").await;
    Organiser { app, pool, cookie }
}

async fn results(organiser: &Organiser) -> Value {
    let response = send(&organiser.app, get("/api/results", None)).await;
    assert_eq!(response.status, StatusCode::OK);
    response.json
}

#[sqlx::test]
async fn results_list_the_three_latest_finished_jams_with_a_winner(pool: PgPool) {
    let org = organiser(pool).await;
    org.won("Last week", -7, "published", "Lil G").await;
    org.won("Yesterday", -1, "registration_closed", "Ventus")
        .await;
    org.won("Last month", -30, "published", "Nova").await;
    org.won("Last year", -365, "published", "Halo").await;
    org.won("Coming up", 3, "published", "Early").await;
    org.won("Called off", -2, "cancelled", "Gone").await;
    org.won("Draft", -2, "draft", "Hidden").await;
    let no_winner = org.jam("No winner", -2, "published").await;
    let battle = org.battle(&no_winner, 1).await;
    org.entry(&battle, &["Second"]).await;
    let withdrawn = org.jam("Withdrawn winner", -2, "published").await;
    let battle = org.battle(&withdrawn, 1).await;
    let entry = org.entry(&battle, &["Quit"]).await;
    org.set(&entry, Some(1), "withdrawn", None).await;

    let names: Vec<Value> = results(&org)
        .await
        .as_array()
        .unwrap()
        .iter()
        .map(|jam| jam["name"].clone())
        .collect();
    assert_eq!(names, ["Yesterday", "Last week", "Last month"]);
}

#[sqlx::test]
async fn results_carry_two_winners_the_battle_count_and_videos(pool: PgPool) {
    let org = organiser(pool).await;
    let jam = org.jam("DPC Jam", -1, "published").await;
    let duo = org.battle(&jam, 2).await;
    let solo = org.battle(&jam, 1).await;
    let unjudged = org.battle(&jam, 1).await;
    let crew = org.battle(&jam, 3).await;
    let duo_winner = org.entry(&duo, &["Saison", "Deux"]).await;
    let solo_winner = org.entry(&solo, &["Nova"]).await;
    let solo_second = org.entry(&solo, &["Glitch"]).await;
    org.entry(&unjudged, &["Waiting"]).await;
    let crew_winner = org.entry(&crew, &["A", "B", "C"]).await;
    org.set(&duo_winner, Some(1), "confirmed", None).await;
    org.set(&solo_winner, Some(1), "confirmed", None).await;
    let video = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    org.set(&solo_second, Some(2), "confirmed", Some(video))
        .await;
    org.set(&crew_winner, Some(1), "confirmed", None).await;

    let all = results(&org).await;
    let card = &all[0];
    assert_eq!(card["battle_count"], 4);
    assert_eq!(card["has_videos"], true);
    let winners = card["winners"].as_array().unwrap();
    assert_eq!(winners.len(), 2, "two winner lines at most");
    assert_eq!(winners[0]["battle"], "2v2 Mixed");
    assert_eq!(winners[0]["entry"]["id"], duo_winner.as_str());
    assert_eq!(winners[0]["entry"]["members"].as_array().unwrap().len(), 2);
    assert_eq!(winners[1]["battle"], "1v1 Mixed");
    assert_eq!(winners[1]["entry"]["members"][0]["dancer_name"], "Nova");
}

#[sqlx::test]
async fn results_have_no_videos_flag_when_only_a_withdrawn_entry_has_one(pool: PgPool) {
    let org = organiser(pool).await;
    let jam = org.jam("Quiet", -1, "published").await;
    let battle = org.battle(&jam, 1).await;
    let winner = org.entry(&battle, &["Nova"]).await;
    let gone = org.entry(&battle, &["Gone"]).await;
    org.set(&winner, Some(1), "confirmed", None).await;
    let video = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    org.set(&gone, None, "withdrawn", Some(video)).await;

    assert_eq!(results(&org).await[0]["has_videos"], false);
}

#[sqlx::test]
async fn results_are_empty_on_an_empty_site(pool: PgPool) {
    let org = organiser(pool).await;
    assert_eq!(results(&org).await, json!([]));
}
