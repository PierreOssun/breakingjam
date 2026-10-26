//! The curated data under `data/` (series, jams, battles, dancers): loading it and deriving results.

pub mod check;
pub mod draft;
pub mod import;
pub mod wikipedia;
pub mod wikitext;
pub mod youtube;

use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};

use crate::domain::{
    battle::{BattleAge, BattleFormat, BattleGender, BracketStage},
    fold,
};
use chrono::NaiveDate;
use serde::{Deserialize, Deserializer, de::Error as _};
use thiserror::Error;

/// Every file under `data/`, parsed; the keys are the stable ids the import will use.
#[derive(Debug, Default)]
pub struct Dataset {
    /// `data/dancers.toml`, by dancer key.
    pub dancers: BTreeMap<String, DancerRecord>,
    /// `data/crews.toml`, by crew key.
    pub crews: BTreeMap<String, CrewRecord>,
    /// `data/series/<series>.toml`, by series key.
    pub series: BTreeMap<String, SeriesRecord>,
    /// `data/events/<series>/<edition>.toml`, keyed `<series>/<edition>`.
    pub events: BTreeMap<String, EventRecord>,
}

/// One line of `dancers.toml`.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DancerRecord {
    /// Name as shown.
    pub name: String,
    /// ISO 3166-1 alpha-2.
    pub country: String,
    /// Second country, for dancers who represent two.
    pub country2: Option<String>,
    /// Other spellings, used to link dancers already in the database.
    #[serde(default)]
    pub aliases: Vec<String>,
    /// Crew keys; a dancer may be in none, one or several.
    #[serde(default)]
    pub crews: Vec<String>,
    /// `bboy` or `bgirl`: the avatar's look, before any battle suggests one.
    pub look: Option<BattleGender>,
}

/// One line of `crews.toml`.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CrewRecord {
    /// Name as shown.
    pub name: String,
    /// ISO 3166-1 alpha-2, when the crew has a home country.
    pub country: Option<String>,
    /// Other spellings, used to link crews already in the database.
    #[serde(default)]
    pub aliases: Vec<String>,
}

/// A recurring jam, e.g. Red Bull BC One World Final.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SeriesRecord {
    /// Jam name without the edition; each edition's name adds its year.
    pub name: String,
    /// Wikipedia page the editions are drafted from, and how it names battles.
    pub wikipedia: Option<wikipedia::Source>,
    /// YouTube channels whose battle videos the editions are drafted from.
    pub youtube: Option<youtube::Source>,
    /// City of every edition, for series that don't travel; drafts start from it.
    pub city: Option<String>,
    /// ISO 3166-1 alpha-2 of `city`.
    pub country: Option<String>,
    /// IANA timezone of `city`.
    pub timezone: Option<String>,
}

/// One edition of a series: a jam.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EventRecord {
    /// Jam name.
    pub name: String,
    /// First day.
    #[serde(deserialize_with = "date")]
    pub starts_on: NaiveDate,
    /// Last day; `starts_on` when absent.
    #[serde(default, deserialize_with = "optional_date")]
    pub ends_on: Option<NaiveDate>,
    /// IANA timezone.
    pub timezone: String,
    /// Venue name.
    pub venue: Option<String>,
    /// City.
    pub city: String,
    /// ISO 3166-1 alpha-2.
    pub country: String,
    /// Latitude of the venue, or of the city when the venue is unknown; puts the jam on the map.
    pub lat: Option<f64>,
    /// Longitude, set together with `lat`.
    pub lng: Option<f64>,
    /// Where the facts come from, for whoever checks them.
    #[serde(default)]
    pub sources: Vec<String>,
    /// Dancer keys of the judges.
    #[serde(default)]
    pub judges: Vec<String>,
    /// Dancer keys of the MCs.
    #[serde(default)]
    pub mcs: Vec<String>,
    /// Dancer keys of the DJs.
    #[serde(default)]
    pub djs: Vec<String>,
    /// The jam's battles, in display order.
    #[serde(default)]
    pub battles: Vec<BattleRecord>,
}

/// A battle with its bracket (`matches`) or, when the bracket is unknown, its `results`.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BattleRecord {
    /// Unique within the jam, e.g. `bboy`.
    pub key: String,
    /// Battle name, e.g. `1v1 Bboy`.
    pub name: String,
    /// Who may enter.
    pub gender: BattleGender,
    /// Age category; open to all when absent.
    pub age: Option<BattleAge>,
    /// How it is run, when not a bracket of teams or dancers, e.g. `seven_to_smoke`.
    pub format: Option<BattleFormat>,
    /// Dancers per side, when fixed; crew battles may leave it out.
    pub team_size: Option<u8>,
    /// Entrants in the first bracket round.
    pub bracket_size: Option<u16>,
    /// The sides of a team battle, by a key unique within the battle.
    #[serde(default)]
    pub teams: BTreeMap<String, TeamRecord>,
    /// Every match of the bracket.
    #[serde(default)]
    pub matches: Vec<MatchRecord>,
    /// Final standings, for battles whose matches are unknown.
    #[serde(default)]
    pub results: Vec<ResultRecord>,
}

/// One side of a team battle: a crew, a named team, its members, or any of these together.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TeamRecord {
    /// Team name when it isn't the crew's, e.g. `Dynamo`.
    pub name: Option<String>,
    /// Crew key of the crew the team represents.
    pub crew: Option<String>,
    /// Dancer keys, when known.
    #[serde(default)]
    pub members: Vec<String>,
}

/// One battle between two entrants: dancer keys in a 1v1, team keys otherwise.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MatchRecord {
    /// Bracket round.
    pub round: Round,
    /// Entrant key.
    pub a: String,
    /// Entrant key.
    pub b: String,
    /// Entrant key of the winner, `a` or `b`.
    pub winner: String,
    /// Judge votes for `a` and `b`.
    pub votes: Option<[u8; 2]>,
    /// YouTube URL of the match.
    pub video: Option<String>,
    /// Seconds into `video` where the match starts.
    pub at: Option<u32>,
}

/// Where an entrant finished, for battles without matches.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResultRecord {
    /// Entrant key.
    pub entrant: String,
    /// Furthest stage reached.
    pub reached: BracketStage,
    /// Exact placement; follows from `reached` for the winner and the finalist.
    pub rank: Option<i32>,
    /// YouTube URL of the entrant's last match.
    pub video: Option<String>,
    /// Seconds into `video` where the match starts.
    pub at: Option<u32>,
}

/// A bracket round, named by how many dancers it starts with; `Third` is the small final.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Round {
    Top64,
    Top32,
    Top16,
    Top8,
    Top4,
    Final,
    Third,
}

/// The rounds of a full bracket, in the order winners advance: semi-final winners play the final, not the small final.
pub(super) const ROUNDS: [Round; 6] = [
    Round::Top64,
    Round::Top32,
    Round::Top16,
    Round::Top8,
    Round::Top4,
    Round::Final,
];

impl Round {
    /// Dancers at the start of the round.
    pub fn players(self) -> u16 {
        match self {
            Self::Top64 => 64,
            Self::Top32 => 32,
            Self::Top16 => 16,
            Self::Top8 => 8,
            Self::Top4 | Self::Third => 4,
            Self::Final => 2,
        }
    }

    /// The rounds of a bracket that starts with `size` dancers, `None` unless a power of two.
    pub fn bracket(size: u16) -> Option<Vec<Self>> {
        ROUNDS
            .iter()
            .position(|round| round.players() == size)
            .map(|first| ROUNDS[first..].to_vec())
    }

    /// The name used in the files.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Top64 => "top64",
            Self::Top32 => "top32",
            Self::Top16 => "top16",
            Self::Top8 => "top8",
            Self::Top4 => "top4",
            Self::Final => "final",
            Self::Third => "third",
        }
    }

    fn stage(self) -> BracketStage {
        match self {
            Self::Top64 => BracketStage::Top64,
            Self::Top32 => BracketStage::Top32,
            Self::Top16 => BracketStage::Top16,
            Self::Top8 => BracketStage::Top8,
            Self::Top4 | Self::Third => BracketStage::Top4,
            Self::Final => BracketStage::Top2,
        }
    }
}

/// Where one entrant finished in a battle, with the video of their last match.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Standing<'a> {
    /// Entrant key.
    pub entrant: &'a str,
    /// Furthest stage reached.
    pub reached: BracketStage,
    /// Exact placement, when known.
    pub rank: Option<i32>,
    /// YouTube URL of the dancer's last match.
    pub video: Option<&'a str>,
    /// Seconds into `video`.
    pub at: Option<u32>,
}

impl BattleRecord {
    /// Whether entrants are `teams` keys (a team size above 1, or teams listed) rather than dancer keys.
    pub fn is_team_battle(&self) -> bool {
        self.team_size.is_some_and(|size| size > 1) || !self.teams.is_empty()
    }

    /// Every entrant's result, derived from the bracket; the messages say why it doesn't hold.
    pub fn standings(&self) -> Result<Vec<Standing<'_>>, Vec<String>> {
        match (self.matches.is_empty(), self.results.is_empty()) {
            (false, false) => Err(vec!["has both matches and results; keep one".into()]),
            (true, false) => Ok(self.results.iter().map(ResultRecord::standing).collect()),
            _ => self.bracket_standings(),
        }
    }

    fn bracket_standings(&self) -> Result<Vec<Standing<'_>>, Vec<String>> {
        let size = self
            .bracket_size
            .ok_or_else(|| vec!["matches need a bracket_size".into()])?;
        let rounds = Round::bracket(size)
            .ok_or_else(|| vec![format!("bracket_size {size} is not 2, 4, 8, 16, 32 or 64")])?;
        let mut errors: Vec<String> = self
            .matches
            .iter()
            .filter(|m| m.round != Round::Third && !rounds.contains(&m.round))
            .map(|m| {
                format!(
                    "{} match {} vs {} is outside a top {size}",
                    m.round.as_str(),
                    m.a,
                    m.b
                )
            })
            .collect();
        let mut standings = Vec::new();
        let mut players: Option<BTreeSet<&str>> = None;
        for round in rounds {
            let matches: Vec<&MatchRecord> =
                self.matches.iter().filter(|m| m.round == round).collect();
            let winners = play_round(round, &matches, players.as_ref(), &mut errors);
            standings.extend(matches.iter().map(|m| m.loser_standing()));
            players = Some(winners);
        }
        if let Some(last) = self.matches.iter().find(|m| m.round == Round::Final) {
            standings.push(last.winner_standing());
        }
        self.third_place(&mut standings, &mut errors);
        if errors.is_empty() {
            Ok(standings)
        } else {
            Err(errors)
        }
    }

    /// The small final ranks its players 3rd and 4th instead of sharing top 4.
    fn third_place<'a>(&'a self, standings: &mut [Standing<'a>], errors: &mut Vec<String>) {
        let thirds: Vec<&MatchRecord> = self
            .matches
            .iter()
            .filter(|m| m.round == Round::Third)
            .collect();
        let [third] = thirds[..] else {
            if thirds.len() > 1 {
                errors.push("more than one third-place match".into());
            }
            return;
        };
        for (entrant, rank) in [(third.winner.as_str(), 3), (third.loser(), 4)] {
            match standings
                .iter_mut()
                .find(|s| s.entrant == entrant && s.reached == BracketStage::Top4)
            {
                Some(standing) => {
                    standing.rank = Some(rank);
                    standing.video = third.video.as_deref();
                    standing.at = third.at;
                }
                None => errors.push(format!(
                    "third-place player {entrant} didn't lose a semi-final"
                )),
            }
        }
    }
}

/// Checks one round against the previous one's winners and returns this round's winners.
fn play_round<'a>(
    round: Round,
    matches: &[&'a MatchRecord],
    expected: Option<&BTreeSet<&str>>,
    errors: &mut Vec<String>,
) -> BTreeSet<&'a str> {
    let name = round.as_str();
    let wanted = usize::from(round.players() / 2);
    if matches.len() != wanted {
        errors.push(format!(
            "{name} has {} matches, a full bracket has {wanted}",
            matches.len()
        ));
    }
    let mut players = BTreeSet::new();
    for m in matches {
        if m.a == m.b {
            errors.push(format!("{name}: {} battles themself", m.a));
        }
        if m.winner != m.a && m.winner != m.b {
            errors.push(format!(
                "{name}: winner {} is not in {} vs {}",
                m.winner, m.a, m.b
            ));
        }
        for entrant in [m.a.as_str(), m.b.as_str()] {
            if !players.insert(entrant) {
                errors.push(format!("{name}: {entrant} plays twice"));
            }
        }
    }
    if let Some(expected) = expected.filter(|expected| **expected != players) {
        let missing: Vec<&&str> = expected.difference(&players).collect();
        let extra: Vec<&&str> = players.difference(expected).collect();
        errors.push(format!(
            "{name}: previous winners missing {missing:?}, unexpected {extra:?}"
        ));
    }
    matches.iter().map(|m| m.winner.as_str()).collect()
}

impl MatchRecord {
    fn loser(&self) -> &str {
        if self.winner == self.a {
            &self.b
        } else {
            &self.a
        }
    }

    fn loser_standing(&self) -> Standing<'_> {
        Standing {
            entrant: self.loser(),
            reached: self.round.stage(),
            rank: (self.round == Round::Final).then_some(2),
            video: self.video.as_deref(),
            at: self.at,
        }
    }

    fn winner_standing(&self) -> Standing<'_> {
        Standing {
            entrant: &self.winner,
            reached: BracketStage::Winner,
            rank: Some(1),
            video: self.video.as_deref(),
            at: self.at,
        }
    }
}

impl ResultRecord {
    fn standing(&self) -> Standing<'_> {
        let implied = match self.reached {
            BracketStage::Winner => Some(1),
            BracketStage::Top2 => Some(2),
            _ => None,
        };
        Standing {
            entrant: &self.entrant,
            reached: self.reached,
            rank: self.rank.or(implied),
            video: self.video.as_deref(),
            at: self.at,
        }
    }
}

/// A TOML date (`2019-11-09`, unquoted), which serde can't read as a `NaiveDate` directly.
fn date<'de, D: Deserializer<'de>>(deserializer: D) -> Result<NaiveDate, D::Error> {
    let value = toml::value::Datetime::deserialize(deserializer)?;
    value
        .date
        .filter(|_| value.time.is_none())
        .and_then(|d| NaiveDate::from_ymd_opt(d.year.into(), d.month.into(), d.day.into()))
        .ok_or_else(|| D::Error::custom("must be a date like 2019-11-09"))
}

fn optional_date<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<NaiveDate>, D::Error> {
    date(deserializer).map(Some)
}

/// Why `data/` could not be read.
#[derive(Debug, Error)]
pub enum LoadError {
    /// A file or directory could not be read.
    #[error("{0}: {1}")]
    Io(PathBuf, std::io::Error),
    /// A file is not valid TOML for its kind.
    #[error("{0}: {1}")]
    Toml(PathBuf, toml::de::Error),
}

/// Reads `dancers.toml`, `crews.toml`, `series/*.toml` and `events/*/*.toml` under `dir`: every file
/// that can be read, and why the others can't.
pub fn load(dir: &Path) -> (Dataset, Vec<LoadError>) {
    let errors = &mut Vec::new();
    let mut data = Dataset {
        dancers: keep(read_toml(&dir.join("dancers.toml")), errors).unwrap_or_default(),
        crews: keep(read_toml(&dir.join("crews.toml")), errors).unwrap_or_default(),
        ..Dataset::default()
    };
    for path in keep(toml_files(&dir.join("series")), errors).unwrap_or_default() {
        if let Some(series) = keep(read_toml(&path), errors) {
            data.series.insert(stem(&path), series);
        }
    }
    for series in keep(subdirectories(&dir.join("events")), errors).unwrap_or_default() {
        for path in keep(toml_files(&series), errors).unwrap_or_default() {
            if let Some(event) = keep(read_toml(&path), errors) {
                data.events
                    .insert(format!("{}/{}", stem(&series), stem(&path)), event);
            }
        }
    }
    (data, std::mem::take(errors))
}

/// The value, or `None` with the error set aside, so one bad file doesn't hide the others.
fn keep<T>(result: Result<T, LoadError>, errors: &mut Vec<LoadError>) -> Option<T> {
    result.map_err(|e| errors.push(e)).ok()
}

fn read_toml<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, LoadError> {
    let text = fs::read_to_string(path).map_err(|e| LoadError::Io(path.into(), e))?;
    toml::from_str(&text).map_err(|e| LoadError::Toml(path.into(), e))
}

fn entries(dir: &Path) -> Result<Vec<PathBuf>, LoadError> {
    let io = |e| LoadError::Io(dir.into(), e);
    let mut paths = fs::read_dir(dir)
        .map_err(io)?
        .map(|entry| entry.map(|entry| entry.path()).map_err(io))
        .collect::<Result<Vec<_>, _>>()?;
    paths.sort();
    Ok(paths)
}

fn toml_files(dir: &Path) -> Result<Vec<PathBuf>, LoadError> {
    let mut paths = entries(dir)?;
    paths.retain(|path| path.extension().is_some_and(|ext| ext == "toml"));
    Ok(paths)
}

fn subdirectories(dir: &Path) -> Result<Vec<PathBuf>, LoadError> {
    let mut paths = entries(dir)?;
    paths.retain(|path| path.is_dir());
    Ok(paths)
}

fn stem(path: &Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// The key a name gets: lower-case ASCII words joined by `-`, e.g. `Sébastien Kim` → `sebastien-kim`.
pub fn key_for(name: &str) -> String {
    fold(name)
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// Whether `key` looks like `key_for` output.
pub fn is_key(key: &str) -> bool {
    !key.is_empty()
        && key.split('-').all(|word| {
            !word.is_empty()
                && word
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        })
}

/// A name reduced to compare spellings: `Hong 10`, `Hong10` and `hong-10` all give `hong10`.
pub fn spelling(name: &str) -> String {
    fold(name)
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .collect()
}
