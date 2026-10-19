//! Local dev seed: admin users, the curated past jams of `data/`, and invented upcoming jams with dancers and crews (ARCHITECTURE §8).

use std::{collections::HashMap, path::Path};

use anyhow::Context;
use breakingjam::{
    auth::password,
    dataset::{self, import, key_for},
    db,
    domain::{
        battle::{
            BattleAge, BattleFields, BattleFormat, BattleGender, BracketStage, EntryFields,
            EntryStatus,
            StaffRole::{self, Dj, Judge, Mc},
        },
        event::{EventStatus, slug},
        user::Role,
    },
};
use chrono::{Days, NaiveDate, NaiveDateTime};
use sqlx::{PgConnection, PgPool, postgres::PgConnectOptions};
use uuid::Uuid;
use validator::Validate;

struct User {
    email: &'static str,
    display_name: &'static str,
    role: Role,
}

const ADMIN: User = User {
    email: "admin@breakingjam.local",
    display_name: "Admin",
    role: Role::Admin,
};
const SEED_ADMIN: User = User {
    email: "seed@breakingjam.local",
    display_name: "BreakingJam Team",
    role: Role::SeedAdmin,
};
const ORGANIZER: User = User {
    email: "organizer@breakingjam.local",
    display_name: "Cypher Collective",
    role: Role::Organizer,
};

struct Event {
    name: &'static str,
    city: &'static str,
    country: &'static str,
    timezone: &'static str,
    lat: f64,
    lng: f64,
    /// The jam page's pitch, website and contact; `.example` domains, which never resolve.
    about: About,
    /// Start date relative to today, so the invented jams stay upcoming; past jams come from `data/`.
    starts_in_days: i32,
    length_days: i32,
    status: EventStatus,
    /// Judges, DJs and MCs, by dancer name.
    staff: &'static [(StaffRole, &'static str)],
    battles: &'static [Battle],
}

struct About {
    description: &'static str,
    website: &'static str,
    email: &'static str,
}

struct Battle {
    format: BattleFormat,
    team_size: Option<i16>,
    gender: BattleGender,
    age: BattleAge,
    /// ISO 4217 currency and the cash prizes for 1st, 2nd and 3rd.
    prize: Option<(&'static str, [i32; 3])>,
    /// Dancers, or crews in team battles, registered.
    entrants: &'static [&'static str],
}

const BBOY_1V1: Battle = Battle {
    format: BattleFormat::Team,
    team_size: Some(1),
    gender: BattleGender::Bboy,
    age: BattleAge::Na,
    prize: None,
    entrants: &[],
};
const BGIRL_1V1: Battle = Battle {
    gender: BattleGender::Bgirl,
    ..BBOY_1V1
};
const KIDS_1V1: Battle = Battle {
    gender: BattleGender::Mixed,
    age: BattleAge::Kids,
    ..BBOY_1V1
};
const CREW_2V2: Battle = Battle {
    team_size: Some(2),
    gender: BattleGender::Mixed,
    ..BBOY_1V1
};
const CREW_3V3: Battle = Battle {
    team_size: Some(3),
    ..CREW_2V2
};
const SEVEN_TO_SMOKE: Battle = Battle {
    format: BattleFormat::SevenToSmoke,
    team_size: None,
    ..BBOY_1V1
};

#[rustfmt::skip]
const EVENTS: &[Event] = &[
    Event {
        name: "Paris Cypher Sessions", city: "Paris", country: "FR", timezone: "Europe/Paris", lat: 48.8566, lng: 2.3522,
        about: About { description: "Two days of cyphers and battles under the Paris rooftops. Bring your crew, bring your best rounds, and stay for the open cypher after the final.", website: "https://pariscypher.example", email: "hello@pariscypher.example" },
        starts_in_days: 20, length_days: 2, status: EventStatus::Published,
        staff: &[(Judge, "Menno"), (Judge, "Hong 10"), (Dj, "DJ Krate"), (Mc, "MC Volta")],
        battles: &[
            Battle { prize: Some(("EUR", [1500, 750, 300])), entrants: &["Lilou", "Dany Dann", "Junior", "Mounir", "Kid Rocket", "Ventus", "Moonwalka", "Echo"], ..BBOY_1V1 },
            Battle { entrants: &["Floor Lords", "Spin Syndicate", "Alpine Breakers", "Tokyo Freeze"], ..CREW_2V2 },
        ],
    },
    Event {
        name: "Berlin Floor Wars", city: "Berlin", country: "DE", timezone: "Europe/Berlin", lat: 52.5200, lng: 13.4050,
        about: About { description: "Berlin's crew war is back: 3v3 crews on one floor, a bgirl bracket, and a DJ set that runs until the last round is danced.", website: "https://berlinfloorwars.example", email: "hello@berlinfloorwars.example" },
        starts_in_days: 35, length_days: 1, status: EventStatus::Published,
        staff: &[(Judge, "Lil Zoo"), (Judge, "Junior"), (Dj, "DJ Loopa"), (Mc, "MC Rhyno")],
        battles: &[
            Battle { prize: Some(("EUR", [3000, 1500, 600])), entrants: &["Spin Syndicate", "Floor Lords", "Seoul Riders", "Tokyo Freeze"], ..CREW_3V3 },
            Battle { entrants: &["Bgirl Lumen", "Bgirl Ember", "Bgirl Saffron", "Bgirl Pixel"], ..BGIRL_1V1 },
        ],
    },
    Event {
        name: "Zurich Toprock Jam", city: "Zurich", country: "CH", timezone: "Europe/Zurich", lat: 47.3769, lng: 8.5417,
        about: About { description: "A jam for the foundations: toprock, footwork and style first. 1v1 bboys and a 2v2 by the lake, with live DJ and MC.", website: "https://zurichtoprock.example", email: "hello@zurichtoprock.example" },
        starts_in_days: 50, length_days: 1, status: EventStatus::Published,
        staff: &[(Judge, "Lilou"), (Dj, "DJ Krate"), (Mc, "MC Volta")],
        battles: &[
            Battle { prize: Some(("CHF", [1000, 500, 250])), entrants: &["Lil Zoo", "Menno", "Atlas", "Drift", "Spinzilla", "Krypt"], ..BBOY_1V1 },
            Battle { entrants: &["Alpine Breakers", "Spin Syndicate", "Floor Lords", "Seoul Riders"], ..CREW_2V2 },
        ],
    },
    Event {
        name: "Lyon Footwork Fest", city: "Lyon", country: "FR", timezone: "Europe/Paris", lat: 45.7640, lng: 4.8357,
        about: About { description: "Lyon's weekend of footwork: a 1v1 bracket on Saturday, a seven-to-smoke on Sunday, and workshops in between.", website: "https://lyonfootwork.example", email: "hello@lyonfootwork.example" },
        starts_in_days: 80, length_days: 2, status: EventStatus::Published,
        staff: &[(Judge, "Victor"), (Dj, "DJ Loopa")],
        battles: &[
            Battle { entrants: &["Lilou", "Mounir", "Ventus", "Moonwalka"], ..BBOY_1V1 },
            Battle { entrants: &["Dany Dann", "Junior", "Kid Rocket", "Echo"], ..SEVEN_TO_SMOKE },
        ],
    },
    Event {
        name: "Amsterdam Freeze Frame", city: "Amsterdam", country: "NL", timezone: "Europe/Amsterdam", lat: 52.3676, lng: 4.9041,
        about: About { description: "One night, one bracket: the Freeze Frame 1v1 and a bgirl showcase in the heart of Amsterdam. Registration is full.", website: "https://freezeframe.example", email: "hello@freezeframe.example" },
        starts_in_days: 10, length_days: 1, status: EventStatus::RegistrationClosed,
        staff: &[(Judge, "Lil Zoo"), (Judge, "Physicx"), (Dj, "DJ Krate")],
        battles: &[
            Battle { prize: Some(("EUR", [1000, 500, 250])), entrants: &["Menno", "Halo", "Glitch", "Sunni", "Echo", "Krypt", "Flexo", "Drift"], ..BBOY_1V1 },
            Battle { entrants: &["Bgirl Ember", "Bgirl Lumen"], ..BGIRL_1V1 },
        ],
    },
    Event {
        name: "Seoul Power Moves", city: "Seoul", country: "KR", timezone: "Asia/Seoul", lat: 37.5665, lng: 126.9780,
        about: About { description: "Power moves, big sets and a top 8 from across Asia. Two days in Seoul with a 2v2 crew bracket on day two.", website: "https://seoulpowermoves.example", email: "hello@seoulpowermoves.example" },
        starts_in_days: 45, length_days: 2, status: EventStatus::Published,
        staff: &[(Judge, "Menno"), (Judge, "Lilou"), (Judge, "Victor"), (Dj, "DJ Loopa"), (Mc, "MC Rhyno")],
        battles: &[
            Battle { prize: Some(("KRW", [5_000_000, 2_000_000, 1_000_000])), entrants: &["Hong 10", "Wing", "Physicx", "Pocket", "Shigekix", "Issei", "Sensei Kai", "Vortex"], ..BBOY_1V1 },
            Battle { entrants: &["Seoul Riders", "Tokyo Freeze", "Floor Lords", "Spin Syndicate"], ..CREW_2V2 },
        ],
    },
    Event {
        name: "Montpellier Kids Jam", city: "Montpellier", country: "FR", timezone: "Europe/Paris", lat: 43.6108, lng: 3.8767,
        about: About { description: "A jam for the next generation: 1v1 and 2v2 kids battles, open to dancers under 18, with parents welcome in the stands.", website: "https://montpellierkids.example", email: "hello@montpellierkids.example" },
        starts_in_days: 140, length_days: 1, status: EventStatus::Draft,
        staff: &[(Judge, "Kid Rocket"), (Dj, "DJ Krate")],
        battles: &[
            KIDS_1V1,
            Battle { team_size: Some(2), ..KIDS_1V1 },
        ],
    },
];

/// An ordinary organiser's jams, waiting in the admins' review queue.
#[rustfmt::skip]
const IN_REVIEW: &[Event] = &[
    Event {
        name: "Geneva Lakeside Battle", city: "Geneva", country: "CH", timezone: "Europe/Zurich", lat: 46.2044, lng: 6.1432,
        about: About { description: "Battles on the shore of Lake Geneva: a 1v1 bboy bracket with cash prizes and a 2v2 for every style.", website: "https://genevalakeside.example", email: "hello@genevalakeside.example" },
        starts_in_days: 60, length_days: 1, status: EventStatus::InReview,
        staff: &[(Judge, "Atlas"), (Dj, "DJ Loopa")],
        battles: &[Battle { prize: Some(("CHF", [800, 400, 200])), ..BBOY_1V1 }, CREW_2V2],
    },
    Event {
        name: "Milan Breaking Weekend", city: "Milan", country: "IT", timezone: "Europe/Rome", lat: 45.4642, lng: 9.19,
        about: About { description: "A weekend of breaking in Milan, with bboy and bgirl brackets and an open floor all day.", website: "https://milanbreaking.example", email: "hello@milanbreaking.example" },
        starts_in_days: 25, length_days: 2, status: EventStatus::InReview,
        staff: &[],
        battles: &[BBOY_1V1, BGIRL_1V1],
    },
];

struct Crew {
    name: &'static str,
    country: &'static str,
    city: &'static str,
}

#[rustfmt::skip]
const CREWS: &[Crew] = &[
    Crew { name: "Floor Lords", country: "FR", city: "Paris" },
    Crew { name: "Spin Syndicate", country: "DE", city: "Berlin" },
    Crew { name: "Alpine Breakers", country: "CH", city: "Zurich" },
    Crew { name: "Seoul Riders", country: "KR", city: "Seoul" },
    Crew { name: "Tokyo Freeze", country: "JP", city: "Tokyo" },
];

struct Dancer {
    name: &'static str,
    aliases: &'static [&'static str],
    country: &'static str,
    country2: Option<&'static str>,
    city: &'static str,
    handle: Option<&'static str>,
    notable: bool,
    /// Index into `CREWS` and the year joined (`None` = unknown).
    crew: Option<(usize, Option<i32>)>,
}

// "Kid Rocket" / "Kid Rockett" is a deliberate near-duplicate pair for merge testing.
#[rustfmt::skip]
const DANCERS: &[Dancer] = &[
    Dancer { name: "Kid Rocket", aliases: &["Rocket"], country: "FR", country2: None, city: "Paris", handle: Some("kidrocket_bj"), notable: true, crew: Some((0, Some(2015))) },
    Dancer { name: "Kid Rockett", aliases: &[], country: "FR", country2: None, city: "Paris", handle: None, notable: false, crew: None },
    Dancer { name: "Ventus", aliases: &[], country: "FR", country2: None, city: "Paris", handle: Some("ventus_bj"), notable: true, crew: Some((0, None)) },
    Dancer { name: "Bgirl Ember", aliases: &["Ember"], country: "FR", country2: Some("MA"), city: "Lyon", handle: Some("bgirlember_bj"), notable: true, crew: Some((0, Some(2019))) },
    Dancer { name: "Moonwalka", aliases: &[], country: "FR", country2: None, city: "Marseille", handle: None, notable: false, crew: None },
    Dancer { name: "Spinzilla", aliases: &[], country: "DE", country2: None, city: "Berlin", handle: Some("spinzilla_bj"), notable: true, crew: Some((1, Some(2012))) },
    Dancer { name: "Flexo", aliases: &[], country: "DE", country2: None, city: "Hamburg", handle: None, notable: false, crew: Some((1, None)) },
    Dancer { name: "Bgirl Lumen", aliases: &[], country: "DE", country2: Some("PL"), city: "Berlin", handle: Some("bgirllumen_bj"), notable: false, crew: Some((1, Some(2021))) },
    Dancer { name: "Krypt", aliases: &[], country: "DE", country2: None, city: "Cologne", handle: None, notable: false, crew: None },
    Dancer { name: "Atlas", aliases: &[], country: "CH", country2: None, city: "Zurich", handle: Some("atlas_bj"), notable: true, crew: Some((2, Some(2010))) },
    Dancer { name: "Bgirl Saffron", aliases: &[], country: "CH", country2: Some("IT"), city: "Lugano", handle: None, notable: false, crew: Some((2, None)) },
    Dancer { name: "Drift", aliases: &[], country: "CH", country2: None, city: "Geneva", handle: Some("drift_bj"), notable: false, crew: None },
    Dancer { name: "Halo", aliases: &[], country: "NL", country2: None, city: "Amsterdam", handle: Some("halo_bj"), notable: true, crew: None },
    Dancer { name: "Glitch", aliases: &[], country: "NL", country2: None, city: "Rotterdam", handle: None, notable: false, crew: None },
    Dancer { name: "Sensei Kai", aliases: &["Kai", "카이"], country: "KR", country2: None, city: "Seoul", handle: Some("senseikai_bj"), notable: true, crew: Some((3, Some(2008))) },
    Dancer { name: "Bgirl Kaida", aliases: &[], country: "KR", country2: None, city: "Busan", handle: Some("bgirlkaida_bj"), notable: true, crew: Some((3, Some(2018))) },
    Dancer { name: "Vortex", aliases: &[], country: "KR", country2: None, city: "Seoul", handle: None, notable: false, crew: Some((3, None)) },
    Dancer { name: "Mako", aliases: &[], country: "KR", country2: Some("US"), city: "Seoul", handle: Some("mako_bj"), notable: false, crew: None },
    Dancer { name: "Ronin", aliases: &["ローニン"], country: "JP", country2: None, city: "Tokyo", handle: Some("ronin_bj"), notable: true, crew: Some((4, Some(2011))) },
    Dancer { name: "Bgirl Pixel", aliases: &[], country: "JP", country2: None, city: "Osaka", handle: Some("bgirlpixel_bj"), notable: true, crew: Some((4, Some(2020))) },
    Dancer { name: "Tetris", aliases: &[], country: "JP", country2: None, city: "Tokyo", handle: None, notable: false, crew: Some((4, None)) },
    Dancer { name: "Noodle", aliases: &[], country: "JP", country2: None, city: "Nagoya", handle: None, notable: false, crew: None },
    Dancer { name: "Bgirl Mira", aliases: &[], country: "TW", country2: None, city: "Taipei", handle: Some("bgirlmira_bj"), notable: false, crew: None },
    Dancer { name: "Zephyr", aliases: &[], country: "TW", country2: None, city: "Taichung", handle: None, notable: false, crew: None },
    Dancer { name: "Pharo", aliases: &[], country: "TH", country2: None, city: "Bangkok", handle: Some("pharo_bj"), notable: false, crew: None },
    Dancer { name: "Jinx", aliases: &[], country: "TH", country2: None, city: "Chiang Mai", handle: None, notable: false, crew: None },
    Dancer { name: "Echo", aliases: &[], country: "GB", country2: None, city: "London", handle: Some("echo_bj"), notable: false, crew: None },
    Dancer { name: "Toprock Tina", aliases: &["Tina"], country: "GB", country2: Some("IE"), city: "Manchester", handle: None, notable: false, crew: None },
    Dancer { name: "Rhythmic", aliases: &[], country: "US", country2: None, city: "New York", handle: Some("rhythmic_bj"), notable: true, crew: None },
    Dancer { name: "Lil Nova", aliases: &[], country: "US", country2: None, city: "Los Angeles", handle: None, notable: false, crew: None },
    Dancer { name: "DJ Krate", aliases: &[], country: "DE", country2: None, city: "Berlin", handle: None, notable: false, crew: None },
    Dancer { name: "DJ Loopa", aliases: &[], country: "NL", country2: None, city: "Rotterdam", handle: None, notable: false, crew: None },
    Dancer { name: "MC Rhyno", aliases: &[], country: "GB", country2: None, city: "London", handle: None, notable: false, crew: None },
    Dancer { name: "MC Volta", aliases: &[], country: "FR", country2: None, city: "Paris", handle: None, notable: false, crew: None },
    // Famous bboys judging or registered at the made-up upcoming jams; when `data/` has them, its rows are reused.
    Dancer { name: "Hong 10", aliases: &["Hong10"], country: "KR", country2: None, city: "Seoul", handle: None, notable: true, crew: None },
    Dancer { name: "Wing", aliases: &[], country: "KR", country2: None, city: "Seoul", handle: None, notable: true, crew: None },
    Dancer { name: "Physicx", aliases: &[], country: "KR", country2: None, city: "Seoul", handle: None, notable: true, crew: None },
    Dancer { name: "Pocket", aliases: &[], country: "KR", country2: None, city: "Seoul", handle: None, notable: true, crew: None },
    Dancer { name: "Shigekix", aliases: &[], country: "JP", country2: None, city: "Osaka", handle: None, notable: true, crew: None },
    Dancer { name: "Issei", aliases: &[], country: "JP", country2: None, city: "Fukuoka", handle: None, notable: true, crew: None },
    Dancer { name: "Taisuke", aliases: &[], country: "JP", country2: None, city: "Tokyo", handle: None, notable: true, crew: None },
    Dancer { name: "Lilou", aliases: &[], country: "FR", country2: None, city: "Lyon", handle: None, notable: true, crew: None },
    Dancer { name: "Mounir", aliases: &[], country: "FR", country2: None, city: "Paris", handle: None, notable: true, crew: None },
    Dancer { name: "Junior", aliases: &[], country: "FR", country2: None, city: "Paris", handle: None, notable: true, crew: None },
    Dancer { name: "Dany Dann", aliases: &["Dany"], country: "FR", country2: None, city: "Paris", handle: None, notable: true, crew: None },
    Dancer { name: "Menno", aliases: &[], country: "NL", country2: None, city: "Amsterdam", handle: None, notable: true, crew: None },
    Dancer { name: "Lil Zoo", aliases: &[], country: "AT", country2: Some("MA"), city: "Vienna", handle: None, notable: true, crew: None },
    Dancer { name: "Victor", aliases: &[], country: "US", country2: None, city: "Orlando", handle: None, notable: true, crew: None },
    Dancer { name: "Roxrite", aliases: &[], country: "US", country2: Some("MX"), city: "Sacramento", handle: None, notable: true, crew: None },
    Dancer { name: "Omar", aliases: &[], country: "US", country2: None, city: "Los Angeles", handle: None, notable: true, crew: None },
    Dancer { name: "Phil Wizard", aliases: &["Phil"], country: "CA", country2: None, city: "Vancouver", handle: None, notable: true, crew: None },
    Dancer { name: "Neguin", aliases: &[], country: "BR", country2: None, city: "Curitiba", handle: None, notable: true, crew: None },
    Dancer { name: "Amir", aliases: &[], country: "KZ", country2: None, city: "Almaty", handle: None, notable: true, crew: None },
    Dancer { name: "Sunni", aliases: &[], country: "GB", country2: None, city: "London", handle: None, notable: true, crew: None },
];

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    breakingjam::init_tracing();

    let url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    let password = std::env::var("SEED_PASSWORD").context("SEED_PASSWORD must be set")?;
    let options: PgConnectOptions = url.parse()?;
    // Demo jams and invented results about real dancers must never reach production. A remote
    // database (UAT) is seeded only when SEED_ALLOW_HOST names its host exactly.
    let host = options.get_host();
    let allowed = std::env::var("SEED_ALLOW_HOST").is_ok_and(|allowed| allowed == host);
    anyhow::ensure!(
        allowed || matches!(host, "localhost" | "127.0.0.1" | "::1"),
        "the seed only runs against a local database or SEED_ALLOW_HOST, not {host}"
    );
    let pool = PgPool::connect_with(options).await?;

    let seeded = sqlx::query_scalar!(
        r#"select exists(select 1 from app_users where email = $1) as "seeded!""#,
        ADMIN.email
    )
    .fetch_one(&pool)
    .await?;
    if seeded {
        tracing::info!("already seeded, nothing to do");
        return Ok(());
    }

    let mut tx = pool.begin().await?;
    insert_user(&mut tx, &ADMIN, &password).await?;
    let seed_admin = insert_user(&mut tx, &SEED_ADMIN, &password).await?;
    let organizer = insert_user(&mut tx, &ORGANIZER, &password).await?;
    let imported = import_data(&mut tx, seed_admin).await?;
    let crews = insert_crews(&mut tx).await?;
    let ids = Ids {
        dancers: insert_dancers(&mut tx, seed_admin, &crews, &imported.dancers).await?,
        crews: CREWS.iter().map(|crew| crew.name).zip(crews).collect(),
    };
    // The seed's dancers the import already wrote were reused, not written again.
    let new_dancers = ids
        .dancers
        .values()
        .filter(|id| !imported.dancers.values().any(|i| i == *id))
        .count();
    // An organiser runs the invented jams; the imported ones were entered by the team, which runs none.
    insert_events(&mut tx, organizer, EVENTS, &ids).await?;
    insert_events(&mut tx, organizer, IN_REVIEW, &ids).await?;
    tx.commit().await?;

    tracing::info!(
        events = EVENTS.len() + IN_REVIEW.len() + imported.events,
        dancers = new_dancers + imported.dancers.len(),
        crews = CREWS.len() + imported.crews,
        "seeded; log in as {}, {} or {} with SEED_PASSWORD",
        ADMIN.email,
        SEED_ADMIN.email,
        ORGANIZER.email,
    );
    Ok(())
}

/// Seeded dancers and crews by name, for the jams that refer to them.
struct Ids {
    dancers: HashMap<&'static str, Uuid>,
    crews: HashMap<&'static str, Uuid>,
}

impl Ids {
    fn dancer(&self, name: &str) -> anyhow::Result<Uuid> {
        self.dancers
            .get(name)
            .copied()
            .with_context(|| format!("no seeded dancer {name}"))
    }

    /// A confirmed entry: one dancer, or in team battles a crew with its first `team_size` dancers.
    fn entry(&self, battle: &Battle, entrant: &str) -> anyhow::Result<EntryFields> {
        let team_size = usize::try_from(battle.team_size.unwrap_or(1))?;
        let (crew_id, dancer_ids) = if team_size == 1 {
            (None, vec![self.dancer(entrant)?])
        } else {
            let crew = self
                .crews
                .get(entrant)
                .copied()
                .with_context(|| format!("no seeded crew {entrant}"))?;
            let members = DANCERS
                .iter()
                .filter(|dancer| {
                    dancer
                        .crew
                        .is_some_and(|(index, _)| CREWS[index].name == entrant)
                })
                .take(team_size)
                .map(|dancer| self.dancer(dancer.name))
                .collect::<anyhow::Result<Vec<_>>>()?;
            anyhow::ensure!(
                members.len() == team_size,
                "{entrant} has fewer than {team_size} dancers"
            );
            (Some(crew), members)
        };
        let mut fields = EntryFields {
            team_name: crew_id.map(|_| entrant.to_owned()),
            crew_id,
            dancer_ids,
            status: EntryStatus::Confirmed,
            reached: BracketStage::Na,
            final_rank: None,
            video_url: None,
            video_offset_seconds: None,
        };
        fields.normalize();
        Ok(fields)
    }
}

impl Battle {
    /// The fields the API would receive for this battle, so the domain rules check the seed.
    fn fields(&self) -> BattleFields {
        let (prize_currency, [first, second, third]) = match self.prize {
            Some((currency, amounts)) => (Some(currency.to_owned()), amounts.map(Some)),
            None => (None, [None; 3]),
        };
        BattleFields {
            name: None,
            format: self.format,
            team_size: self.team_size,
            gender: self.gender,
            age: self.age,
            age_min: None,
            age_max: (self.age == BattleAge::Kids).then_some(12),
            // The smallest bracket that fits the entrants.
            bracket_size: i16::try_from(self.entrants.len().next_power_of_two().clamp(4, 64)).ok(),
            max_entries: None,
            prize_currency,
            prize_first: first,
            prize_second: second,
            prize_third: third,
            starts_at: None,
        }
    }
}

/// The past jams of `data/` that pass `data check`, owned by the seed admin; the rest is logged.
async fn import_data(conn: &mut PgConnection, owner: Uuid) -> anyhow::Result<import::Imported> {
    let (data, unreadable) = dataset::load(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../data"));
    for error in &unreadable {
        tracing::debug!(%error, "data file left out");
    }
    let today = chrono::Utc::now().date_naive();
    let imported = import::insert_all(conn, &data, owner, today).await?;
    for why in &imported.skipped {
        tracing::debug!(why, "left out");
    }
    tracing::info!(
        jams = imported.events,
        left_out = imported.skipped.len() + unreadable.len(),
        "imported data/ (RUST_LOG=seed=debug lists what was left out and why)"
    );
    Ok(imported)
}

async fn insert_user(conn: &mut PgConnection, user: &User, password: &str) -> anyhow::Result<Uuid> {
    let id = Uuid::now_v7();
    // Hash per user: a shared hash would reveal that the accounts share a password.
    let password_hash = password::hash(password.to_owned()).await?;
    sqlx::query!(
        "insert into app_users (id, email, password_hash, display_name, role, email_verified_at)
         values ($1, $2, $3, $4, $5, now())",
        id,
        user.email,
        password_hash,
        user.display_name,
        user.role as _,
    )
    .execute(conn)
    .await?;
    Ok(id)
}

async fn insert_crews(conn: &mut PgConnection) -> sqlx::Result<Vec<Uuid>> {
    let mut ids = Vec::with_capacity(CREWS.len());
    for crew in CREWS {
        let id = Uuid::now_v7();
        sqlx::query!(
            "insert into crews (id, name, country, city) values ($1, $2, $3, $4)",
            id,
            crew.name,
            crew.country,
            crew.city,
        )
        .execute(&mut *conn)
        .await?;
        ids.push(id);
    }
    Ok(ids)
}

/// The dancers of `DANCERS`; one `data/` already wrote (by key) keeps that row.
async fn insert_dancers(
    conn: &mut PgConnection,
    created_by: Uuid,
    crews: &[Uuid],
    imported: &std::collections::BTreeMap<String, Uuid>,
) -> sqlx::Result<HashMap<&'static str, Uuid>> {
    let mut ids = HashMap::with_capacity(DANCERS.len());
    // §4: the `seed` origin implies notable; the others are ordinary organizer-created rows.
    for dancer in DANCERS {
        if let Some(id) = imported.get(&key_for(dancer.name)) {
            ids.insert(dancer.name, *id);
            continue;
        }
        let id = Uuid::now_v7();
        sqlx::query!(
            "insert into dancers
               (id, dancer_name, aliases, country, country2, city, instagram_handle, source, notable, created_by)
             values ($1, $2, $3, $4, $5, $6, $7,
                     (case when $8 then 'seed' else 'organizer' end)::dancer_source, $8, $9)",
            id,
            dancer.name,
            dancer.aliases as &[&str],
            dancer.country,
            dancer.country2,
            dancer.city,
            dancer.handle,
            dancer.notable,
            created_by,
        )
        .execute(&mut *conn)
        .await?;

        if let Some((crew, since_year)) = dancer.crew {
            sqlx::query!(
                "insert into crew_memberships (dancer_id, crew_id, since) values ($1, $2, make_date($3, 1, 1))",
                id,
                crews[crew],
                since_year,
            )
            .execute(&mut *conn)
            .await?;
        }
        ids.insert(dancer.name, id);
    }
    Ok(ids)
}

async fn insert_events(
    conn: &mut PgConnection,
    organizer: Uuid,
    events: &[Event],
    ids: &Ids,
) -> anyhow::Result<()> {
    for event in events {
        let (event_id, first_day) = insert_event(conn, organizer, event).await?;
        for &(role, name) in event.staff {
            sqlx::query!(
                "insert into event_staff (event_id, dancer_id, role) values ($1, $2, $3)",
                event_id,
                ids.dancer(name)?,
                role as StaffRole,
            )
            .execute(&mut *conn)
            .await?;
        }
        for (index, battle) in event.battles.iter().enumerate() {
            let fields = BattleFields {
                starts_at: afternoon(first_day, index, event.length_days),
                ..battle.fields()
            };
            fields.validate()?;
            let battle_id = db::battles::insert(conn, event_id, &fields.display_name(), &fields)
                .await?
                .id;
            for entrant in battle.entrants {
                let entry = ids.entry(battle, entrant)?;
                db::battles::insert_entry(conn, battle_id, fields.gender, &entry).await?;
            }
        }
    }
    Ok(())
}

/// Battles start in the afternoon: one a day on jams of several days, else 2h30 apart from 14:00.
fn afternoon(first_day: NaiveDate, index: usize, length_days: i32) -> Option<NaiveDateTime> {
    let days = usize::try_from(length_days).ok()?.max(1);
    let day = first_day.checked_add_days(Days::new(u64::try_from(index % days).ok()?))?;
    let minutes = 14 * 60 + 150 * u32::try_from(index / days).ok()?;
    day.and_hms_opt(minutes / 60, minutes % 60, 0)
}

/// Writes the jam; returns its id and first day.
async fn insert_event(
    conn: &mut PgConnection,
    organizer: Uuid,
    event: &Event,
) -> sqlx::Result<(Uuid, NaiveDate)> {
    let id = Uuid::now_v7();
    let first_day = sqlx::query_scalar!(
        "insert into events
           (id, organizer_id, name, slug, status, starts_on, ends_on, timezone, city, country, lat, lng,
            description, website_url, contact_email)
         values ($1, $2, $3, $4, $5,
                 current_date + $6::int, current_date + $6::int + $7::int - 1,
                 $8, $9, $10, $11, $12, $13, $14, $15)
         returning starts_on",
        id,
        organizer,
        event.name,
        slug(event.name, id),
        event.status as _,
        event.starts_in_days,
        event.length_days,
        event.timezone,
        event.city,
        event.country,
        event.lat,
        event.lng,
        event.about.description,
        event.about.website,
        event.about.email,
    )
    .fetch_one(conn)
    .await?;
    Ok((id, first_day))
}
