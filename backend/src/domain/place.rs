//! Places: the GeoNames cities a search can name, and the folded keys they are found by.

use std::collections::BTreeSet;

use serde::Serialize;

use super::fold;

/// A city that "Near <Place>" centres on.
#[derive(Debug, Clone, PartialEq, Serialize, utoipa::ToSchema)]
pub struct Place {
    /// As GeoNames writes it, e.g. "Zürich".
    pub name: String,
    /// ISO 3166-1 alpha-2.
    pub country: String,
    /// Latitude.
    pub lat: f64,
    /// Longitude.
    pub lng: f64,
    /// Inhabitants; ranks places that share a name.
    pub population: i32,
}

/// One city of the GeoNames file, with every key it answers to.
#[derive(Debug, Clone, PartialEq)]
pub struct NewPlace {
    /// GeoNames' own id.
    pub geonames_id: i32,
    /// The place as `GET /places` returns it.
    pub place: Place,
    /// Its name in ASCII, e.g. "Zurich".
    pub ascii_name: String,
    /// Search keys of its name and ASCII name.
    pub own_keys: Vec<String>,
    /// Search keys of its alternate names that aren't own keys; codes and short ones left out.
    pub alternate_keys: Vec<String>,
}

/// How names are compared: folded (lower case, no accents), each run of other characters one
/// space, so "Saint-Louis" and "saint louis" meet.
pub fn search_key(text: &str) -> String {
    fold(text)
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// A line of `data/places/cities15000.tsv`: id, name, ASCII name, alternate names (comma
/// separated), country, latitude, longitude, population. `None` when it isn't one.
pub fn parse_geonames_line(line: &str) -> Option<NewPlace> {
    let mut fields = line.split('\t');
    let mut next = || fields.next();
    let (id, name, ascii, alternates) = (next()?, next()?, next()?, next()?);
    let (country, lat, lng, population) = (next()?, next()?, next()?, next()?);
    if country.len() != 2 {
        return None;
    }
    let own: BTreeSet<String> = [name, ascii]
        .into_iter()
        .map(search_key)
        .filter(|key| !key.is_empty())
        .collect();
    let alternate: BTreeSet<String> = alternates
        .split(',')
        .filter(|alternate| !is_code(alternate))
        .map(search_key)
        // Scripts like Chinese write whole city names in two characters: the minimum is for ASCII.
        .filter(|key| (!key.is_ascii() || key.len() >= MIN_ALTERNATE) && !own.contains(key))
        .collect();
    Some(NewPlace {
        geonames_id: id.parse().ok()?,
        place: Place {
            name: name.to_owned(),
            country: country.to_owned(),
            lat: lat.parse().ok()?,
            lng: lng.parse().ok()?,
            population: population.parse().ok()?,
        },
        ascii_name: ascii.to_owned(),
        own_keys: own.into_iter().collect(),
        alternate_keys: alternate.into_iter().collect(),
    })
}

/// Shorter alternate names are mostly abbreviations that collide with words ("Lil" for Lille).
const MIN_ALTERNATE: usize = 4;

/// An airport or postal code among the alternate names, like "MLH" or "ZRH", not a name: any
/// digit, or at most 4 letters, all ASCII capitals.
fn is_code(alternate: &str) -> bool {
    let letters: Vec<char> = alternate.chars().filter(|c| c.is_alphabetic()).collect();
    alternate.chars().any(|c| c.is_ascii_digit())
        || (letters.len() <= 4 && letters.iter().all(char::is_ascii_uppercase))
}
