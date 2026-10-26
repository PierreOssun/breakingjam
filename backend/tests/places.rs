mod test_app;

use axum::{Router, http::StatusCode};
use breakingjam::{db, domain::place::parse_geonames_line};
use serde_json::{Value, json};
use sqlx::PgPool;
use test_app::{app, get, id_of, post, publish, send, sign_up};

/// GeoNames lines: id, name, ASCII name, alternate names, country, lat, lng, population.
const PLACES: &[&str] = &[
    "2991214\tMulhouse\tMulhouse\tMilhouse,Mülhausen\tFR\t47.75205\t7.32866\t111430",
    "2657896\tZürich\tZurich\tZuerich,Zurigo,ZRH\tCH\t47.36667\t8.55\t415367",
    "3413829\tReykjavík\tReykjavik\tReikiavik\tIS\t64.13548\t-21.89541\t118918",
    "2988507\tParis\tParis\tParigi\tFR\t48.85341\t2.3488\t2138551",
    "4717560\tParis\tParis\t\tUS\t33.66094\t-95.55551\t24171",
    // Starts with "paris" and more populated than any Paris: still loses to the exact name.
    "1\tParisville\tParisville\t\tXX\t0\t0\t9000000",
    "1269321\tJammu\tJammu\tJammu City\tIN\t32.73528\t74.86167\t576198",
    "4985153\tBattle Creek\tBattle Creek\t\tUS\t42.3173\t-85.17816\t51589",
    // Under 50,000 people: only found by its own name.
    "790015\tInđija\tIngija\tIndia\tRS\t45.04816\t20.08165\t24450",
    // Namesakes: the French town is smaller but may have a jam.
    "2246452\tSaint-Louis\tSaint-Louis\tNdar\tSN\t16.01793\t-16.48962\t254171",
    "2978742\tSaint-Louis\tSaint-Louis\tSaint-Ludwig\tFR\t47.59206\t7.55923\t20871",
];

async fn with_places(pool: &PgPool) -> Router {
    let places: Vec<_> = PLACES
        .iter()
        .filter_map(|l| parse_geonames_line(l))
        .collect();
    db::places::replace_all(pool, &places).await.unwrap();
    app(pool.clone())
}

async fn find(app: &Router, q: &str) -> Value {
    let uri = format!("/api/places?q={}", urlencode(q));
    let response = send(app, get(&uri, None)).await;
    assert_eq!(response.status, StatusCode::OK);
    response.json["place"].clone()
}

fn urlencode(q: &str) -> String {
    q.bytes()
        .map(|b| match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[sqlx::test]
async fn finds_a_city_case_and_accents_aside(pool: PgPool) {
    let app = with_places(&pool).await;
    let place = find(&app, "Mulhouse").await;
    assert_eq!(place["name"], "Mulhouse");
    assert_eq!(place["country"], "FR");
    assert_eq!(place["lat"], 47.75205);
    assert_eq!(place["lng"], 7.32866);
    assert_eq!(find(&app, "ZURICH").await["name"], "Zürich");
    assert_eq!(find(&app, "reykjavík").await["name"], "Reykjavík");
    // Alternate names count as names.
    assert_eq!(find(&app, "Mülhausen").await["name"], "Mulhouse");
}

#[sqlx::test]
async fn exact_names_come_first_then_the_most_populated(pool: PgPool) {
    let app = with_places(&pool).await;
    let paris = find(&app, "paris").await;
    assert_eq!(
        (paris["name"].as_str(), paris["country"].as_str()),
        (Some("Paris"), Some("FR"))
    );
    // Without an exact name, a prefix does.
    assert_eq!(find(&app, "Reykj").await["name"], "Reykjavík");
}

#[sqlx::test]
async fn a_town_with_a_public_jam_beats_a_bigger_namesake(pool: PgPool) {
    let app = with_places(&pool).await;
    let organizer = sign_up(&app, "org@example.com").await;
    let body = json!({ "name": "Battle of Sun", "starts_on": "2030-09-19", "ends_on": "2030-09-19",
                       "timezone": "Europe/Paris", "city": "Saint-Louis", "country": "FR",
                       "lat": 47.5861, "lng": 7.5626 });
    let jam = id_of(&send(&app, post("/api/events", body, Some(&organizer))).await);
    let country = async || find(&app, "saint louis").await["country"].clone();
    assert_eq!(country().await, "SN", "a draft doesn't count");

    publish(&app, &pool, &jam, &organizer).await;
    assert_eq!(country().await, "FR");
}

#[sqlx::test]
async fn small_towns_answer_to_their_own_name_only(pool: PgPool) {
    let app = with_places(&pool).await;
    assert_eq!(find(&app, "Inđija").await["name"], "Inđija");
    assert_eq!(find(&app, "india").await, Value::Null);
}

#[sqlx::test]
async fn short_or_unknown_searches_name_no_place(pool: PgPool) {
    let app = with_places(&pool).await;
    assert_eq!(find(&app, "Mu").await, Value::Null);
    assert_eq!(find(&app, "Red Bull BC One").await, Value::Null);
    // A code, a 3-letter prefix, a prefix of a name more than twice as long.
    assert_eq!(find(&app, "ZRH").await, Value::Null);
    assert_eq!(find(&app, "jam").await, Value::Null);
    assert_eq!(find(&app, "battle").await, Value::Null);
    assert_eq!(find(&app, "").await, Value::Null);
}
