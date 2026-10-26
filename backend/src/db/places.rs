//! `places` queries: the lookup behind "Near <Place>", and the GeoNames import.

use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::place::{NewPlace, Place};

/// Below this many people, only a place's own name finds it: alternate names and prefixes of
/// small towns are mostly words a dancer or a jam is also called ("India" for Inđija).
const WEAK_MATCH_POPULATION: i32 = 50_000;

/// Shorter searches are often plain words ("jam", "kid"): they only find a big place by an exact
/// name, never by a prefix.
const MIN_LOOSE: usize = 4;

/// Half the side, in degrees (about 25 km), of the box in which a public jam makes a place the
/// one a dancer means: the French Saint-Louis of a jam, not the bigger one in Senegal.
const NEAR_JAM_DEGREES: f64 = 0.25;

/// The place a search key names: an exact name first, a place's own name before an alternate,
/// else a name starting with the key and less than twice as long; among those, one with a
/// public jam nearby, then the most populated. `key` comes from `search_key`, so it holds no
/// `%` or `_`.
pub async fn best_match(pool: &PgPool, key: &str) -> sqlx::Result<Option<Place>> {
    sqlx::query_as!(
        Place,
        r#"select p.name, p.country, p.lat, p.lng, p.population
           from place_names n join places p on p.id = n.place_id
           where (n.name = $1
                  or ($4 and n.name like $2 and char_length(n.name) < 2 * char_length($1)))
             and (p.population >= $3 or ($4 and n.own and n.name = $1))
           order by n.name = $1 desc, n.own desc,
                    exists (select 1 from events e
                            where e.deleted_at is null
                              and e.status in ('published', 'registration_closed', 'completed')
                              and abs(e.lat - p.lat) < $5 and abs(e.lng - p.lng) < $5) desc,
                    p.population desc
           limit 1"#,
        key,
        format!("{key}%"),
        WEAK_MATCH_POPULATION,
        key.chars().count() >= MIN_LOOSE,
        NEAR_JAM_DEGREES,
    )
    .fetch_optional(pool)
    .await
}

/// Rows per insert: a few thousand keeps each statement's arrays small.
const BATCH: usize = 5_000;

/// Replaces every place with `places` in one transaction, so searches see the old set until it
/// commits; returns how many names were stored.
pub async fn replace_all(pool: &PgPool, places: &[NewPlace]) -> sqlx::Result<usize> {
    let mut tx = pool.begin().await?;
    // Deleting (not truncating) leaves the old rows readable meanwhile; names go by cascade.
    sqlx::query!("delete from places").execute(&mut *tx).await?;
    let mut names = 0;
    for batch in places.chunks(BATCH) {
        let ids: Vec<Uuid> = batch.iter().map(|_| Uuid::now_v7()).collect();
        let field = |f: fn(&NewPlace) -> String| batch.iter().map(f).collect::<Vec<_>>();
        sqlx::query!(
            "insert into places (id, geonames_id, name, ascii_name, country, lat, lng, population)
             select * from unnest($1::uuid[], $2::int[], $3::text[], $4::text[], $5::text[],
                                  $6::float8[], $7::float8[], $8::int[])",
            &ids,
            &batch.iter().map(|p| p.geonames_id).collect::<Vec<_>>(),
            &field(|p| p.place.name.clone()),
            &field(|p| p.ascii_name.clone()),
            &field(|p| p.place.country.clone()),
            &batch.iter().map(|p| p.place.lat).collect::<Vec<_>>(),
            &batch.iter().map(|p| p.place.lng).collect::<Vec<_>>(),
            &batch.iter().map(|p| p.place.population).collect::<Vec<_>>(),
        )
        .execute(&mut *tx)
        .await?;
        let mut owners: Vec<Uuid> = Vec::new();
        let mut keys: Vec<&str> = Vec::new();
        let mut own: Vec<bool> = Vec::new();
        for (id, place) in ids.iter().zip(batch) {
            let tagged = (place.own_keys.iter().map(|k| (k, true)))
                .chain(place.alternate_keys.iter().map(|k| (k, false)));
            for (key, is_own) in tagged {
                owners.push(*id);
                keys.push(key);
                own.push(is_own);
            }
        }
        names += keys.len();
        sqlx::query!(
            "insert into place_names (place_id, name, own)
             select * from unnest($1::uuid[], $2::text[], $3::bool[])",
            &owners,
            &keys as &[&str],
            &own,
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(names)
}
