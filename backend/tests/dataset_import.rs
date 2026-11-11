use std::fs;

use breakingjam::{
    dataset::{import::insert_all, load},
    domain::{battle::BattleGender, dancer::default_look},
};
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

    let mut tx = pool.begin().await.unwrap();
    let imported = insert_all(&mut tx, &data, owner).await.unwrap();
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
        ("BC One 2023", "published")
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

#[sqlx::test]
async fn a_jam_whose_dancer_dances_for_a_crew_with_a_broken_rule_is_left_out(pool: PgPool) {
    let dir = data_dir();
    // The judge's crew is in crews.toml with a country that is no code; only a dancer names it.
    fs::write(
        dir.join("crews.toml"),
        "hustle-kidz = { name = \"Hustle Kidz\", country = \"NL\" }\nruggeds = { name = \"The Ruggeds\" }\nflow = { name = \"Flow Mo\", country = \"Finland\" }\n",
    )
    .unwrap();
    let dancers = fs::read_to_string(dir.join("dancers.toml")).unwrap();
    fs::write(
        dir.join("dancers.toml"),
        dancers.replace(
            "storm = { name = \"Storm\", country = \"DE\" }",
            "storm = { name = \"Storm\", country = \"DE\", crews = [\"flow\"] }",
        ),
    )
    .unwrap();
    let (data, unreadable) = load(&dir);
    fs::remove_dir_all(&dir).unwrap();
    assert!(unreadable.is_empty(), "{unreadable:?}");
    let owner = organizer(&pool).await;

    let mut tx = pool.begin().await.unwrap();
    let imported = insert_all(&mut tx, &data, owner).await.unwrap();
    tx.commit().await.unwrap();

    assert_eq!(imported.events, 0);
    assert_eq!(
        imported.skipped,
        [
            "bc-one/2023: crew flow breaks a rule",
            "bc-one/2024: breaks a rule of `data check`",
        ]
    );
}

#[sqlx::test]
async fn matches_are_stored_round_by_round_winner_first(pool: PgPool) {
    let dir = data_dir();
    let (data, unreadable) = load(&dir);
    fs::remove_dir_all(&dir).unwrap();
    assert!(unreadable.is_empty(), "{unreadable:?}");
    let owner = organizer(&pool).await;

    let mut tx = pool.begin().await.unwrap();
    insert_all(&mut tx, &data, owner).await.unwrap();
    tx.commit().await.unwrap();

    // One dancer per entry in a 1v1, so the subqueries name each side.
    let matches = sqlx::query!(
        r#"select m.round::text as "round!", m.position,
                  (select d.dancer_name from entry_members em join dancers d on d.id = em.dancer_id
                   where em.entry_id = m.winner_id) as "winner!",
                  (select d.dancer_name from entry_members em join dancers d on d.id = em.dancer_id
                   where em.entry_id = m.loser_id) as "loser!",
                  m.video_url
           from battle_matches m order by m.round, m.position"#
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let matches: Vec<_> = matches
        .iter()
        .map(|m| {
            (
                m.round.as_str(),
                m.position,
                m.winner.as_str(),
                m.loser.as_str(),
                m.video_url.as_deref(),
            )
        })
        .collect();
    assert_eq!(
        matches,
        [
            ("top4", 0, "Menno", "Lee", None),
            ("top4", 1, "Ami", "Kastet", None),
            (
                "final",
                0,
                "Ami",
                "Menno",
                Some("https://www.youtube.com/watch?v=abcdefghijk")
            ),
        ]
    );
}

#[sqlx::test]
async fn a_dancers_look_comes_from_dancers_toml_alone(pool: PgPool) {
    let dir = data_dir();
    let dancers = fs::read_to_string(dir.join("dancers.toml")).unwrap();
    fs::write(
        dir.join("dancers.toml"),
        dancers.replace(
            "lee = { name = \"Lee\", country = \"NL\" }",
            "lee = { name = \"Lee\", country = \"NL\", look = \"bgirl\" }",
        ),
    )
    .unwrap();
    let (data, unreadable) = load(&dir);
    fs::remove_dir_all(&dir).unwrap();
    assert!(unreadable.is_empty(), "{unreadable:?}");
    let owner = organizer(&pool).await;

    let mut tx = pool.begin().await.unwrap();
    insert_all(&mut tx, &data, owner).await.unwrap();
    tx.commit().await.unwrap();

    let looks = sqlx::query!(
        "select id, avatar_parts from dancers where dancer_name in ('Lee', 'Menno') order by dancer_name"
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    // Both dance the bboy battle: Lee has the look from dancers.toml, Menno none, as a battle
    // never draws one.
    assert_eq!(
        looks[0].avatar_parts,
        default_look(looks[0].id, BattleGender::Bgirl)
    );
    assert_eq!(looks[1].avatar_parts, None);
}

#[sqlx::test]
async fn every_dancer_comes_with_its_key_in_a_jam_or_not(pool: PgPool) {
    let dir = data_dir();
    let dancers = fs::read_to_string(dir.join("dancers.toml")).unwrap();
    fs::write(
        dir.join("dancers.toml"),
        format!(
            "{dancers}simba = {{ name = \"Simba\", country = \"FR\", crews = [\"ruggeds\"] }}\nbroken = {{ name = \"Broken\", country = \"France\" }}\n"
        ),
    )
    .unwrap();
    let (data, unreadable) = load(&dir);
    fs::remove_dir_all(&dir).unwrap();
    assert!(unreadable.is_empty(), "{unreadable:?}");
    let owner = organizer(&pool).await;

    let mut tx = pool.begin().await.unwrap();
    insert_all(&mut tx, &data, owner).await.unwrap();
    tx.commit().await.unwrap();

    let keys = sqlx::query_scalar!(
        r#"select data_key as "key!" from dancers where data_key in ('menno', 'simba', 'broken') order by data_key"#
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    // Simba is in no jam; Broken breaks a rule of `data check`, so stays out.
    assert_eq!(keys, ["menno", "simba"]);
    let crew = sqlx::query_scalar!(
        r#"select c.name from crew_memberships m join crews c on c.id = m.crew_id
           join dancers d on d.id = m.dancer_id where d.data_key = 'simba'"#
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(crew, "The Ruggeds");
}

/// A country battle nobody won: both teams stay without a stage and keep the battle's video.
#[sqlx::test]
async fn a_battle_nobody_won_leaves_its_teams_unplaced(pool: PgPool) {
    let dir = data_dir();
    fs::write(
        dir.join("events/bc-one/2005.toml"),
        r#"name = "BC One 2005"
starts_on = 2005-09-09
timezone = "Europe/Amsterdam"
city = "Rotterdam"
country = "NL"

[[battles]]
key = "usa-vs-korea"
name = "USA vs Korea"
gender = "bboy"
results = [
  { entrant = "usa", reached = "na", video = "https://youtu.be/abcdefghijk" },
  { entrant = "korea", reached = "na", video = "https://youtu.be/abcdefghijk" },
]

[battles.teams]
usa = { name = "Team USA" }
korea = { name = "Team Korea", members = ["menno", "lee"] }
"#,
    )
    .unwrap();
    let (data, unreadable) = load(&dir);
    fs::remove_dir_all(&dir).unwrap();
    assert!(unreadable.is_empty(), "{unreadable:?}");
    let owner = organizer(&pool).await;

    let mut tx = pool.begin().await.unwrap();
    let imported = insert_all(&mut tx, &data, owner).await.unwrap();
    tx.commit().await.unwrap();

    assert_eq!(imported.events, 2);
    let teams = sqlx::query!(
        r#"select en.team_name as "team!", en.reached::text as "reached!", en.final_rank,
                  en.video_url, count(m.dancer_id) as "members!"
           from entries en
           join battles b on b.id = en.battle_id
           left join entry_members m on m.entry_id = en.id
           where b.name = 'USA vs Korea'
           group by en.id
           order by 1"#
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let rows: Vec<(&str, &str, Option<i32>, i64)> = teams
        .iter()
        .map(|t| (t.team.as_str(), t.reached.as_str(), t.final_rank, t.members))
        .collect();
    assert_eq!(
        rows,
        [("Team Korea", "na", None, 2), ("Team USA", "na", None, 0)]
    );
    assert!(
        teams
            .iter()
            .all(|t| t.video_url.as_deref() == Some("https://www.youtube.com/watch?v=abcdefghijk"))
    );
}

/// A showcase keeps its format, with its size or none, while a crew battle of no fixed size stays
/// of unknown format.
#[sqlx::test]
async fn a_showcase_is_imported_as_one(pool: PgPool) {
    let dir = data_dir();
    fs::write(
        dir.join("events/bc-one/2022.toml"),
        r#"name = "BC One 2022"
starts_on = 2022-10-21
timezone = "Europe/Paris"
city = "Paris"
country = "FR"

[[battles]]
key = "crew-showcase"
name = "Crew Showcase"
gender = "mixed"
format = "showcase"
results = [{ entrant = "ruggeds", reached = "winner" }]

[battles.teams]
ruggeds = { crew = "ruggeds" }

[[battles]]
key = "solo-showcase"
name = "Solo Showcase"
gender = "mixed"
format = "showcase"
team_size = 1
results = [{ entrant = "storm", reached = "winner" }]
"#,
    )
    .unwrap();
    let (data, unreadable) = load(&dir);
    fs::remove_dir_all(&dir).unwrap();
    assert!(unreadable.is_empty(), "{unreadable:?}");
    let owner = organizer(&pool).await;

    let mut tx = pool.begin().await.unwrap();
    let imported = insert_all(&mut tx, &data, owner).await.unwrap();
    tx.commit().await.unwrap();

    assert_eq!(imported.events, 2);
    let battles = sqlx::query!(
        r#"select name, format::text as "format!", team_size from battles
           where name in ('Crew Showcase', 'Solo Showcase', 'Crew battle')
           order by format::text, name"#
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let rows: Vec<(&str, &str, Option<i16>)> = battles
        .iter()
        .map(|b| (b.name.as_str(), b.format.as_str(), b.team_size))
        .collect();
    assert_eq!(
        rows,
        [
            ("Crew battle", "na", None),
            ("Crew Showcase", "showcase", None),
            ("Solo Showcase", "showcase", Some(1)),
        ]
    );
}

/// A 2v2 whose winners are known by their team name only: the result is kept, as the import
/// checks only the result rules the schema holds, not the member count (M26, after review).
#[sqlx::test]
async fn a_team_known_by_name_only_keeps_its_result(pool: PgPool) {
    let dir = data_dir();
    fs::write(
        dir.join("events/bc-one/2006.toml"),
        r#"name = "BC One 2006"
starts_on = 2006-09-09
timezone = "Europe/Amsterdam"
city = "Rotterdam"
country = "NL"

[[battles]]
key = "duo"
name = "2v2"
gender = "bboy"
team_size = 2
results = [
  { entrant = "flow", reached = "winner" },
  { entrant = "dutch", reached = "top2" },
]

[battles.teams]
flow = { name = "Flow Mo" }
dutch = { name = "Dutch Duo", members = ["menno", "lee"] }
"#,
    )
    .unwrap();
    let (data, unreadable) = load(&dir);
    fs::remove_dir_all(&dir).unwrap();
    assert!(unreadable.is_empty(), "{unreadable:?}");
    let owner = organizer(&pool).await;

    let mut tx = pool.begin().await.unwrap();
    let imported = insert_all(&mut tx, &data, owner).await.unwrap();
    tx.commit().await.unwrap();

    assert!(
        !imported.skipped.iter().any(|s| s.contains("2006")),
        "{:?}",
        imported.skipped
    );
    let results = sqlx::query!(
        r#"select en.team_name as "team!", en.final_rank from entries en
           join battles b on b.id = en.battle_id where b.name = '2v2' order by en.final_rank"#
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let rows: Vec<(&str, Option<i32>)> = results
        .iter()
        .map(|r| (r.team.as_str(), r.final_rank))
        .collect();
    assert_eq!(rows, [("Flow Mo", Some(1)), ("Dutch Duo", Some(2))]);
}

#[sqlx::test]
async fn running_again_adds_only_the_new_jams_and_keeps_the_sites_edits(pool: PgPool) {
    let dir = data_dir();
    let (data, _) = load(&dir);
    let owner = organizer(&pool).await;
    let mut tx = pool.begin().await.unwrap();
    insert_all(&mut tx, &data, owner).await.unwrap();
    tx.commit().await.unwrap();

    // On the site: Menno's page is renamed, and Lee's merged into Kastet's.
    sqlx::query!("update dancers set dancer_name = 'Menno B.' where data_key = 'menno'")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query!(
        "update dancers set merged_into_id = (select id from dancers where data_key = 'kastet')
         where data_key = 'lee'"
    )
    .execute(&pool)
    .await
    .unwrap();
    // In data/: a new jam, judged by a new dancer, and a new crew only Lee, imported already, names.
    let dancers = fs::read_to_string(dir.join("dancers.toml")).unwrap();
    fs::write(
        dir.join("dancers.toml"),
        dancers.replace(
            "lee = { name = \"Lee\", country = \"NL\" }",
            "lee = { name = \"Lee\", country = \"NL\", crews = [\"flow\"] }",
        ) + "neo = { name = \"Neo\", country = \"FR\" }\n",
    )
    .unwrap();
    let crews = fs::read_to_string(dir.join("crews.toml")).unwrap();
    fs::write(
        dir.join("crews.toml"),
        crews + "flow = { name = \"Flow Mo\", country = \"FI\" }\n",
    )
    .unwrap();
    fs::write(
        dir.join("events/bc-one/2025.toml"),
        r#"name = "BC One 2025"
starts_on = 2025-10-21
timezone = "Europe/Paris"
city = "Paris"
country = "FR"
judges = ["neo"]

[[battles]]
key = "bboy"
name = "1v1 Bboy"
gender = "bboy"
bracket_size = 2
matches = [{ round = "final", a = "menno", b = "lee", winner = "menno" }]

[[battles]]
key = "duo"
name = "2v2"
gender = "mixed"
results = [{ entrant = "duo", reached = "winner" }]

[battles.teams]
duo = { name = "Duo", members = ["lee", "kastet"] }
"#,
    )
    .unwrap();
    let (data, unreadable) = load(&dir);
    fs::remove_dir_all(&dir).unwrap();
    assert!(unreadable.is_empty(), "{unreadable:?}");

    let mut tx = pool.begin().await.unwrap();
    let imported = insert_all(&mut tx, &data, owner).await.unwrap();
    tx.commit().await.unwrap();

    assert_eq!(
        (imported.events, imported.events_before),
        (1, 1),
        "only BC One 2025 is new"
    );
    // Flow Mo would have no member: Lee's crews aren't changed, as an imported dancer.
    assert_eq!((imported.new_dancers, imported.crews), (1, 0));
    assert_eq!(
        imported.skipped,
        ["bc-one/2024: breaks a rule of `data check`"]
    );
    // Lee and Kastet are one page now, so one member of the duo.
    let duo = sqlx::query_scalar!(
        r#"select d.dancer_name from entries en
           join entry_members em on em.entry_id = en.id
           join dancers d on d.id = em.dancer_id
           where en.team_name = 'Duo'"#
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(duo, ["Kastet"]);
    let jams = sqlx::query_scalar!("select count(*) from events")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(jams, Some(2));
    // The new final names the pages as the site left them.
    let final_2025 = sqlx::query_scalar!(
        r#"select d.dancer_name from battle_matches m
           join events e on e.data_key = 'bc-one/2025'
           join battles b on b.id = m.battle_id and b.event_id = e.id and b.name = '1v1 Bboy'
           join entry_members em on em.entry_id in (m.winner_id, m.loser_id)
           join dancers d on d.id = em.dancer_id
           order by em.entry_id = m.loser_id"#
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(final_2025, ["Menno B.", "Kastet"]);
    let names =
        sqlx::query_scalar!("select count(*) from dancers where dancer_name in ('Menno', 'Lee')")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        names,
        Some(1),
        "only the merged Lee row, nothing written again"
    );
}

#[sqlx::test]
async fn a_database_filled_before_jams_had_keys_is_refused(pool: PgPool) {
    let dir = data_dir();
    let (data, _) = load(&dir);
    fs::remove_dir_all(&dir).unwrap();
    let owner = organizer(&pool).await;
    let mut tx = pool.begin().await.unwrap();
    insert_all(&mut tx, &data, owner).await.unwrap();
    tx.commit().await.unwrap();
    // As UAT was seeded: the same rows, without their keys.
    for table in [
        "update events set data_key = null",
        "update dancers set data_key = null",
    ] {
        sqlx::query(table).execute(&pool).await.unwrap();
    }

    let mut tx = pool.begin().await.unwrap();
    let refused = insert_all(&mut tx, &data, owner).await.unwrap_err();

    assert_eq!(
        refused.to_string(),
        "1 jams of data/ are already in the database without a key (bc-one/2023…): it was filled before jams had keys, so import into a fresh one"
    );
}
