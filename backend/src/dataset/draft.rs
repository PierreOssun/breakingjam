//! What a source (Wikipedia, YouTube) drafts for a human to review before it goes in `data/`.

use std::collections::{BTreeMap, BTreeSet};

use serde::Deserialize;

use super::{Round, key_for};
use crate::domain::battle::{BattleAge, BattleGender, BracketStage};

/// Event files, and the dancers and crews they name, with what needs a decision.
#[derive(Debug, Default)]
pub struct Draft {
    /// `(edition, TOML)` for `events/<series>/<edition>.toml`.
    pub events: Vec<(String, String)>,
    /// Every dancer the editions name, by key.
    pub dancers: BTreeMap<String, DraftName>,
    /// Every crew the editions name, by key.
    pub crews: BTreeMap<String, DraftName>,
    /// What could not be read and needs a decision.
    pub problems: Vec<String>,
}

/// A dancer or crew as the sources show it, with every spelling and country seen.
#[derive(Debug, Default)]
pub struct DraftName {
    /// First spelling seen.
    pub name: String,
    /// Every spelling seen.
    pub spellings: BTreeSet<String>,
    /// ISO codes seen, with how often.
    pub countries: BTreeMap<&'static str, u32>,
    /// Crew keys a dancer was seen dancing for.
    pub crews: BTreeSet<String>,
}

/// A battle as a series file describes it to the drafting tools.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BattleSpec {
    /// Battle key in the drafted files.
    pub key: String,
    /// Battle name.
    pub name: String,
    /// Dancers per side, when fixed; 1 when absent unless `sides` says otherwise.
    pub team_size: Option<u8>,
    /// Who may enter; mixed when absent.
    pub gender: Option<BattleGender>,
    /// Age category, e.g. kids.
    pub age: Option<BattleAge>,
    /// What the sides are; follows from `team_size` when absent.
    pub sides: Option<Sides>,
    /// Words naming this battle in a title or a heading, e.g. `2v2`, `kids` or `b-girl`.
    #[serde(default)]
    pub words: Vec<String>,
    /// Heading above the results table its placings are read from, e.g. `Winners`.
    pub table: Option<String>,
    /// Table column → place its names got, e.g. `"First place" = "winner"`.
    #[serde(default)]
    pub places: BTreeMap<String, Place>,
}

/// A place a results table gives: a stage, or an exact rank on the podium.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Place {
    Winner,
    Top2,
    /// Third, from a small final.
    Third,
    /// Fourth, from a small final.
    Fourth,
    Top4,
    Top8,
    Top16,
    Top32,
    Top64,
}

impl Place {
    /// The stage reached, and the rank when the place fixes one beyond what the stage implies.
    pub fn stage(self) -> (BracketStage, Option<i32>) {
        match self {
            Self::Winner => (BracketStage::Winner, None),
            Self::Top2 => (BracketStage::Top2, None),
            Self::Third => (BracketStage::Top4, Some(3)),
            Self::Fourth => (BracketStage::Top4, Some(4)),
            Self::Top4 => (BracketStage::Top4, None),
            Self::Top8 => (BracketStage::Top8, None),
            Self::Top16 => (BracketStage::Top16, None),
            Self::Top32 => (BracketStage::Top32, None),
            Self::Top64 => (BracketStage::Top64, None),
        }
    }
}

/// What the sides of a battle are.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Sides {
    /// One dancer each.
    Dancers,
    /// Duos and named teams.
    Teams,
    /// Crews, by crew name.
    Crews,
}

impl BattleSpec {
    /// What the sides are.
    pub fn sides(&self) -> Sides {
        self.sides.unwrap_or(match self.team_size {
            Some(size) if size > 1 => Sides::Teams,
            _ => Sides::Dancers,
        })
    }
}

/// A dancer named on one side, with the country the source gives them.
#[derive(Debug, Clone, Default)]
pub struct Member {
    /// Name as written.
    pub name: String,
    /// ISO 3166-1 alpha-2, when the source gives it.
    pub country: Option<&'static str>,
}

/// One side as a source writes it: its dancers, its crew, its team name, or a mix.
#[derive(Debug, Clone, Default)]
pub struct Side {
    /// The dancers: the one dancer of a 1v1, a duo's two.
    pub members: Vec<Member>,
    /// The crew it dances for.
    pub crew: Option<String>,
    /// A team name, e.g. `Dynamo`.
    pub name: Option<String>,
    /// ISO 3166-1 alpha-2 of a lone name (the team's or the crew's), when the source gives it.
    pub country: Option<&'static str>,
}

impl Side {
    /// A lone name, read as the battle's sides are: a dancer, a team or a crew.
    pub fn lone(name: &str, country: Option<&'static str>, sides: Sides) -> Self {
        let name = name.to_owned();
        match sides {
            Sides::Dancers => Self {
                members: vec![Member { name, country }],
                ..Self::default()
            },
            Sides::Teams => Self {
                name: Some(name),
                country,
                ..Self::default()
            },
            Sides::Crews => Self {
                crew: Some(name),
                country,
                ..Self::default()
            },
        }
    }

    /// The side with a lone team name read as `sides` says, once a source knows its battle.
    pub fn read_as(self, sides: Sides) -> Self {
        match (&self.name, self.members.is_empty() && self.crew.is_none()) {
            (Some(name), true) => Self::lone(name, self.country, sides),
            _ => self,
        }
    }

    /// Same key for one side however a source orders its members.
    pub fn key(&self) -> String {
        if self.members.is_empty() {
            return key_for(
                self.name
                    .as_deref()
                    .or(self.crew.as_deref())
                    .unwrap_or_default(),
            );
        }
        let mut keys: Vec<String> = self.members.iter().map(|m| key_for(&m.name)).collect();
        keys.sort();
        keys.join("-")
    }

    /// The names a title announcing this side's win would mention.
    pub fn names(&self) -> Vec<&str> {
        if self.members.is_empty() {
            self.name
                .iter()
                .chain(&self.crew)
                .map(String::as_str)
                .collect()
        } else {
            self.members.iter().map(|m| m.name.as_str()).collect()
        }
    }
}

/// A match a source drafted; `winner` indexes `sides`.
#[derive(Debug, Clone)]
pub struct DraftMatch {
    /// Bracket round.
    pub round: Round,
    /// The two sides.
    pub sides: [Side; 2],
    /// Which side won, when the source says.
    pub winner: Option<usize>,
    /// Judge votes per side.
    pub votes: Option<[u8; 2]>,
    /// YouTube link of the match.
    pub video: Option<String>,
}

/// A placing a results table drafted.
#[derive(Debug, Clone)]
pub struct DraftPlacing {
    /// Who placed.
    pub side: Side,
    /// How far they got.
    pub reached: BracketStage,
    /// Exact rank, when the table gives one the stage doesn't imply (3rd, 4th).
    pub rank: Option<i32>,
}

impl Draft {
    /// Registers a dancer and returns their key.
    pub fn dancer(&mut self, name: &str, country: Option<&'static str>) -> String {
        register(&mut self.dancers, name, country)
    }

    /// Registers a crew and returns its key.
    pub fn crew(&mut self, name: &str, country: Option<&'static str>) -> String {
        register(&mut self.crews, name, country)
    }

    /// A `[[battles]]` block from matches or, when there are none, placings; `context` starts its problems.
    pub fn battle(
        &mut self,
        context: &str,
        spec: &BattleSpec,
        (matches, placings): (&[DraftMatch], &[DraftPlacing]),
    ) -> String {
        let mut teams = BTreeMap::new();
        let mut toml = battle_header(spec, matches.first().map(|m| m.round));
        if matches.is_empty() {
            toml += "results = [\n";
            for placing in placings {
                let key = self.entrant(context, &placing.side, spec, &mut teams);
                let rank = placing
                    .rank
                    .map(|rank| format!(", rank = {rank}"))
                    .unwrap_or_default();
                toml += &format!(
                    "  {{ entrant = {}, reached = \"{}\"{rank} }},\n",
                    quoted(&key),
                    stage_word(placing.reached)
                );
            }
        } else {
            toml += "matches = [\n";
            for game in matches {
                toml += &self.match_line(context, game, spec, &mut teams);
            }
        }
        toml += "]\n";
        if !teams.is_empty() {
            toml += "\n[battles.teams]\n";
            for (key, line) in teams {
                toml += &format!("{key} = {{ {line} }}\n");
            }
        }
        toml
    }

    fn match_line(
        &mut self,
        context: &str,
        game: &DraftMatch,
        spec: &BattleSpec,
        teams: &mut BTreeMap<String, String>,
    ) -> String {
        let keys = game
            .sides
            .clone()
            .map(|side| self.entrant(context, &side, spec, teams));
        let winner = match game.winner {
            Some(index) => keys[index].clone(),
            None => {
                let round = game.round.as_str();
                self.problems.push(format!(
                    "{context} {round} {} vs {}: winner unclear; fill it",
                    keys[0], keys[1]
                ));
                "TODO".to_owned()
            }
        };
        let mut fields = vec![
            format!("round = \"{}\"", game.round.as_str()),
            format!("a = {}", quoted(&keys[0])),
            format!("b = {}", quoted(&keys[1])),
            format!("winner = {}", quoted(&winner)),
        ];
        fields.extend(game.votes.map(|[a, b]| format!("votes = [{a}, {b}]")));
        fields.extend(
            game.video
                .as_ref()
                .map(|video| format!("video = {}", quoted(video))),
        );
        format!("  {{ {} }},\n", fields.join(", "))
    }

    /// Registers a side's dancers and crew, and a team battle's `teams` line; returns the entrant key.
    fn entrant(
        &mut self,
        context: &str,
        side: &Side,
        spec: &BattleSpec,
        teams: &mut BTreeMap<String, String>,
    ) -> String {
        let key = side.key();
        // A side the source couldn't name (`?`, a name in another script) is for a human to fill.
        if key.is_empty() {
            return "TODO".into();
        }
        let crew_country = side.members.is_empty().then_some(side.country).flatten();
        let crew = side
            .crew
            .as_deref()
            .map(|crew| self.crew(crew, crew_country));
        let mut members = Vec::new();
        for member in &side.members {
            let dancer = self.dancer(&member.name, member.country);
            // A member with no key (a name in another script) is for a human to add.
            if dancer.is_empty() {
                self.problems.push(format!(
                    "{context}: {:?} has no key; add that dancer by hand",
                    member.name
                ));
                continue;
            }
            if let Some(crew) = &crew {
                let entry = self.dancers.entry(dancer.clone()).or_default();
                entry.crews.insert(crew.clone());
            }
            members.push(dancer);
        }
        if spec.sides() != Sides::Dancers {
            teams
                .entry(key.clone())
                .or_insert_with(|| team_line(side, crew.as_deref(), &members));
        } else if members.len() != 1 {
            self.problems.push(format!(
                "{context}: {:?} is not one dancer; fix that entrant",
                side.names()
            ));
        }
        key
    }
}

fn register(
    names: &mut BTreeMap<String, DraftName>,
    name: &str,
    country: Option<&'static str>,
) -> String {
    let key = key_for(name);
    if key.is_empty() {
        return key;
    }
    let entry = names.entry(key.clone()).or_default();
    if entry.name.is_empty() {
        entry.name = name.to_owned();
    }
    entry.spellings.insert(name.to_owned());
    if let Some(code) = country {
        *entry.countries.entry(code).or_default() += 1;
    }
    key
}

/// `[[battles]]` up to its matches or results; a bracket's size is its first round's.
fn battle_header(spec: &BattleSpec, first_round: Option<Round>) -> String {
    let mut toml = format!(
        "\n[[battles]]\nkey = {}\nname = {}\ngender = \"{}\"\n",
        quoted(&spec.key),
        quoted(&spec.name),
        gender_word(spec.gender.unwrap_or(BattleGender::Mixed))
    );
    if let Some(age) = spec.age {
        toml += &format!("age = \"{}\"\n", age_word(age));
    }
    if let Some(size) = spec.team_size.filter(|size| *size > 1) {
        toml += &format!("team_size = {size}\n");
    }
    if let Some(round) = first_round {
        toml += &format!("bracket_size = {}\n", round.players());
    }
    toml
}

/// `name = …, crew = …, members = […]`: the team's name only when nothing else identifies it.
fn team_line(side: &Side, crew: Option<&str>, members: &[String]) -> String {
    let mut fields = Vec::new();
    if let Some(name) = side
        .name
        .as_deref()
        .filter(|_| members.is_empty() && crew.is_none())
    {
        fields.push(format!("name = {}", quoted(name)));
    }
    fields.extend(crew.map(|crew| format!("crew = {}", quoted(crew))));
    if !members.is_empty() {
        let members: Vec<String> = members.iter().map(|m| quoted(m)).collect();
        fields.push(format!("members = [{}]", members.join(", ")));
    }
    fields.join(", ")
}

/// The words the files spell these with, e.g. `top8`; a new variant fails to compile here.
fn gender_word(gender: BattleGender) -> &'static str {
    match gender {
        BattleGender::Bboy => "bboy",
        BattleGender::Bgirl => "bgirl",
        BattleGender::Mixed => "mixed",
    }
}

fn age_word(age: BattleAge) -> &'static str {
    match age {
        BattleAge::Kids => "kids",
        BattleAge::Adult => "adult",
        BattleAge::Na => "na",
    }
}

fn stage_word(stage: BracketStage) -> &'static str {
    match stage {
        BracketStage::Prelims => "prelims",
        BracketStage::Top64 => "top64",
        BracketStage::Top32 => "top32",
        BracketStage::Top16 => "top16",
        BracketStage::Top8 => "top8",
        BracketStage::Top4 => "top4",
        BracketStage::Top2 => "top2",
        BracketStage::Winner => "winner",
        BracketStage::Na => "na",
    }
}

/// `dancers.toml` lines; a comment marks the dancers seen with several countries.
pub fn dancers_toml(dancers: &BTreeMap<String, DraftName>) -> String {
    toml_lines(dancers, true)
}

/// `crews.toml` lines.
pub fn crews_toml(crews: &BTreeMap<String, DraftName>) -> String {
    toml_lines(crews, false)
}

fn toml_lines(names: &BTreeMap<String, DraftName>, country_required: bool) -> String {
    let mut toml = String::new();
    for (key, entry) in names {
        let mut countries: Vec<(&&str, &u32)> = entry.countries.iter().collect();
        countries.sort_by(|x, y| y.1.cmp(x.1));
        if countries.len() > 1 {
            toml += &format!("# {key}: countries seen {countries:?}; one or two?\n");
        }
        let mut fields = vec![format!("name = {}", quoted(&entry.name))];
        match countries.first() {
            Some((code, _)) => fields.push(format!("country = \"{code}\"")),
            None if country_required => fields.push("country = \"TODO\"".into()),
            None => {}
        }
        let aliases: Vec<String> = entry
            .spellings
            .iter()
            .filter(|s| **s != entry.name)
            .map(|s| quoted(s))
            .collect();
        if !aliases.is_empty() {
            fields.push(format!("aliases = [{}]", aliases.join(", ")));
        }
        if !entry.crews.is_empty() {
            let crews: Vec<String> = entry.crews.iter().map(|c| quoted(c)).collect();
            fields.push(format!("crews = [{}]", crews.join(", ")));
        }
        toml += &format!("{key} = {{ {} }}\n", fields.join(", "));
    }
    toml
}

/// A TOML basic string.
pub fn quoted(text: &str) -> String {
    format!("\"{}\"", text.replace('\\', "\\\\").replace('"', "\\\""))
}
