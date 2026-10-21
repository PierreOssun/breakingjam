//! Drafts `data/` files from YouTube channels' battle videos: one title per match, e.g.
//! `Alvin & Grom (Formless Corp) vs Holy Rain & Saturn [semi] // stance x DPC Jam 2025`.

use std::collections::{BTreeMap, BTreeSet};

use chrono::{Datelike, NaiveDate, Weekday};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use super::{
    ROUNDS, Round, SeriesRecord,
    draft::{BattleSpec, Draft, DraftMatch, Member, Side, quoted},
    spelling,
    wikitext::country_code,
};

/// Where a series' battle videos are and how their titles name battles; `[youtube]` in the series file.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Source {
    /// Channel ids, `UC…`: the channels that filmed the series.
    pub channels: Vec<String>,
    /// What a title must contain to belong to the series, spacing and case aside, e.g. `DPC Jam`.
    pub title: String,
    /// Words that rule a title out, e.g. other events of the same name or other dance styles.
    #[serde(default)]
    pub exclude: Vec<String>,
    /// Phrases removed from every title before it is read, e.g. a channel's signature `BBoy World`.
    #[serde(default)]
    pub ignore: Vec<String>,
    /// The battles, in the order their `words` are tried. A title naming none goes where its entrants
    /// play, else to the battle without words, else to the first.
    pub battles: Vec<BattleSpec>,
}

/// One upload, as cached in `data/.cache/youtube/<channel>.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Video {
    /// Video id.
    pub id: String,
    /// Title.
    pub title: String,
    /// Publication day, `YYYY-MM-DD`.
    pub published: String,
}

/// Why the channel could not be listed.
#[derive(Debug, Error)]
pub enum FetchError {
    /// The request failed.
    #[error("YouTube request failed: {0}")]
    Http(#[from] reqwest::Error),
    /// YouTube answered something unexpected, e.g. an invalid key.
    #[error("YouTube answered: {0}")]
    Api(String),
}

#[derive(Deserialize)]
struct Page<T> {
    items: Vec<T>,
    #[serde(rename = "nextPageToken")]
    next: Option<String>,
}

/// Every upload of `channel`, newest first: 1 quota unit per 50 videos.
pub async fn fetch(channel: &str, api_key: &str) -> Result<Vec<Video>, FetchError> {
    let client = reqwest::Client::new();
    let channels: Page<serde_json::Value> = get(
        &client,
        "channels",
        &[("part", "contentDetails"), ("id", channel)],
        api_key,
    )
    .await?;
    let uploads = channels
        .items
        .first()
        .and_then(|c| c["contentDetails"]["relatedPlaylists"]["uploads"].as_str())
        .ok_or_else(|| FetchError::Api(format!("no channel {channel}")))?
        .to_owned();
    let mut videos = Vec::new();
    let mut token = String::new();
    loop {
        let query = [
            ("part", "snippet"),
            ("playlistId", &uploads),
            ("maxResults", "50"),
            ("pageToken", &token),
        ];
        let page: Page<serde_json::Value> = get(&client, "playlistItems", &query, api_key).await?;
        videos.extend(page.items.iter().filter_map(|item| {
            let snippet = &item["snippet"];
            Some(Video {
                id: snippet["resourceId"]["videoId"].as_str()?.to_owned(),
                title: snippet["title"].as_str()?.to_owned(),
                published: snippet["publishedAt"].as_str()?.get(..10)?.to_owned(),
            })
        }));
        match page.next {
            Some(next) => token = next,
            None => return Ok(videos),
        }
    }
}

async fn get<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    resource: &str,
    query: &[(&str, &str)],
    api_key: &str,
) -> Result<T, FetchError> {
    let url = format!("https://www.googleapis.com/youtube/v3/{resource}");
    let response = client
        .get(url)
        .query(query)
        .query(&[("key", api_key)])
        .send()
        .await?;
    let status = response.status();
    let body = response.text().await?;
    if !status.is_success() {
        return Err(FetchError::Api(format!("{status}: {body}")));
    }
    serde_json::from_str(&body).map_err(|e| FetchError::Api(e.to_string()))
}

/// A match video.
#[derive(Debug)]
struct Game<'a> {
    battle: Option<usize>,
    round: Round,
    sides: [Side; 2],
    video: &'a Video,
}

/// What one edition's titles say.
#[derive(Debug, Default)]
struct Edition<'a> {
    games: Vec<Game<'a>>,
    judges: Vec<String>,
    /// Titles announcing a winner, e.g. `congrats to Grom & Alvin for winning`.
    wins: Vec<&'a str>,
    /// `A vs B` titles that name no round.
    unread: Vec<&'a str>,
}

/// Drafts one event file per year the titles mention.
pub fn draft(videos: &[Video], series: &SeriesRecord, source: &Source) -> Draft {
    let mut editions: BTreeMap<String, Edition> = BTreeMap::new();
    let wanted = spelling(&source.title);
    let excluded = |video: &&Video| {
        let lower = video.title.to_lowercase();
        source
            .exclude
            .iter()
            .any(|word| lower.contains(&word.to_lowercase()))
    };
    for video in videos
        .iter()
        .filter(|v| spelling(&v.title).contains(&wanted))
        .filter(|v| !excluded(v))
    {
        classify(video, source, editions.entry(year_of(video)).or_default());
    }
    let mut draft = Draft::default();
    for (year, edition) in editions {
        for title in &edition.unread {
            draft.problems.push(format!(
                "{year}: no round in {title:?}; add that match by hand"
            ));
        }
        if edition.games.is_empty() {
            draft.problems.push(format!(
                "{year}: no battle videos; skipped. Winner titles: {:?}",
                edition.wins
            ));
            continue;
        }
        let toml = draft_edition(&mut draft, &year, edition, (series, source));
        draft.events.push((year, toml));
    }
    draft
}

fn year_of(video: &Video) -> String {
    video
        .title
        .split(|c: char| !c.is_ascii_digit())
        .rfind(|w| w.len() == 4 && (w.starts_with("19") || w.starts_with("20")))
        .unwrap_or(&video.published[..4])
        .to_owned()
}

/// Files a title as a match, a judges list or a winner announcement; anything else is skipped.
fn classify<'a>(video: &'a Video, source: &Source, edition: &mut Edition<'a>) {
    let cleaned = without(&video.title, &source.ignore);
    let title = shouting_to_title_case(&cleaned);
    let lower = cleaned.to_lowercase();
    let Some((vs_segment, round)) = vs_segment(&title) else {
        if lower.contains("judge") {
            edition.judges.extend(people_segment(&title));
        } else if lower.contains("win") || lower.contains("champion") {
            edition.wins.push(&video.title);
        }
        return;
    };
    let (Some((a, b)), Some(round)) = (split_vs(&vs_segment), round) else {
        return edition.unread.push(&video.title);
    };
    edition.games.push(Game {
        battle: battle_named(&lower, source),
        round,
        sides: [side(a), side(b)],
        video,
    });
}

/// The part of the title holding `A vs B`, with the round it names, if any.
fn vs_segment(title: &str) -> Option<(String, Option<Round>)> {
    let round = round_in(&title.to_lowercase());
    let segment = parts(title).find(|s| split_vs(s).is_some())?;
    let mut segment = remove_tags(segment);
    // Some titles append the round bare: `… [japan] final`.
    // ASCII lower-casing keeps byte offsets, so positions found in it hold in `segment`.
    for (phrase, _) in ROUND_WORDS {
        if let Some(at) = segment.to_ascii_lowercase().rfind(phrase)
            && segment[at + phrase.len()..].trim().is_empty()
        {
            segment.truncate(at);
        }
    }
    Some((segment.trim().to_owned(), round))
}

/// `title` without any of `phrases`, case aside.
fn without(title: &str, phrases: &[String]) -> String {
    let mut title = title.to_owned();
    // An empty phrase is found everywhere and removes nothing.
    for phrase in phrases.iter().filter(|p| !p.is_empty()) {
        // ASCII lower-casing keeps byte offsets, so positions found in it hold in `title`.
        while let Some(at) = title
            .to_ascii_lowercase()
            .find(&phrase.to_ascii_lowercase())
        {
            title.replace_range(at..at + phrase.len(), "");
        }
    }
    title
}

/// A title's parts: channels separate them with `//`, `|`, arrows, or ` / ` and ` - ` (spaced, as names hold `/` and `-`).
fn parts(title: &str) -> impl Iterator<Item = &str> {
    title
        .split(['|', '▶', '►', '◀', '◄', 'ⓒ'])
        .flat_map(|s| s.split("//"))
        .flat_map(|s| s.split(" / "))
        .flat_map(|s| s.split(" - "))
        .map(str::trim)
}

/// Round words, most specific first: `semi-final` names the semi, not the final.
const ROUND_WORDS: [(&str, Round); 19] = [
    ("semi", Round::Top4),
    ("eight-final", Round::Top16),
    ("eighth final", Round::Top16),
    ("1/2", Round::Top4),
    ("quarter", Round::Top8),
    ("1/4", Round::Top8),
    ("1/8", Round::Top16),
    ("top 64", Round::Top64),
    ("top64", Round::Top64),
    ("top 32", Round::Top32),
    ("top32", Round::Top32),
    ("top 16", Round::Top16),
    ("top16", Round::Top16),
    ("top 8", Round::Top8),
    ("top8", Round::Top8),
    ("top 4", Round::Top4),
    ("top4", Round::Top4),
    ("3rd place", Round::Third),
    ("final", Round::Final),
];

fn round_in(lower: &str) -> Option<Round> {
    ROUND_WORDS
        .iter()
        .find(|(phrase, _)| lower.contains(phrase))
        .map(|(_, round)| *round)
}

/// Words a bracketed tag can be made of without naming a side: `[BGIRL]`, `(kids)`, `[3vs3]`.
const TAG_WORDS: [&str; 17] = [
    "bboy", "b-boy", "bgirl", "b-girl", "kids", "kid", "crew", "1v1", "2v2", "3v3", "5v5", "1on1",
    "1vs1", "2vs2", "3vs3", "battle", "breaking",
];

/// Drops `[semi]`, `(kids semifinal)` or `[BGIRL]` tags; keeps brackets holding a crew, members or a country.
fn remove_tags(segment: &str) -> String {
    let mut out = String::new();
    let mut rest = segment;
    while let Some(open) = rest.find(['[', '(']) {
        let closing = if rest[open..].starts_with('[') {
            ']'
        } else {
            ')'
        };
        let close = rest[open..]
            .find(closing)
            .map_or(rest.len(), |c| open + c + 1);
        let inside = rest[open + 1..close]
            .trim_end_matches(closing)
            .to_lowercase();
        let tag = round_in(&inside).is_some()
            || inside
                .split_whitespace()
                .all(|word| TAG_WORDS.contains(&word));
        out += &rest[..open];
        if !tag {
            out += &rest[open..close];
        }
        rest = &rest[close..];
    }
    out + rest
}

fn split_vs(segment: &str) -> Option<(&str, &str)> {
    // ASCII lower-casing keeps byte offsets, so positions found in it hold in `segment`.
    let lower = segment.to_ascii_lowercase();
    let at = [" vs. ", " vs "]
        .iter()
        .find_map(|sep| lower.find(sep).map(|at| (at, sep.len())))?;
    Some((segment[..at.0].trim(), segment[at.0 + at.1..].trim()))
}

/// `Alvin & Grom (Formless Corp)`, `Formless Corps (Alvin & Grom)`, `Damani & Syssy [france]`, `Dynamo`;
/// a lone name stays a team name until the battle says what its sides are.
fn side(text: &str) -> Side {
    let mut side = Side::default();
    let mut outside = String::new();
    let mut inside_members = Vec::new();
    let mut rest = text;
    while let Some(open) = rest.find(['(', '[']) {
        outside += &rest[..open];
        let close = rest[open..]
            .find([')', ']'])
            .map_or(rest.len(), |c| open + c);
        let inside = rest[open + 1..close].trim();
        if let Some(code) =
            country_code(&inside.to_uppercase()).or_else(|| country_code(&title_case(inside)))
        {
            side.country = Some(code);
        } else if inside.contains('&') {
            inside_members = names(inside);
        } else if !inside.is_empty() {
            side.crew = Some(inside.to_owned());
        }
        rest = rest.get(close + 1..).unwrap_or_default();
    }
    outside += rest;
    let outside = outside.trim();
    let members = if outside.contains('&') {
        names(outside)
    } else if !inside_members.is_empty() {
        side.crew = Some(outside.to_owned()).filter(|crew| !crew.is_empty());
        inside_members
    } else {
        side.name = Some(strip_prefix(outside).to_owned()).filter(|name| !name.is_empty());
        Vec::new()
    };
    side.members = members
        .into_iter()
        .map(|name| Member {
            name,
            country: side.country,
        })
        .collect();
    side
}

fn names(text: &str) -> Vec<String> {
    text.split(['&', ','])
        .map(|name| strip_prefix(name.trim()).to_owned())
        .filter(|n| !n.is_empty())
        .collect()
}

/// `Bboy Jet` → `Jet`.
fn strip_prefix(name: &str) -> &str {
    for prefix in ["Bboy ", "B-boy ", "B-Boy ", "Bgirl ", "B-girl ", "B-Girl "] {
        if let Some(rest) = name.strip_prefix(prefix) {
            return rest.trim();
        }
    }
    name
}

/// The battle a title names: of those whose words it contains, the one with the longest word, so
/// `KIDZ CREW` names the kids' crew battle rather than the crew battle.
fn battle_named(lower: &str, source: &Source) -> Option<usize> {
    let words = format!(" {} ", spaced(lower));
    source
        .battles
        .iter()
        .enumerate()
        .flat_map(|(index, battle)| {
            battle
                .words
                .iter()
                .map(move |word| (index, spaced(&word.to_lowercase())))
        })
        .filter(|(_, word)| words.contains(&format!(" {word} ")))
        .max_by_key(|(index, word)| (word.len(), std::cmp::Reverse(*index)))
        .map(|(index, _)| index)
}

/// Words joined by single spaces, punctuation dropped: `B-Boy 1on1!` → `b boy 1on1`.
fn spaced(text: &str) -> String {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// `DEMO JUDGES / Bartek & Zouza / …`: the names in the part joined by `&`.
fn people_segment(title: &str) -> Vec<String> {
    parts(title)
        .find(|part| part.contains(['&', ',']))
        .map(names)
        .unwrap_or_default()
}

/// Titles written all in capitals get ordinary capitals: `DAS FLAVOUR` → `Das Flavour`.
fn shouting_to_title_case(title: &str) -> String {
    if title.chars().any(char::is_lowercase) {
        title.to_owned()
    } else {
        title_case(title)
    }
}

fn title_case(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut start = true;
    for c in text.chars() {
        if start {
            out.extend(c.to_uppercase())
        } else {
            out.extend(c.to_lowercase())
        }
        start = !c.is_alphanumeric() && c != '\'';
    }
    out
}

fn draft_edition(
    draft: &mut Draft,
    year: &str,
    mut edition: Edition<'_>,
    (series, source): (&SeriesRecord, &Source),
) -> String {
    let default = source
        .battles
        .iter()
        .position(|b| b.words.is_empty())
        .unwrap_or(0);
    assign_battles(&mut edition.games, default);
    let mut toml = edition_header(draft, year, &edition, (series, source));
    for (index, spec) in source.battles.iter().enumerate() {
        let matches = battle_matches(&edition, index, spec);
        if !matches.is_empty() {
            toml += &draft.battle(&format!("{year} {}", spec.key), spec, (&matches, &[]));
        }
    }
    toml
}

/// Name, date, place, sources and judges.
fn edition_header(
    draft: &mut Draft,
    year: &str,
    edition: &Edition<'_>,
    (series, source): (&SeriesRecord, &Source),
) -> String {
    let first_upload = edition
        .games
        .iter()
        .map(|g| g.video.published.as_str())
        .min()
        .unwrap_or_default();
    let or_todo = |value: &Option<String>| quoted(value.as_deref().unwrap_or("TODO"));
    let judges: Vec<String> = edition
        .judges
        .iter()
        .map(|j| quoted(&draft.dancer(j, None)))
        .collect();
    let channels: Vec<String> = source
        .channels
        .iter()
        .map(|c| quoted(&format!("https://www.youtube.com/channel/{c}")))
        .collect();
    let starts_on = match saturday_before(first_upload) {
        // Battle videos go up during or after the jam, usually the Saturday before the first upload.
        Some(day) => format!(
            "starts_on = {day}  # the Saturday before the first upload ({first_upload}); check"
        ),
        None => format!("# starts_on = YYYY-MM-DD  (videos uploaded from {first_upload})"),
    };
    format!(
        "name = {}\n{starts_on}\ntimezone = {}\ncity = {}\ncountry = {}\nsources = [{}]\njudges = [{}]\n",
        quoted(&format!("{} {year}", series.name)),
        or_todo(&series.timezone),
        or_todo(&series.city),
        or_todo(&series.country),
        channels.join(", "),
        judges.join(", "),
    )
}

/// One battle's matches in round order, its sides read as the battle says.
fn battle_matches(edition: &Edition<'_>, index: usize, spec: &BattleSpec) -> Vec<DraftMatch> {
    // Channels re-upload battles (a 4K version, a fixed title): one match per round and pair.
    let mut seen = BTreeSet::new();
    let games: Vec<&Game> = edition
        .games
        .iter()
        .filter(|g| g.battle == Some(index))
        .filter(|g| {
            let mut pair = g.sides.each_ref().map(Side::key);
            pair.sort();
            seen.insert((g.round.as_str(), pair))
        })
        .collect();
    ROUNDS_IN_ORDER
        .iter()
        .flat_map(|round| games.iter().filter(move |g| g.round == *round))
        .map(|game| DraftMatch {
            round: game.round,
            winner: winner(game, &games, &edition.wins),
            sides: game.sides.clone().map(|side| side.read_as(spec.sides())),
            votes: None,
            video: Some(format!("https://youtu.be/{}", game.video.id)),
        })
        .collect()
}

fn saturday_before(day: &str) -> Option<NaiveDate> {
    let mut date = NaiveDate::parse_from_str(day, "%Y-%m-%d")
        .ok()?
        .pred_opt()?;
    while date.weekday() != Weekday::Sat {
        date = date.pred_opt()?;
    }
    Some(date)
}

/// The order matches are written in: the small final before the final.
const ROUNDS_IN_ORDER: [Round; 7] = {
    let [a, b, c, d, e, last] = ROUNDS;
    [a, b, c, d, e, Round::Third, last]
};

/// Titles that name no battle go where their entrants play, else to `default`.
fn assign_battles(games: &mut [Game], default: usize) {
    // A title links to the battle of any match sharing an entrant, through chains of such matches.
    loop {
        let named: Vec<(usize, String)> = games
            .iter()
            .filter_map(|g| g.battle.map(|b| g.sides.iter().map(move |s| (b, s.key()))))
            .flatten()
            .collect();
        let mut linked = false;
        for game in games.iter_mut().filter(|g| g.battle.is_none()) {
            let keys: Vec<String> = game.sides.iter().map(Side::key).collect();
            game.battle = named
                .iter()
                .find(|(_, key)| keys.contains(key))
                .map(|(b, _)| *b);
            linked |= game.battle.is_some();
        }
        if !linked {
            break;
        }
    }
    for game in games.iter_mut().filter(|g| g.battle.is_none()) {
        game.battle = Some(default);
    }
}

/// Index of the winning side: the one playing the next round, or, in a final, the one a winner title names.
fn winner(game: &Game, games: &[&Game], wins: &[&str]) -> Option<usize> {
    let keys = game.sides.each_ref().map(Side::key);
    let next = match game.round {
        Round::Final | Round::Third => None,
        round => ROUNDS.iter().skip_while(|r| **r != round).nth(1).copied(),
    };
    let candidates: Vec<usize> = match next {
        Some(next) => {
            let playing: BTreeSet<String> = games
                .iter()
                .filter(|g| g.round == next)
                .flat_map(|g| g.sides.iter().map(Side::key))
                .collect();
            (0..2).filter(|i| playing.contains(&keys[*i])).collect()
        }
        None => (0..2)
            .filter(|i| {
                let names = game.sides[*i].names();
                wins.iter().any(|title| {
                    let title = spelling(title);
                    !names.is_empty() && names.iter().all(|name| title.contains(&spelling(name)))
                })
            })
            .collect(),
    };
    match candidates[..] {
        [one] => Some(one),
        _ => None,
    }
}
