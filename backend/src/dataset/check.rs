//! The rules files under `data/` must follow before they can be imported.

use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
};

use super::{BattleRecord, Dataset, EventRecord, is_key, spelling};
use crate::domain::{battle::youtube_id, event::iana_timezone, upper_ascii_code};

/// What `check` found: errors block an import, warnings ask for a human look.
#[derive(Debug, Default)]
pub struct Report {
    /// Broken rules, each with what it is about.
    pub errors: Vec<Problem>,
    /// Likely mistakes, e.g. two spellings of one dancer.
    pub warnings: Vec<String>,
}

/// A broken rule; it prints as `<file>: <message>`, e.g. `dancers.toml: menno: name is blank`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    /// The dancer, crew or jam the rule is broken in.
    pub subject: Subject,
    /// What is wrong.
    pub message: String,
}

/// What a problem is about, so an import can leave out just that.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Subject {
    /// A line of `dancers.toml`, by key.
    Dancer(String),
    /// A line of `crews.toml`, by key.
    Crew(String),
    /// A jam file, by `<series>/<edition>`.
    Event(String),
}

impl fmt::Display for Problem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.subject {
            Subject::Dancer(key) => write!(f, "dancers.toml: {key}: {}", self.message),
            Subject::Crew(key) => write!(f, "crews.toml: {key}: {}", self.message),
            Subject::Event(key) => write!(f, "events/{key}.toml: {}", self.message),
        }
    }
}

/// A dancer or crew line, seen the same way by the identity rules.
struct Identity<'a> {
    key: &'a str,
    name: &'a str,
    aliases: &'a [String],
    countries: Vec<&'a str>,
}

/// Checks every rule over the whole dataset.
pub fn check(data: &Dataset) -> Report {
    let mut report = Report::default();
    check_identities(
        ("dancers.toml", Subject::Dancer),
        dancer_identities(data),
        &mut report,
    );
    check_identities(
        ("crews.toml", Subject::Crew),
        crew_identities(data),
        &mut report,
    );
    for (key, dancer) in &data.dancers {
        for crew in dancer
            .crews
            .iter()
            .filter(|crew| !data.crews.contains_key(*crew))
        {
            report.errors.push(Problem {
                subject: Subject::Dancer(key.clone()),
                message: format!("crew {crew} is not in crews.toml"),
            });
        }
    }
    for (key, event) in &data.events {
        let mut errors = Vec::new();
        check_event(data, key, event, &mut errors);
        report
            .errors
            .extend(errors.into_iter().map(|message| Problem {
                subject: Subject::Event(key.clone()),
                message,
            }));
    }
    report.warnings.extend(unused(data));
    report
}

fn dancer_identities(data: &Dataset) -> impl Iterator<Item = Identity<'_>> {
    data.dancers.iter().map(|(key, dancer)| Identity {
        key,
        name: &dancer.name,
        aliases: &dancer.aliases,
        countries: std::iter::once(&dancer.country)
            .chain(&dancer.country2)
            .map(String::as_str)
            .collect(),
    })
}

fn crew_identities(data: &Dataset) -> impl Iterator<Item = Identity<'_>> {
    data.crews.iter().map(|(key, crew)| Identity {
        key,
        name: &crew.name,
        aliases: &crew.aliases,
        countries: crew.country.iter().map(String::as_str).collect(),
    })
}

fn check_identities<'a>(
    (file, subject): (&str, fn(String) -> Subject),
    identities: impl Iterator<Item = Identity<'a>>,
    report: &mut Report,
) {
    let mut spellings: BTreeMap<String, BTreeSet<(&str, &str)>> = BTreeMap::new();
    for identity in identities {
        let mut fail = |message: String| {
            report.errors.push(Problem {
                subject: subject(identity.key.to_owned()),
                message,
            })
        };
        if !is_key(identity.key) {
            fail("key must be lower-case words joined by -".into());
        }
        if identity.name.trim().is_empty() {
            fail("name is blank".into());
        }
        for country in identity
            .countries
            .iter()
            .filter(|c| !upper_ascii_code(c, 2))
        {
            fail(format!(
                "country {country:?} is not an ISO 3166-1 alpha-2 code"
            ));
        }
        for name in
            std::iter::once(identity.name).chain(identity.aliases.iter().map(String::as_str))
        {
            // A trailing s too: `Formless Corp` and `Formless Corps` are one crew.
            spellings
                .entry(spelling(name).trim_end_matches('s').to_owned())
                .or_default()
                .insert((identity.key, identity.name));
        }
    }
    // Two keys with one exact name were split on purpose (homonyms); only near-spellings warn.
    report
        .warnings
        .extend(spellings.into_values().filter_map(|entries| {
            let names: BTreeSet<&str> = entries.iter().map(|(_, name)| *name).collect();
            let keys: Vec<&str> = entries.iter().map(|(key, _)| *key).collect();
            (names.len() > 1).then(|| format!("{file}: {keys:?} are spelled alike; the same one?"))
        }));
}

fn check_event(data: &Dataset, key: &str, event: &EventRecord, errors: &mut Vec<String>) {
    let (series, edition) = key.split_once('/').unwrap_or((key, ""));
    if !data.series.contains_key(series) {
        errors.push(format!("no series/{series}.toml"));
    }
    if !is_key(edition) {
        errors.push("file name must be lower-case words joined by -".into());
    }
    check_event_fields(event, errors);
    for (role, keys) in [
        ("judge", &event.judges),
        ("mc", &event.mcs),
        ("dj", &event.djs),
    ] {
        errors.extend(unknown_dancers(data, keys.iter().map(String::as_str), role));
    }
    let mut battle_keys = BTreeSet::new();
    for battle in &event.battles {
        if !battle_keys.insert(&battle.key) {
            errors.push(format!("battle key {} is used twice", battle.key));
        }
        let mut battle_errors = Vec::new();
        check_battle(data, battle, &mut battle_errors);
        errors.extend(
            battle_errors
                .into_iter()
                .map(|e| format!("battle {}: {e}", battle.key)),
        );
    }
}

/// The jam's own fields: names, codes, dates and coordinates.
fn check_event_fields(event: &EventRecord, errors: &mut Vec<String>) {
    if event.name.trim().is_empty() || event.city.trim().is_empty() {
        errors.push("name and city must not be blank".into());
    }
    if !upper_ascii_code(&event.country, 2) {
        errors.push(format!(
            "country {:?} is not an ISO 3166-1 alpha-2 code",
            event.country
        ));
    }
    if iana_timezone(&event.timezone).is_err() {
        errors.push(format!(
            "timezone {:?} is not an IANA timezone",
            event.timezone
        ));
    }
    if event
        .ends_on
        .is_some_and(|ends_on| ends_on < event.starts_on)
    {
        errors.push("ends_on is before starts_on".into());
    }
    match (event.lat, event.lng) {
        (Some(lat), Some(lng)) => {
            if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lng) {
                errors.push("lat or lng is out of range".into());
            }
        }
        (None, None) => {}
        _ => errors.push("lat and lng must be set together".into()),
    }
}

fn check_battle(data: &Dataset, battle: &BattleRecord, errors: &mut Vec<String>) {
    if !is_key(&battle.key) {
        errors.push("key must be lower-case words joined by -".into());
    }
    if battle.name.trim().is_empty() {
        errors.push("name is blank".into());
    }
    let videos = battle
        .matches
        .iter()
        .map(|m| &m.video)
        .chain(battle.results.iter().map(|r| &r.video));
    for video in videos.flatten().filter(|video| youtube_id(video).is_none()) {
        errors.push(format!("{video} is not a YouTube link"));
    }
    check_teams(data, battle, errors);
    let standings = match battle.standings() {
        Ok(standings) => standings,
        Err(rules) => return errors.extend(rules),
    };
    let entrants: Vec<&str> = standings.iter().map(|s| s.entrant).collect();
    if !battle.is_team_battle() {
        errors.extend(unknown_dancers(data, entrants.iter().copied(), "entrant"));
    } else {
        for entrant in entrants.iter().filter(|e| !battle.teams.contains_key(**e)) {
            errors.push(format!("entrant {entrant} is not in this battle's teams"));
        }
        for team in battle
            .teams
            .keys()
            .filter(|team| !entrants.contains(&team.as_str()))
        {
            errors.push(format!("team {team} plays no match"));
        }
    }
    let mut seen = BTreeSet::new();
    for entrant in entrants.iter().filter(|entrant| !seen.insert(**entrant)) {
        errors.push(format!("{entrant} is entered twice"));
    }
}

/// Team battles name their sides in `teams`; a dancer plays for one team at most.
fn check_teams(data: &Dataset, battle: &BattleRecord, errors: &mut Vec<String>) {
    if battle.team_size == Some(0) {
        errors.push("team_size must be at least 1".into());
    }
    let mut members_seen = BTreeSet::new();
    for (key, team) in &battle.teams {
        if !is_key(key) {
            errors.push(format!(
                "team key {key} must be lower-case words joined by -"
            ));
        }
        if team
            .name
            .as_deref()
            .is_none_or(|name| name.trim().is_empty())
            && team.crew.is_none()
            && team.members.is_empty()
        {
            errors.push(format!("team {key} needs a name, a crew or members"));
        }
        if let Some(size) = battle
            .team_size
            .filter(|size| team.members.len() > usize::from(*size))
        {
            errors.push(format!(
                "team {key} has {} members for a team_size of {size}",
                team.members.len()
            ));
        }
        if let Some(crew) = team
            .crew
            .as_ref()
            .filter(|crew| !data.crews.contains_key(*crew))
        {
            errors.push(format!("team {key}: crew {crew} is not in crews.toml"));
        }
        errors.extend(unknown_dancers(
            data,
            team.members.iter().map(String::as_str),
            "member",
        ));
        for member in team
            .members
            .iter()
            .filter(|member| !members_seen.insert(*member))
        {
            errors.push(format!("{member} plays for two teams"));
        }
    }
}

fn unknown_dancers<'a>(
    data: &Dataset,
    keys: impl Iterator<Item = &'a str>,
    role: &str,
) -> Vec<String> {
    keys.filter(|key| !data.dancers.contains_key(*key))
        .map(|key| format!("{role} {key} is not in dancers.toml"))
        .collect()
}

/// Dancers and crews no jam refers to: usually leftovers after merging two spellings.
fn unused(data: &Dataset) -> Vec<String> {
    let mut dancers: BTreeSet<&str> = BTreeSet::new();
    let mut crews: BTreeSet<&str> = data
        .dancers
        .values()
        .flat_map(|d| d.crews.iter().map(String::as_str))
        .collect();
    for event in data.events.values() {
        dancers.extend(
            event
                .judges
                .iter()
                .chain(&event.mcs)
                .chain(&event.djs)
                .map(String::as_str),
        );
        for battle in &event.battles {
            for team in battle.teams.values() {
                dancers.extend(team.members.iter().map(String::as_str));
                crews.extend(team.crew.as_deref());
            }
            if !battle.is_team_battle() {
                dancers.extend(
                    battle
                        .matches
                        .iter()
                        .flat_map(|m| [m.a.as_str(), m.b.as_str()]),
                );
                dancers.extend(battle.results.iter().map(|r| r.entrant.as_str()));
            }
        }
    }
    let dancers = data
        .dancers
        .keys()
        .filter(|key| !dancers.contains(key.as_str()));
    let crews = data
        .crews
        .keys()
        .filter(|key| !crews.contains(key.as_str()));
    dancers
        .map(|key| format!("dancers.toml: {key} is in no jam"))
        .chain(crews.map(|key| format!("crews.toml: {key} is in no jam and no dancer's crews")))
        .collect()
}
