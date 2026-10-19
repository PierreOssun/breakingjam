use std::fs;

use breakingjam::dataset::{import::insert_all, load};
use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

/// A jam with a 1v1 bracket, a crew battle known by its results, and a jam whose bracket is broken.
fn data_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("breakingjam-import-{}", Uuid::now_v7()));
    fs::create_dir_all(dir.join("series")).unwrap();
    fs::create_dir_all(dir.join("events/bc-one")).unwrap();
    fs::write(dir.join("series/bc-one.toml"), "name = \"BC One\"\n").unwrap();
    fs::write(
        dir.join("dancers.toml"),
        r#"menno = { name = "Menno", country = "NL", crews = ["hustle-kidz"] }
lee = { name = "Lee", country = "NL" }
ami = { name = "Ami", country = "JP" }
kastet = { name = "Kastet", country = "RU" }
storm = { name = "Storm", country = "DE" }
"#,
    )
    .unwrap();
    fs::write(
        dir.join("crews.toml"),
        "hustle-kidz = { name = \"Hustle Kidz\", country = \"NL\" }\nruggeds = { name = \"The Ruggeds\" }\n",
    )
    .unwrap();
    fs::write(
        dir.join("events/bc-one/2023.toml"),
        r#"name = "BC One 2023"
starts_on = 2023-10-21
timezone = "Europe/Paris"
city = "Paris"
country = "FR"
lat = 48.8566
lng = 2.3522
judges = ["storm"]

[[battles]]
key = "bboy"
name = "1v1 Bboy"
gender = "bboy"
bracket_size = 4
matches = [
  { round = "top4", a = "menno", b = "lee", winner = "menno" },
  { round = "top4", a = "ami", b = "kastet", winner = "ami" },
  { round = "final", a = "menno", b = "ami", winner = "ami", video = "https://youtu.be/abcdefghijk" },
]

[[battles]]
key = "crew"
name = "Crew battle"
gender = "mixed"
results = [{ entrant = "ruggeds", reached = "winner" }]

[battles.teams]
ruggeds = { crew = "ruggeds" }
"#,
    )
    .unwrap();
    fs::write(
        dir.join("events/bc-one/2024.toml"),
        r#"name = "BC One 2024"
starts_on = 2024-10-21
timezone = "Europe/Paris"
city = "Paris"
country = "FR"

[[battles]]
key = "bboy"
name = "1v1 Bboy"
gender = "bboy"
bracket_size = 2
matches = [{ round = "final", a = "menno", b = "lee", winner = "TODO" }]
"#,
    )
    .unwrap();
    dir
}

async fn organizer(pool: &PgPool) -> Uuid {
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
async fn imports_the_jams_that_pass_check(pool: PgPool) {
    let dir = data_dir();
    let (data, unreadable) = load(&dir);
    fs::remove_dir_all(&dir).unwrap();
    assert!(unreadable.is_empty(), "{unreadable:?}");
    let owner = organizer(&pool).await;
    let today = NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();

    let mut tx = pool.begin().await.unwrap();
    let imported = insert_all(&mut tx, &data, owner, today).await.unwrap();
    tx.commit().await.unwrap();

    assert_eq!(imported.events, 1);
    assert_eq!(
        imported.skipped,
        ["bc-one/2024: breaks a rule of `data check`"]
    );
    let events = sqlx::query!(r#"select name, status::text as "status!", lat, lng from events"#)
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(events.len(), 1);
    assert_eq!(
        (events[0].name.as_str(), events[0].status.as_str()),
        ("BC One 2023", "completed")
    );
    assert_eq!(
        (events[0].lat, events[0].lng),
        (Some(48.8566), Some(2.3522))
    );

    let results = sqlx::query!(
        r#"select coalesce(d.dancer_name, en.team_name) as "who!", en.reached::text as "reached!", en.final_rank, en.video_url
           from entries en
           left join entry_members m on m.entry_id = en.id
           left join dancers d on d.id = m.dancer_id
           order by en.final_rank nulls last, 1"#
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let rows: Vec<(&str, &str, Option<i32>)> = results
        .iter()
        .map(|r| (r.who.as_str(), r.reached.as_str(), r.final_rank))
        .collect();
    assert_eq!(
        rows,
        [
            ("Ami", "winner", Some(1)),
            ("The Ruggeds", "winner", Some(1)),
            ("Menno", "top2", Some(2)),
            ("Kastet", "top4", None),
            ("Lee", "top4", None),
        ]
    );
    assert_eq!(
        results[0].video_url.as_deref(),
        Some("https://www.youtube.com/watch?v=abcdefghijk")
    );

    let staff = sqlx::query_scalar!(
        r#"select d.dancer_name from event_staff s join dancers d on d.id = s.dancer_id where s.role = 'judge'"#
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(staff, ["Storm"]);
    let memberships = sqlx::query_scalar!(
        r#"select c.name from crew_memberships m join crews c on c.id = m.crew_id join dancers d on d.id = m.dancer_id where d.dancer_name = 'Menno'"#
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(memberships, ["Hustle Kidz"]);
}
