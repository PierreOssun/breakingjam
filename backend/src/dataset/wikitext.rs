//! Reading Wikipedia markup: templates, plain text, flags, bracket templates and tables.

use std::collections::BTreeMap;

use super::Round;

/// One side of a bracket match, as the template cells write it.
#[derive(Debug)]
pub struct Cell {
    /// The team cell's wikitext.
    pub text: String,
    /// Bold name: the page's own mark of the winner.
    bold_name: bool,
    /// Bold score: a weaker mark, as some years bold each round's votes.
    bold_score: bool,
    score: Score,
}

#[derive(Debug, Clone, Copy)]
enum Score {
    Win,
    Loss,
    Votes(u8),
    Unknown,
}

/// A bracket's matches, round by round.
pub type Bracket = Vec<(Round, Cell, Cell)>;

/// Index of the winning cell, or `None` when the cells don't say.
pub fn winner(a: &Cell, b: &Cell) -> Option<usize> {
    let marked = |a_marked: bool, b_marked: bool| (a_marked != b_marked).then_some(a_marked);
    let a_won = marked(a.bold_name, b.bold_name)
        .or_else(|| marked(a.bold_score, b.bold_score))
        .or(match (a.score, b.score) {
            (Score::Win, _) | (_, Score::Loss) => Some(true),
            (Score::Loss, _) | (_, Score::Win) => Some(false),
            (Score::Votes(x), Score::Votes(y)) if x != y => Some(x > y),
            _ => None,
        })?;
    Some(if a_won { 0 } else { 1 })
}

/// Judge votes, when both cells give one number.
pub fn votes(a: &Cell, b: &Cell) -> Option<[u8; 2]> {
    match (a.score, b.score) {
        (Score::Votes(x), Score::Votes(y)) => Some([x, y]),
        _ => None,
    }
}

/// The first bracket template in `chunk`: `None` when there is none, `Err` when unreadable.
pub fn bracket(chunk: &str) -> Option<Result<Bracket, String>> {
    let start = chunk.match_indices("{{").map(|(at, _)| at).find(|at| {
        let rest = &chunk[at + 2..];
        let digits = rest.chars().take_while(char::is_ascii_digit).count();
        rest.starts_with("#invoke:bracket|")
            || (rest.starts_with("Round") && rest[5..].starts_with(|c: char| c.is_ascii_digit()))
            || (digits > 0 && rest[digits..].starts_with("TeamBracket"))
    })?;
    let body = template_body(&chunk[start..]);
    let params = split_params(body);
    let name = params.first().map_or("", |p| p.trim());
    Some(if name.starts_with("Round") {
        // Some years separate cells with `{{!}}`, which other years use inside a cell.
        positional_bracket(name, &params[1..]).or_else(|first| {
            let body = body.replace("{{!}}", "|");
            positional_bracket(name, &split_params(&body)[1..]).map_err(|_| first)
        })
    } else {
        named_bracket(&params)
    })
}

/// `{{#invoke:bracket|16TeamBracket…|RD1-team01=…}}` or `{{32TeamBracket|RD1-team01=…}}`.
fn named_bracket(params: &[&str]) -> Result<Bracket, String> {
    let size_param = params
        .iter()
        .find(|p| p.contains("TeamBracket"))
        .copied()
        .unwrap_or_default();
    let size = leading_number(size_param)?;
    let named: BTreeMap<&str, &str> = params
        .iter()
        .filter_map(|p| p.split_once('='))
        .map(|(name, value)| (name.trim(), value))
        .collect();
    let rounds = Round::bracket(size).ok_or_else(|| format!("unexpected bracket size {size}"))?;
    let mut matches = Vec::new();
    for (index, round) in rounds.into_iter().enumerate() {
        let r = index + 1;
        for i in (1..=usize::from(round.players())).step_by(2) {
            // Templates number teams `01` or `1`, sometimes both in one page.
            let get = |field: &str, n: usize| {
                let padded = named.get(format!("RD{r}-{field}{n:02}").as_str());
                padded
                    .or_else(|| named.get(format!("RD{r}-{field}{n}").as_str()))
                    .copied()
            };
            let cell = |n| Some(cell(get("team", n)?, get("score", n).unwrap_or_default()));
            let (Some(a), Some(b)) = (cell(i), cell(i + 1)) else {
                return Err(format!("round {r} match {} is missing", i / 2 + 1));
            };
            matches.push((round, a, b));
        }
    }
    Ok(matches)
}

/// `{{Round16| |team|score|team|score| |team…}}`: five positional cells per match, round by round.
fn positional_bracket(name: &str, params: &[&str]) -> Result<Bracket, String> {
    let size = leading_number(name.trim_start_matches("Round"))?;
    let mut cells: Vec<&str> = params.iter().copied().filter(|p| !is_named(p)).collect();
    while cells.last().is_some_and(|cell| cell.trim().is_empty()) {
        cells.pop();
    }
    let rounds = Round::bracket(size).ok_or_else(|| format!("unexpected bracket size {size}"))?;
    let mut slots: Vec<Round> = rounds
        .into_iter()
        .flat_map(|round| std::iter::repeat_n(round, usize::from(round.players() / 2)))
        .collect();
    if cells.len() / 5 == slots.len() + 1 {
        slots.push(Round::Third);
    }
    if cells.len() != slots.len() * 5 {
        return Err(format!(
            "{} cells, expected {} (5 per match)",
            cells.len(),
            slots.len() * 5
        ));
    }
    Ok(slots
        .into_iter()
        .zip(cells.chunks(5))
        .map(|(round, cell5)| (round, cell(cell5[1], cell5[2]), cell(cell5[3], cell5[4])))
        .collect())
}

fn cell(text: &str, score: &str) -> Cell {
    let bare = score.replace("'''", "").replace('*', "");
    Cell {
        text: text.to_owned(),
        bold_name: text.contains("'''"),
        bold_score: score.contains("'''"),
        score: match bare.trim() {
            "W" => Score::Win,
            "L" => Score::Loss,
            other => other.parse().map_or(Score::Unknown, Score::Votes),
        },
    }
}

/// The rows of the first `{| … |}` table in `text`, each cell paired with its column header.
pub fn table_rows(text: &str) -> Vec<Vec<(String, String)>> {
    let Some(start) = text.find("{|") else {
        return Vec::new();
    };
    let end = text[start..].find("\n|}").map_or(text.len(), |e| start + e);
    let mut rows = text[start..end].split("\n|-").skip(1).map(row_cells);
    let Some(headers) = rows.next() else {
        return Vec::new();
    };
    let headers: Vec<String> = headers.iter().map(|h| plain(h).to_lowercase()).collect();
    rows.filter(|cells| !cells.is_empty())
        .map(|cells| headers.iter().cloned().zip(cells).collect())
        .collect()
}

/// A row's cells: lines starting `|` or `!`, split at `||` and `!!`, without `scope="row" |` attributes.
fn row_cells(row: &str) -> Vec<String> {
    row.lines()
        .map(str::trim)
        .filter(|line| (line.starts_with('|') || line.starts_with('!')) && !line.starts_with("|+"))
        .flat_map(|line| {
            split_outside(&line[1..], "||")
                .into_iter()
                .flat_map(|c| split_outside(c, "!!"))
        })
        .map(|cell| {
            let parts = split_params(cell);
            match parts[..] {
                [attributes, ..] if parts.len() > 1 && attributes.contains("=\"") => {
                    parts[1..].join("|")
                }
                _ => cell.to_owned(),
            }
        })
        .map(|cell| cell.trim().to_owned())
        .collect()
}

/// The inside of the template starting at `text`, up to its matching `}}`.
pub fn template_body(text: &str) -> &str {
    let mut depth = 0;
    let mut i = 0;
    while i + 1 < text.len() {
        match &text.as_bytes()[i..i + 2] {
            b"{{" => depth += 1,
            b"}}" => {
                depth -= 1;
                if depth == 0 {
                    return &text[2..i];
                }
            }
            _ => {
                i += 1;
                continue;
            }
        }
        i += 2;
    }
    &text[2.min(text.len())..]
}

/// Splits template parameters on the `|` that are not inside `{{…}}` or `[[…]]`.
pub fn split_params(body: &str) -> Vec<&str> {
    split_outside(body, "|")
}

/// Splits `text` on `separator` (ASCII) wherever it is not inside `{{…}}` or `[[…]]`.
pub fn split_outside<'a>(text: &'a str, separator: &str) -> Vec<&'a str> {
    let (bytes, separator) = (text.as_bytes(), separator.as_bytes());
    let (mut depth, mut start, mut i, mut parts) = (0i32, 0, 0, Vec::new());
    while i < bytes.len() {
        let rest = &bytes[i..];
        if rest.starts_with(b"{{") || rest.starts_with(b"[[") {
            (depth, i) = (depth + 1, i + 2);
        } else if rest.starts_with(b"}}") || rest.starts_with(b"]]") {
            (depth, i) = (depth - 1, i + 2);
        } else if depth == 0 && rest.starts_with(separator) {
            parts.push(&text[start..i]);
            i += separator.len();
            start = i;
        } else {
            i += 1;
        }
    }
    parts.push(&text[start..]);
    parts
}

/// `name=value` with a plain name, as opposed to a positional cell.
fn is_named(param: &str) -> bool {
    param.split_once('=').is_some_and(|(name, _)| {
        let name = name.trim();
        !name.is_empty()
            && name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    })
}

fn leading_number(text: &str) -> Result<u16, String> {
    let digits: String = text
        .trim()
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    digits
        .parse()
        .map_err(|_| format!("no bracket size in {:?}", text.trim()))
}

/// The country of the first flag template in `text`: `{{flagicon|FRA}}` or `{{#invoke:flag|icon|FRA}}`.
pub fn flag(text: &str) -> Option<String> {
    flags(text).into_iter().next()
}

/// Every flag template's country in `text`, as written.
pub fn flags(text: &str) -> Vec<String> {
    let mut found = Vec::new();
    for marker in ["flagicon|", "flag|icon|"] {
        for (at, _) in text.match_indices(marker) {
            let rest = &text[at + marker.len()..];
            let end = rest.find(['|', '}']).unwrap_or(rest.len());
            let flag = rest[..end].trim();
            if !flag.is_empty() {
                found.push((at, flag.to_owned()));
            }
        }
    }
    found.sort();
    found.into_iter().map(|(_, flag)| flag).collect()
}

/// Visible text: no templates, tags or bold, links reduced to their label.
pub fn plain(text: &str) -> String {
    let mut out = String::new();
    let mut rest = remove_between(text, "<sup>", "</sup>");
    rest = remove_templates(&rest);
    while let Some(open) = rest.find("[[") {
        out += &rest[..open];
        let close = rest[open..].find("]]").map_or(rest.len(), |c| open + c);
        let link = &rest[open + 2..close];
        out += link.rsplit('|').next().unwrap_or(link);
        rest = rest[(close + 2).min(rest.len())..].to_owned();
    }
    out += &rest;
    let out = remove_between(&out, "<", ">")
        .replace("'''", "")
        .replace("''", "");
    out.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_end_matches('*')
        .trim()
        .to_owned()
}

fn remove_templates(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(open) = rest.find("{{") {
        out += &rest[..open];
        let body = template_body(&rest[open..]);
        rest = &rest[(open + body.len() + 4).min(rest.len())..];
    }
    out + rest
}

fn remove_between(text: &str, open: &str, close: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find(open) {
        out += &rest[..start];
        let Some(end) = rest[start..].find(close) else {
            return out;
        };
        rest = &rest[start + end + close.len()..];
    }
    out + rest
}

/// Drops `<!-- … -->` comments.
pub fn strip_comments(text: &str) -> String {
    remove_between(text, "<!--", "-->")
}

/// Drops `<ref …/>` and `<ref …>…</ref>`: citations, not content.
pub fn strip_refs(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(start) = rest.find("<ref") {
        out += &rest[..start];
        let tag_end = rest[start..]
            .find('>')
            .map_or(rest.len(), |e| start + e + 1);
        let self_closing = rest[..tag_end].ends_with("/>");
        rest = if self_closing {
            &rest[tag_end..]
        } else {
            rest[tag_end..]
                .find("</ref>")
                .map_or("", |e| &rest[tag_end + e + "</ref>".len()..])
        };
    }
    out + rest
}

/// ISO 3166-1 alpha-2 for the country names and IOC-style codes Wikipedia flags use.
pub fn country_code(flag: &str) -> Option<&'static str> {
    Some(match flag.trim() {
        "USA" | "US" | "United States" => "US",
        "KOR" | "South Korea" | "Korea" => "KR",
        "FRA" | "France" => "FR",
        "JPN" | "JAP" | "Japan" => "JP",
        "NED" | "Netherlands" | "Holland" => "NL",
        "RUS" | "Russia" => "RU",
        "BRA" | "Brazil" => "BR",
        "MAR" | "Morocco" => "MA",
        "CAN" | "Canada" => "CA",
        "VEN" | "Venezuela" => "VE",
        "KAZ" | "Kazakhstan" => "KZ",
        "GER" | "DEU" | "Germany" => "DE",
        "UKR" | "Ukraine" => "UA",
        "LIT" | "LTU" | "Lithuania" => "LT",
        "MEX" | "Mexico" => "MX",
        "UK" | "GBR" | "GRB" | "BRI" | "United Kingdom" | "England" => "GB",
        "ITA" | "Italy" => "IT",
        "CHN" | "PRC" | "China" => "CN",
        "POR" | "Portugal" => "PT",
        "POL" | "Poland" => "PL",
        "ALG" | "DZA" | "Algeria" => "DZ",
        "BEL" | "Belgium" => "BE",
        "DEN" | "Denmark" => "DK",
        "ESP" | "SPA" | "Spain" => "ES",
        "GRE" | "Greece" => "GR",
        "TUR" | "Turkey" => "TR",
        "SUI" | "SWI" | "Switzerland" => "CH",
        "FIN" | "Finland" => "FI",
        "COL" | "Colombia" => "CO",
        "RSA" | "ZA" | "South Africa" => "ZA",
        "BUL" | "Bulgaria" => "BG",
        "BLR" | "Belarus" => "BY",
        "TPE" | "TWN" | "ROC" | "Taiwan" => "TW",
        "VIE" | "Vietnam" => "VN",
        "ECU" | "Ecuador" => "EC",
        "AUT" | "Austria" => "AT",
        "AUS" | "Australia" => "AU",
        "SWE" | "Sweden" => "SE",
        "PER" | "Peru" => "PE",
        "EGY" | "Egypt" => "EG",
        "ARG" | "Argentina" => "AR",
        "SEN" | "Senegal" => "SN",
        "ROM" | "ROU" | "Romania" => "RO",
        "NOR" | "Norway" => "NO",
        "MAS" | "MYS" | "Malaysia" => "MY",
        "HK" | "HKG" | "Hong Kong" => "HK",
        "IND" | "India" => "IN",
        "SVK" | "Slovakia" => "SK",
        "CZE" | "Czech Republic" | "Czechia" => "CZ",
        "HUN" | "Hungary" => "HU",
        "LAT" | "LVA" | "Latvia" => "LV",
        "EST" | "Estonia" => "EE",
        "SRB" | "Serbia" => "RS",
        "CRO" | "HRV" | "Croatia" => "HR",
        "SLO" | "SVN" | "Slovenia" => "SI",
        "IRL" | "Ireland" => "IE",
        "ISR" | "Israel" => "IL",
        "PSE" | "PLE" | "Palestine" => "PS",
        "CHL" | "CHI" | "Chile" => "CL",
        "THA" | "Thailand" => "TH",
        "PHI" | "PHL" | "Philippines" => "PH",
        "INA" | "IDN" | "Indonesia" => "ID",
        "NZ" | "NZL" | "New Zealand" => "NZ",
        "MGL" | "MNG" | "Mongolia" => "MN",
        "GEO" | "Georgia" => "GE",
        "ARM" | "Armenia" => "AM",
        "AZE" | "Azerbaijan" => "AZ",
        "UZB" | "Uzbekistan" => "UZ",
        "KGZ" | "Kyrgyzstan" => "KG",
        "MDA" | "Moldova" => "MD",
        "CUB" | "Cuba" => "CU",
        "DOM" | "Dominican Republic" => "DO",
        "PUR" | "PRI" | "Puerto Rico" => "PR",
        "SGP" | "SIN" | "Singapore" => "SG",
        "TUN" | "Tunisia" => "TN",
        _ => return None,
    })
}
