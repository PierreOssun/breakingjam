//! The `data/` tool: `check` validates the files; `draft-*` draft new ones from Wikipedia or
//! YouTube; `import` adds the jams to the database; `places` loads the GeoNames cities into it.

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, bail, ensure};
use breakingjam::dataset::{
    self, SeriesRecord, check,
    draft::{Draft, DraftName, crews_toml, dancers_toml},
    wikipedia,
    youtube::{self, Video},
};
use breakingjam::{
    dataset::import,
    db,
    domain::{
        place::{NewPlace, parse_geonames_line},
        user::Role,
    },
};

const USAGE: &str = "usage: data check [DIR]
       data draft-wikipedia SERIES WIKITEXT_FILE [DIR]
       data fetch-youtube SERIES [DIR]     list the series' channel into DIR/.cache (needs YOUTUBE_API_KEY in DIR/.env)
       data draft-youtube SERIES [DIR]     draft from that list
       data search-youtube QUERY           print the videos matching QUERY, across all of YouTube (101 quota units)
       data import OWNER_EMAIL [DIR]       add DIR's jams that no earlier import wrote to the database
                                           (DATABASE_URL), owned by that seed_admin or admin account
       data places [FILE]                  replace the database's places (DATABASE_URL) with FILE,
                                           by default data/places/cities15000.tsv
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
        ["search-youtube", query] => run_search(&repo_data, query),
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
        ["import", owner, ..] if args.len() <= 3 => import_data(&dir(args.get(2)), owner),
        ["places", ..] if args.len() <= 2 => {
            let default = repo_data.join("places/cities15000.tsv");
            import_places(&args.get(1).map_or(default, PathBuf::from))
        }
        _ => bail!(USAGE),
    }
}

/// Adds the jams of `dir` that no earlier import wrote, with their dancers and crews, in one
/// transaction; what is already there stays as the site left it.
fn import_data(dir: &Path, owner: &str) -> anyhow::Result<()> {
    let (data, unreadable) = dataset::load(dir);
    dotenvy::dotenv().ok();
    let url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    tokio::runtime::Runtime::new()?.block_on(async {
        let pool = sqlx::PgPool::connect(&url).await?;
        let owner = db::users::find_credentials(&pool, owner)
            .await?
            .with_context(|| format!("no account {owner}: sign up with it first"))?
            .user;
        // The jams are past, so locked for an ordinary organiser; the team keeps them editable.
        ensure!(
            owner.role >= Role::SeedAdmin,
            "{} must be a seed_admin or admin to own the jams",
            owner.email
        );
        let mut tx = pool.begin().await?;
        let imported = import::insert_all(&mut tx, &data, owner.id).await?;
        tx.commit().await?;
        for error in &unreadable {
            println!("left out: {error}");
        }
        for why in &imported.skipped {
            println!("left out: {why}");
        }
        println!(
            "{} jams added ({} already there), {} dancers, {} crews, owned by {}; {} left out",
            imported.events,
            imported.events_before,
            imported.new_dancers,
            imported.crews,
            owner.display_name,
            unreadable.len() + imported.skipped.len(),
        );
        anyhow::Ok(())
    })
}

/// Replaces the places of the database at `DATABASE_URL` (the environment, else `backend/.env`)
/// with the cities of a GeoNames file.
fn import_places(file: &Path) -> anyhow::Result<()> {
    let text = read(file)?;
    let places: Vec<NewPlace> = text.lines().filter_map(parse_geonames_line).collect();
    let skipped = text.lines().count() - places.len();
    ensure!(!places.is_empty(), "no place in {}", file.display());
    dotenvy::dotenv().ok();
    let url = std::env::var("DATABASE_URL").context("DATABASE_URL must be set")?;
    tokio::runtime::Runtime::new()?.block_on(async {
        let pool = sqlx::PgPool::connect(&url).await?;
        let names = db::places::replace_all(&pool, &places).await?;
        println!(
            "{} places, {names} names ({skipped} lines skipped)",
            places.len()
        );
        anyhow::Ok(())
    })
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
    let key = youtube_key(dir)?;
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

/// Prints what YouTube finds for `query`, one video per line, so a series' channels can be found.
fn run_search(dir: &Path, query: &str) -> anyhow::Result<()> {
    let key = youtube_key(dir)?;
    let videos = tokio::runtime::Runtime::new()?.block_on(youtube::search(query, &key))?;
    for video in videos {
        println!(
            "{}\t{}\t{}\t{}\t{}\t{}\t{}",
            video.id,
            video.published,
            video.channel_id,
            video.channel,
            video.title,
            video.duration,
            video
                .description
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" "),
        );
    }
    Ok(())
}

fn youtube_key(dir: &Path) -> anyhow::Result<String> {
    dotenvy::from_path(dir.join(".env")).ok();
    std::env::var("YOUTUBE_API_KEY").context("set YOUTUBE_API_KEY in data/.env")
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
