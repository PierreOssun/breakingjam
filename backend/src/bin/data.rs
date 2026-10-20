//! The `data/` tool: `check` validates the files; `draft-*` draft new ones from Wikipedia or YouTube.

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, bail};
use breakingjam::dataset::{
    self, SeriesRecord, check,
    draft::{Draft, DraftName, crews_toml, dancers_toml},
    wikipedia,
    youtube::{self, Video},
};

const USAGE: &str = "usage: data check [DIR]
       data draft-wikipedia SERIES WIKITEXT_FILE [DIR]
       data fetch-youtube SERIES [DIR]     list the series' channel into DIR/.cache (needs YOUTUBE_API_KEY in DIR/.env)
       data draft-youtube SERIES [DIR]     draft from that list
DIR defaults to the repository's data/.";

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    let repo_data = Path::new(env!("CARGO_MANIFEST_DIR")).join("../data");
    let dir = |given: Option<&&str>| given.map_or(repo_data.clone(), |dir| dir.into());
    match args[..] {
        ["check", ..] if args.len() <= 2 => run_check(&dir(args.get(1))),
        ["draft-wikipedia", series, file, ..] if args.len() <= 4 => {
            let dir = dir(args.get(3));
            let record = series_record(&dir, series)?;
            let source = record
                .wikipedia
                .as_ref()
                .context("the series file has no [wikipedia]")?;
            let draft = wikipedia::draft(&read(Path::new(file))?, &record, source);
            write_draft(&dir, series, draft)
        }
        ["fetch-youtube", series, ..] if args.len() <= 3 => run_fetch(&dir(args.get(2)), series),
        ["draft-youtube", series, ..] if args.len() <= 3 => {
            let dir = dir(args.get(2));
            let record = series_record(&dir, series)?;
            let source = record
                .youtube
                .as_ref()
                .context("the series file has no [youtube]")?;
            let mut videos: Vec<Video> = Vec::new();
            for channel in &source.channels {
                videos.extend(serde_json::from_str::<Vec<Video>>(&read(&cache_path(
                    &dir, channel,
                ))?)?);
            }
            write_draft(&dir, series, youtube::draft(&videos, &record, source))
        }
        _ => bail!(USAGE),
    }
}

fn run_check(dir: &Path) -> anyhow::Result<()> {
    let (data, unreadable) = dataset::load(dir);
    if !unreadable.is_empty() {
        for error in &unreadable {
            println!("error: {error}");
        }
        bail!("{} files could not be read", unreadable.len());
    }
    let report = check::check(&data);
    for warning in &report.warnings {
        println!("warning: {warning}");
    }
    for error in &report.errors {
        println!("error: {error}");
    }
    println!(
        "{} jams, {} dancers, {} crews: {} errors, {} warnings",
        data.events.len(),
        data.dancers.len(),
        data.crews.len(),
        report.errors.len(),
        report.warnings.len()
    );
    if !report.errors.is_empty() {
        bail!("data/ breaks the rules above");
    }
    Ok(())
}

/// Lists the series' channels into `DIR/.cache/youtube/<channel>.json`, so drafts cost no quota.
fn run_fetch(dir: &Path, series: &str) -> anyhow::Result<()> {
    let record = series_record(dir, series)?;
    let source = record.youtube.context("the series file has no [youtube]")?;
    dotenvy::from_path(dir.join(".env")).ok();
    let key = std::env::var("YOUTUBE_API_KEY").context("set YOUTUBE_API_KEY in data/.env")?;
    let runtime = tokio::runtime::Runtime::new()?;
    for channel in &source.channels {
        let videos = runtime.block_on(youtube::fetch(channel, &key))?;
        let path = cache_path(dir, channel);
        fs::create_dir_all(path.parent().unwrap_or(dir))?;
        fs::write(&path, serde_json::to_string_pretty(&videos)?)?;
        println!("listed {} videos into {}", videos.len(), path.display());
    }
    Ok(())
}

/// Writes the dated editions that have no file yet and appends the dancers and crews the files lack.
fn write_draft(dir: &Path, series: &str, draft: Draft) -> anyhow::Result<()> {
    let events = dir.join("events").join(series);
    fs::create_dir_all(&events)?;
    for (edition, toml) in &draft.events {
        let path = events.join(format!("{edition}.toml"));
        // Without a date the file can't be read, and would stop `check` and CI.
        if !toml.lines().any(|line| line.starts_with("starts_on = ")) {
            println!("skipped {edition}: no date found; write its file once you know it");
        } else if path.exists() {
            println!("kept {} (yours now; not redrafted)", path.display());
        } else {
            fs::write(&path, toml)?;
            println!("wrote {}", path.display());
        }
    }
    append_new(&dir.join("dancers.toml"), draft.dancers, dancers_toml)?;
    append_new(&dir.join("crews.toml"), draft.crews, crews_toml)?;
    for problem in &draft.problems {
        println!("check: {problem}");
    }
    Ok(())
}

/// Appends the entries `path` lacks, and names the keys it already had: the same dancer, or a homonym?
fn append_new(
    path: &Path,
    mut names: BTreeMap<String, DraftName>,
    lines: fn(&BTreeMap<String, DraftName>) -> String,
) -> anyhow::Result<()> {
    let mut existing = if path.exists() {
        read(path)?
    } else {
        String::new()
    };
    if !existing.is_empty() && !existing.ends_with('\n') {
        existing.push('\n');
    }
    let known: toml::Table =
        toml::from_str(&existing).with_context(|| format!("{}", path.display()))?;
    let reused: Vec<&String> = names
        .keys()
        .filter(|key| known.contains_key(*key))
        .collect();
    if !reused.is_empty() {
        println!(
            "check: reused from {}: {reused:?}; same ones, or homonyms?",
            path.display()
        );
    }
    // Only new keys are appended, so say what the draft saw of the others.
    for (key, entry) in names
        .iter()
        .filter(|(key, e)| known.contains_key(*key) && !e.crews.is_empty())
    {
        println!(
            "check: {key} was seen dancing for {:?}; add them to its crews",
            entry.crews
        );
    }
    names.retain(|key, _| !known.contains_key(key));
    fs::write(path, existing + &lines(&names))?;
    println!("added {} to {}", names.len(), path.display());
    Ok(())
}

fn series_record(dir: &Path, series: &str) -> anyhow::Result<SeriesRecord> {
    let path = dir.join("series").join(format!("{series}.toml"));
    toml::from_str(&read(&path)?).with_context(|| format!("{}", path.display()))
}

fn cache_path(dir: &Path, channel: &str) -> PathBuf {
    dir.join(".cache/youtube").join(format!("{channel}.json"))
}

fn read(path: &Path) -> anyhow::Result<String> {
    fs::read_to_string(path).with_context(|| format!("cannot read {}", path.display()))
}
