//! Drafts `data/` files from a Wikipedia page: brackets in its year sections, placings in its results tables.

use std::collections::{BTreeMap, BTreeSet};

use chrono::NaiveDate;
use serde::Deserialize;

use super::{
    SeriesRecord,
    draft::{BattleSpec, Draft, DraftMatch, DraftPlacing, Member, Side, Sides, quoted},
    key_for,
    wikitext::{
        Bracket, bracket, country_code, flag, flags, plain, split_outside, strip_comments,
        strip_refs, table_rows, votes, winner,
    },
};
use crate::domain::battle::BracketStage;

/// A Wikipedia page and how it names battles; `[wikipedia]` in the series file.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Source {
    /// Page URL, cited in each drafted jam.
    pub page: String,
    /// The battles: `words` find their bracket's heading, `table` and `places` their placings.
    pub battles: Vec<BattleSpec>,
    /// Key of the battle a bracket belongs to when no heading names one (pages that put the 1v1 straight under the year).
    pub untitled: Option<String>,
}

/// Placings by year: `(index in Source::battles, placing)`.
type Placings = BTreeMap<i32, Vec<(usize, DraftPlacing)>>;

/// Drafts one event file per year that a section or a results table mentions.
pub fn draft(wikitext: &str, series: &SeriesRecord, source: &Source) -> Draft {
    let text = strip_refs(&strip_comments(wikitext));
    let mut draft = Draft::default();
    let sections = year_sections(&text);
    let placings = placings(&text, source, &mut draft.problems);
    let years: BTreeSet<i32> = sections.keys().chain(placings.keys()).copied().collect();
    for year in years {
        let section = sections.get(&year).map_or("", String::as_str);
        let placed = placings.get(&year).map_or(&[][..], Vec::as_slice);
        let toml = edition(&mut draft, year, (section, placed), (series, source));
        draft.events.push((year.to_string(), toml));
    }
    draft
}

fn edition(
    draft: &mut Draft,
    year: i32,
    (section, placed): (&str, &[(usize, DraftPlacing)]),
    (series, source): (&SeriesRecord, &Source),
) -> String {
    let mut toml = header(draft, year, section, (series, source));
    let untitled = source
        .untitled
        .as_ref()
        .and_then(|key| source.battles.iter().position(|b| b.key == *key));
    let chunks = battle_chunks(section, &source.battles, untitled);
    for (index, spec) in source.battles.iter().enumerate() {
        let context = format!("{year} {}", spec.key);
        let chunk = chunks
            .iter()
            .filter(|(i, _)| *i == index)
            .find_map(|(_, chunk)| bracket(chunk));
        let matches = match chunk {
            Some(Ok(bracket)) => bracket_matches(draft, &context, bracket, spec),
            Some(Err(problem)) => {
                draft.problems.push(format!("{context}: {problem}"));
                Vec::new()
            }
            None => Vec::new(),
        };
        let placings: Vec<DraftPlacing> = placed
            .iter()
            .filter(|(i, _)| *i == index)
            .map(|(_, p)| p.clone())
            .collect();
        cross_check(draft, &context, &matches, &placings);
        if !matches.is_empty() || !placings.is_empty() {
            toml += &draft.battle(&context, spec, (&matches, &placings));
        }
    }
    let unknown: BTreeSet<String> = flags(section)
        .into_iter()
        .filter(|f| country_code(f).is_none())
        .collect();
    draft.problems.extend(
        unknown
            .into_iter()
            .map(|flag| format!("{year}: unknown flag {flag:?}")),
    );
    toml
}

/// A bracket's cells as matches; a cell with no Latin name is left for a human.
fn bracket_matches(
    draft: &mut Draft,
    context: &str,
    bracket: Bracket,
    spec: &BattleSpec,
) -> Vec<DraftMatch> {
    bracket
        .into_iter()
        .map(|(round, a, b)| DraftMatch {
            round,
            winner: winner(&a, &b),
            votes: votes(&a, &b),
            sides: [&a, &b].map(|cell| {
                people(&cell.text, spec.sides()).unwrap_or_else(|| {
                    let (round, text) = (round.as_str(), plain(&cell.text));
                    draft.problems.push(format!(
                        "{context} {round}: no Latin name in {text:?}; fill that entrant"
                    ));
                    Side::default()
                })
            }),
            video: None,
        })
        .collect()
}

/// Name, dates, place, sources and staff.
fn header(
    draft: &mut Draft,
    year: i32,
    section: &str,
    (series, source): (&SeriesRecord, &Source),
) -> String {
    let intro = &section[..section.find("'''Judges").unwrap_or(section.len())];
    let mut lines = vec![format!(
        "name = {}",
        quoted(&format!("{} {year}", series.name))
    )];
    match dates_in(intro, year) {
        Some((starts_on, ends_on)) => {
            lines.push(format!("starts_on = {starts_on}"));
            lines.extend(ends_on.map(|ends_on| format!("ends_on = {ends_on}")));
        }
        None => {
            draft
                .problems
                .push(format!("{year}: no date found; fill starts_on"));
            lines.push("# starts_on = YYYY-MM-DD  (not found on the page)".into());
        }
    }
    lines.push(format!(
        "timezone = {}",
        quoted(series.timezone.as_deref().unwrap_or("TODO"))
    ));
    let (city, country) = location(section)
        .or_else(|| Some((series.city.clone()?, series.country.clone()?)))
        .unwrap_or_else(|| {
            draft
                .problems
                .push(format!("{year}: no place found; fill city and country"));
            ("TODO".into(), "TODO".into())
        });
    lines.push(format!("city = {}", quoted(&city)));
    lines.push(format!("country = {}", quoted(&country)));
    lines.push(format!("sources = [{}]", quoted(&source.page)));
    for (role, label) in [("judges", "Judges"), ("mcs", "MC"), ("djs", "DJ")] {
        let keys: Vec<String> = staff(section, label)
            .iter()
            .map(|m| quoted(&draft.dancer(&m.name, m.country)))
            .collect();
        lines.push(format!("{role} = [{}]", keys.join(", ")));
    }
    lines.join("\n") + "\n"
}

/// A results table and its bracket disagreeing on the champion is worth a look.
fn cross_check(
    draft: &mut Draft,
    context: &str,
    matches: &[DraftMatch],
    placings: &[DraftPlacing],
) {
    let bracket_winner = matches
        .iter()
        .find(|m| m.round == super::Round::Final)
        .and_then(|m| m.winner.map(|w| m.sides[w].key()));
    let table_winner = placings
        .iter()
        .find(|p| p.reached == BracketStage::Winner)
        .map(|p| p.side.key());
    if let (Some(bracket), Some(table)) = (bracket_winner, table_winner)
        && bracket != table
    {
        draft.problems.push(format!(
            "{context}: the bracket's champion is {bracket}, the results table's {table}"
        ));
    }
}

/// `Location: [[Mumbai]], India` → `("Mumbai", "IN")`.
fn location(section: &str) -> Option<(String, String)> {
    let line = section
        .split('\n')
        .find_map(|line| line.trim().strip_prefix("Location:"))?;
    let line = plain(&line[..line.find("{{").unwrap_or(line.len())]);
    let (city, country) = line.split_once(',')?;
    let code = country_code(country.trim()).unwrap_or("TODO");
    Some((city.trim().to_owned(), code.to_owned()))
}

/// A cell's people read as the battle's sides: one dancer, members joined by `&` or `and`, a team or a crew.
fn people(text: &str, sides: Sides) -> Option<Side> {
    let name = plain(text);
    // Tables fill empty categories with `-` or `?`: nothing to key.
    if key_for(&name).is_empty() {
        return None;
    }
    let country = flag(text).and_then(|f| country_code(&f));
    if sides == Sides::Crews {
        return Some(Side::lone(&name, country, sides));
    }
    let members: Vec<Member> = split_outside(text, "&")
        .into_iter()
        .flat_map(|part| split_outside(part, " and "))
        .map(|part| Member {
            name: plain(part),
            country: flag(part).and_then(|f| country_code(&f)),
        })
        .filter(|member| !key_for(&member.name).is_empty())
        .collect();
    Some(match (sides, &members[..]) {
        (Sides::Teams, [_]) => Side::lone(&name, country, sides),
        _ => Side {
            members,
            ..Side::default()
        },
    })
}

/// Placings from each battle's results table, by year.
fn placings(text: &str, source: &Source, problems: &mut Vec<String>) -> Placings {
    let mut by_year = Placings::new();
    for (index, spec) in source.battles.iter().enumerate() {
        let Some(table) = &spec.table else { continue };
        let Some(section) = heading_section(text, table) else {
            problems.push(format!(
                "battle {}: no heading {table:?} above a table",
                spec.key
            ));
            continue;
        };
        // Some sections hold several tables, e.g. BOTY's placings before and after 2006.
        let rows: Vec<Vec<(String, String)>> = section
            .match_indices("{|")
            .flat_map(|(at, _)| table_rows(&section[at..]))
            .collect();
        let has_column = |column: &String| {
            rows.iter()
                .any(|r| r.iter().any(|(h, _)| *h == column.to_lowercase()))
        };
        for column in spec.places.keys().filter(|c| !has_column(c)) {
            problems.push(format!(
                "battle {}: no column {column:?} in table {table:?}",
                spec.key
            ));
        }
        for row in &rows {
            let Some(year) = row
                .first()
                .and_then(|(_, cell)| plain(cell).get(..4)?.parse().ok())
            else {
                continue;
            };
            by_year
                .entry(year)
                .or_default()
                .extend(row_placings(row, spec).map(|placing| (index, placing)));
            let unknown = row
                .iter()
                .flat_map(|(_, cell)| flags(cell))
                .filter(|f| country_code(f).is_none());
            problems.extend(
                unknown.map(|flag| format!("{year}: unknown flag {flag:?} in table {table:?}")),
            );
        }
    }
    by_year
}

/// A table row's placings for one battle: each `places` column, its names split at `/`.
fn row_placings<'a>(
    row: &'a [(String, String)],
    spec: &'a BattleSpec,
) -> impl Iterator<Item = DraftPlacing> + 'a {
    spec.places.iter().flat_map(move |(column, place)| {
        let cell = row
            .iter()
            .find(|(h, _)| *h == column.to_lowercase())
            .map_or("", |(_, cell)| cell.as_str());
        split_outside(cell, "/")
            .into_iter()
            .filter_map(|part| people(part, spec.sides()))
            .map(|side| {
                let (reached, rank) = place.stage();
                DraftPlacing {
                    side,
                    reached,
                    rank,
                }
            })
    })
}

/// The text under the first heading whose title contains `title` (case aside), up to the next heading.
fn heading_section<'a>(text: &'a str, title: &str) -> Option<&'a str> {
    let title = title.to_lowercase();
    let mut offset = 0;
    let mut start = None;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim();
        if trimmed.starts_with('=') && trimmed.ends_with('=') {
            if let Some(start) = start {
                return Some(&text[start..offset]);
            }
            if trimmed.to_lowercase().contains(&title) {
                start = Some(offset + line.len());
            }
        }
        offset += line.len();
    }
    start.map(|start| &text[start..])
}

/// Bulleted people under `'''<label>` (Judges, MC, DJ), crews in brackets dropped.
fn staff(section: &str, label: &str) -> Vec<Member> {
    let Some(start) = section.find(&format!("'''{label}")) else {
        return Vec::new();
    };
    section[start..]
        .split('\n')
        .skip(1)
        .map(str::trim)
        .skip_while(|line| line.is_empty())
        .take_while(|line| line.starts_with('*'))
        .map(|line| {
            let line = &line[..line.find(" (").unwrap_or(line.len())];
            Member {
                name: plain(line.trim_start_matches('*')),
                country: flag(line).and_then(|f| country_code(&f)),
            }
        })
        .filter(|member| !member.name.is_empty())
        .collect()
}

/// `(battle index, text up to the next battle)` for each heading naming a battle by one of its words;
/// a year with no such heading gives its text to the `untitled` battle, if any.
fn battle_chunks<'a>(
    section: &'a str,
    battles: &[BattleSpec],
    untitled: Option<usize>,
) -> Vec<(usize, &'a str)> {
    let mut starts = Vec::new();
    let mut offset = 0;
    for line in section.split_inclusive('\n') {
        if is_heading(line) {
            let lower = line.to_lowercase();
            let named = battles
                .iter()
                .position(|b| b.words.iter().any(|w| lower.contains(&w.to_lowercase())));
            starts.extend(named.map(|index| (offset, index)));
        }
        offset += line.len();
    }
    if starts.is_empty() {
        return untitled.map(|index| (index, section)).into_iter().collect();
    }
    let ends = starts
        .iter()
        .skip(1)
        .map(|(at, _)| *at)
        .chain([section.len()]);
    starts
        .iter()
        .zip(ends)
        .map(|((at, index), end)| (*index, &section[*at..end]))
        .collect()
}

/// `==== B-Boys ====` or a line that is all bold, like `'''B-boy World Final'''`.
fn is_heading(line: &str) -> bool {
    let line = line.trim();
    (line.starts_with('=') && line.ends_with('='))
        || (line.starts_with("'''")
            && line.trim_end_matches(':').ends_with("'''")
            && line.len() < 80)
}

/// Text by year, from every heading (levels 2 and 3) whose title starts with a year; one year's sections are joined.
fn year_sections(text: &str) -> BTreeMap<i32, String> {
    let mut sections: BTreeMap<i32, String> = BTreeMap::new();
    let mut open: Option<i32> = None;
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim();
        let level = trimmed.chars().take_while(|c| *c == '=').count();
        if (2..=3).contains(&level) && trimmed.ends_with('=') {
            let title = trimmed.trim_matches('=').trim().trim_matches('\'');
            let digits = title.chars().take_while(char::is_ascii_digit).count();
            open = (digits == 4).then(|| title[..4].parse().ok()).flatten();
        }
        if let Some(year) = open {
            *sections.entry(year).or_default() += line;
        }
    }
    sections
}

/// The first date in `text` ("November 9", "7 December", "July 25 – 27", "November 5 and 6"), in `year`.
fn dates_in(text: &str, year: i32) -> Option<(NaiveDate, Option<NaiveDate>)> {
    let words: Vec<&str> = text
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();
    let day = |w: Option<&&str>| {
        w.and_then(|w| w.parse::<u32>().ok())
            .filter(|d| (1..=31).contains(d))
    };
    words.iter().enumerate().find_map(|(i, word)| {
        let month = month(word)?;
        let (first, after) = match day(words.get(i + 1)) {
            Some(first) => (first, i + 2),
            None => (day(i.checked_sub(1).and_then(|p| words.get(p)))?, i + 1),
        };
        let last = day(words.get(after))
            .or_else(|| {
                (words.get(after) == Some(&"and"))
                    .then(|| day(words.get(after + 1)))
                    .flatten()
            })
            .filter(|last| *last > first);
        let date = |d| NaiveDate::from_ymd_opt(year, month, d);
        Some((date(first)?, last.and_then(date)))
    })
}

fn month(word: &str) -> Option<u32> {
    const MONTHS: [&str; 12] = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    MONTHS.iter().position(|m| *m == word).map(|i| i as u32 + 1)
}
