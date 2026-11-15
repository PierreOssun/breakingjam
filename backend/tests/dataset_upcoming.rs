use std::fs;

use breakingjam::dataset::upcoming::{Added, UpcomingError, insert, load};
use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

/// Three jams around 1 Jan 2030: one with an Instagram link, one with no contact, one already over.
const FILE: &str = r#"
[[jams]]
key = "winter-jam-2030"
name = "Winter Jam 2030"
starts_on = "2030-02-01"
ends_on = "2030-02-02"
timezone = "Europe/Paris"
city = "Lyon"
country = "FR"
lat = 45.764
lng = 4.8357
instagram_url = "https://www.instagram.com/winterjam"
sources = ["https://example.com/winter-jam"]
battles = [
  { name = "1v1 Bboy", format = "team", team_size = 1, gender = "bboy", age = "na", starts_at = "2030-02-01T15:00:00" },
  { name = "Kids", format = "na", gender = "mixed", age = "kids", age_max = 15 },
]

[[jams]]
key = "quiet-jam-2030"
name = "Quiet Jam 2030"
starts_on = "2030-03-01"
ends_on = "2030-03-01"
timezone = "Europe/Zurich"
city = "Zurich"
country = "CH"
lat = 47.3769
lng = 8.5417
battles = [{ name = "2v2", format = "team", team_size = 2, gender = "mixed", age = "na" }]

[[jams]]
key = "old-jam-2029"
name = "Old Jam 2029"
starts_on = "2029-12-30"
ends_on = "2029-12-31"
timezone = "Europe/Paris"
city = "Paris"
country = "FR"
lat = 48.8566
lng = 2.3522
instagram_url = "https://www.instagram.com/oldjam"
battles = [{ name = "1v1", format = "team", team_size = 1, gender = "mixed", age = "na" }]
"#;

fn today() -> NaiveDate {
    NaiveDate::from_ymd_opt(2030, 1, 1).unwrap()
}

/// A data folder holding `upcoming.toml` with `text`.
fn data_dir(text: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("breakingjam-upcoming-{}", Uuid::now_v7()));
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("upcoming.toml"), text).unwrap();
    dir
}

async fn team(pool: &PgPool) -> Uuid {
    let id = Uuid::now_v7();
    sqlx::query!(
        "insert into app_users (id, email, display_name, role) values ($1, 'team@example.com', 'Team', 'seed_admin')",
        id
    )
    .execute(pool)
    .await
    .unwrap();
    id
}

#[sqlx::test]
async fn writes_the_jams_to_come_as_the_team_once(pool: PgPool) {
    let dir = data_dir(FILE);
    let jams = load(&dir).unwrap();
    fs::remove_dir_all(&dir).unwrap();
    let owner = team(&pool).await;

    let mut tx = pool.begin().await.unwrap();
    let added = insert(&mut tx, &jams, owner, today()).await.unwrap();
    tx.commit().await.unwrap();
    // No Instagram link or contact email: the publish checklist keeps it a draft, and says why.
    let draft = "Quiet Jam 2030: add an Instagram link or a contact email".to_owned();
    assert_eq!(
        added,
        Added {
            jams: 2,
            drafts: vec![draft],
            already: 0
        }
    );

    let rows = sqlx::query!(
        r#"select e.data_key as "key!", e.status::text as "status!", e.entered_by_team,
                  count(b.id) as "battles!"
           from events e left join battles b on b.event_id = e.id
           group by e.id order by e.starts_on"#
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let rows: Vec<(String, String, bool, i64)> = rows
        .into_iter()
        .map(|r| (r.key, r.status, r.entered_by_team, r.battles))
        .collect();
    assert_eq!(
        rows,
        [
            (
                "upcoming:winter-jam-2030".into(),
                "published".into(),
                true,
                2
            ),
            ("upcoming:quiet-jam-2030".into(), "draft".into(), true, 1),
        ]
    );

    // The site deletes one and renames the other: a second run finds both by key, writes nothing.
    sqlx::query!("update events set deleted_at = now() where data_key = 'upcoming:quiet-jam-2030'")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query!(
        "update events set name = 'Moved Jam' where data_key = 'upcoming:winter-jam-2030'"
    )
    .execute(&pool)
    .await
    .unwrap();
    let mut tx = pool.begin().await.unwrap();
    let again = insert(&mut tx, &jams, owner, today()).await.unwrap();
    assert_eq!(
        again,
        Added {
            already: 2,
            ..Added::default()
        }
    );
}

#[test]
fn a_key_used_twice_is_refused() {
    let dir = data_dir(&FILE.replace("quiet-jam-2030", "winter-jam-2030"));
    let error = load(&dir).unwrap_err();
    fs::remove_dir_all(&dir).unwrap();
    assert_eq!(
        error.to_string(),
        "upcoming.toml: key winter-jam-2030 is used twice"
    );
}

#[test]
fn a_folder_without_the_file_has_no_upcoming_jams() {
    let dir = data_dir("");
    fs::remove_file(dir.join("upcoming.toml")).unwrap();
    let jams = load(&dir).unwrap();
    fs::remove_dir_all(&dir).unwrap();
    assert!(jams.is_empty());
}

#[sqlx::test]
async fn a_battle_the_api_would_refuse_stops_the_import(pool: PgPool) {
    // A team battle needs its team size.
    let dir = data_dir(&FILE.replace(
        r#"format = "team", team_size = 2, "#,
        r#"format = "team", "#,
    ));
    let jams = load(&dir).unwrap();
    fs::remove_dir_all(&dir).unwrap();
    let owner = team(&pool).await;

    let mut tx = pool.begin().await.unwrap();
    let error = insert(&mut tx, &jams, owner, today()).await.unwrap_err();
    assert!(
        matches!(&error, UpcomingError::Invalid(why) if why.starts_with("Quiet Jam 2030: 2v2:")),
        "{error}"
    );
}
