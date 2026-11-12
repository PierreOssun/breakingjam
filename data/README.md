# Curated data

Real jams with their results, kept as files so every fact is reviewed in a PR and every fix has a history. The app shows these jams read-only; a mistake is fixed here, never in the app.

```
data/
  dancers.toml                      # every dancer the jams name, by key: the only place a name is spelled
  crews.toml                        # every crew, by key
  series/<series>.toml              # a recurring jam: its name and where its editions were drafted from
  events/<series>/<edition>.toml    # one jam per file, e.g. events/red-bull-bc-one/2019.toml
  drafts/<series>/<edition>.toml    # editions held back until a missing fact is found; never imported
  places/                           # the GeoNames cities a search can name (its own README)
```

The dev seed (`cargo run --bin seed`, from `backend/`) imports every jam here that passes `check` into a fresh local or UAT database. Production gets them through the **Import data** workflow (`cargo run --bin data -- import OWNER_EMAIL`), which adds only the jams, dancers and crews no earlier run wrote: a new file reaches a database that already has the others, but a fix to a jam already imported does not (fix it on the site, as the team).

Check everything, as CI does:

```sh
cargo run --bin data -- check      # from backend/
```

## Format

**`dancers.toml`**, one line per dancer:

```toml
menno = { name = "Menno", country = "NL" }
lilou = { name = "Lilou", country = "FR", country2 = "DZ" }
hiro10 = { name = "Hiro10", country = "JP", aliases = ["Hiro 10"] }
```

- **Keys** are lower-case words joined by `-` and never change: the import identifies a dancer by key.
- **Two spellings of one dancer:** keep one key, put the other spelling in `aliases`, and replace the old key in the jam files.
- **Two dancers with one name** get two keys and the same `name`, e.g. `benny` and `benny-flying-steps`.
- **Crews:** `crews = ["formless-corp"]` lists a dancer's crews; a dancer may have none, one or several.
- **Unknown country:** `country = "ZZ"` (the ISO code for an unknown region). The site shows a globe instead of a flag.
- **Look:** `look = "bboy"` or `look = "bgirl"` picks the generated avatar. Without it the avatar is drawn from the dancer's id; battles never change it.
- **Every line is a page:** the import writes every dancer, in a jam or not, and stores its key (`dancers.data_key`), so `GET /api/dancers/by-key/{key}` finds them in any environment (the Team page links its people this way). A dancer in no jam still gets a `data check` warning, as it is often a leftover spelling.

**`crews.toml`**, the same way:

```toml
formless-corp = { name = "Formless Corp", aliases = ["Formless Corps"] }   # country is optional
```

**A jam**, e.g. `events/red-bull-bc-one/2019.toml`:

```toml
name = "Red Bull BC One World Final 2019"
starts_on = 2019-11-09
# ends_on = 2019-11-10          # for jams over several days
timezone = "Asia/Kolkata"
city = "Mumbai"
country = "IN"
venue = "…"                     # optional
lat = 19.0760                   # optional, with lng: the venue, else the city; puts the jam on the map
lng = 72.8777
sources = ["https://en.wikipedia.org/wiki/Red_Bull_BC_One"]
judges = ["lil-g", "poe-one"]
mcs = ["amjad"]
djs = ["dj-smirnoff"]

[[battles]]
key = "bboy"                    # unique in the jam; never changes
name = "1v1 Bboy"
gender = "bboy"                 # bboy, bgirl or mixed
bracket_size = 16
matches = [
  { round = "top16", a = "bumblebee", b = "stripes", winner = "bumblebee", votes = [4, 1] },
  # …
  { round = "final", a = "menno", b = "killa-kolya", winner = "menno", votes = [3, 1],
    video = "https://www.youtube.com/watch?v=…", at = 3725 },
]
```

- **Record the matches, not the results.** Each dancer's stage, place and video follow from who won which match, so a result can't contradict the bracket.
- `round` is `top64` … `top16`, `top8`, `top4`, `final`, or `third` for a small final.
- `votes` are the judges' votes for `a` and `b`. `video` is the YouTube link of the match, and `at` the second it starts in a long video.
- **When the bracket is unknown**, list the standings instead of `matches`:
  ```toml
  results = [{ entrant = "omar", reached = "winner" }, { entrant = "ronnie", reached = "top2" }]
  ```

**Team battles** (2v2, crew battles) set `team_size`, and their `a`, `b` and `winner` are keys of the battle's `teams`:

```toml
[[battles]]
key = "2v2"
name = "2v2"
gender = "mixed"
team_size = 2
bracket_size = 16
matches = [
  { round = "final", a = "gekkon-tiger", b = "alvin-grom", winner = "alvin-grom", video = "https://youtu.be/P_UiHV_rs7E" },
]

[battles.teams]
alvin-grom = { crew = "formless-corp", members = ["alvin", "grom"] }   # a crew's duo
gekkon-tiger = { members = ["gekkon", "tiger"] }                        # a duo
dynamo = { name = "Dynamo" }                                            # a team known by name only
```

- A team needs a name, a crew or members. Members are optional, since sources often name only the crew.
- A dancer plays for one team per battle. Kids battles add `age = "kids"`.
  `reached` is `winner`, `top2`, `top4` … `prelims`. Add `rank = 3` for a known third place.

## Describing a series to the drafting tools

`series/<series>.toml` says where a series' editions come from and how its sources name battles:

```toml
name = "Outbreak Europe"
city = "Banská Bystrica"          # for series that don't travel: drafts start from it
country = "SK"
timezone = "Europe/Bratislava"

[wikipedia]
page = "https://en.wikipedia.org/wiki/Outbreak_Europe"
untitled = "bboy"                 # the battle a bracket under no battle heading belongs to
battles = [
  { key = "bboy", name = "1v1 Bboy", gender = "bboy", words = ["b-boy"], table = "Winners", places = { "1vs1 Breaking" = "winner" } },
  { key = "2v2", name = "2v2", team_size = 2, table = "Winners", places = { "2vs2 Breaking" = "winner" } },
]
```

Each battle can set:
- `key`, `name`, `gender`, `age`, and `team_size`, as in a jam file.
- `sides`: `dancers`, `teams` or `crews`. It follows from `team_size` when absent; crew battles say `crews`.
- `words`: what names this battle in a heading or a video title, e.g. `b-girl`, `kids`, `2v2`.
- `table` and `places`: the results table under the heading containing `table`. Each `places` column maps to the stage its names reached (`winner`, `top2`, `top4`…), and a cell's names are split at `/`.

## Drafting from Wikipedia

```sh
curl -sL 'https://en.wikipedia.org/w/index.php?title=Red_Bull_BC_One&action=raw' -o /tmp/bc-one.wikitext
cargo run --bin data -- draft-wikipedia red-bull-bc-one /tmp/bc-one.wikitext
```

- **Editions** come from the headings that start with a year (`=== 2019 ===`, `== 2016 season ==`). One year's sections are joined.
- **Brackets** are read from `{{Round16}}`, `{{#invoke:bracket|…}}` and `{{32TeamBracket}}` templates. The winner is the bold name, or else the bold or higher score.
- **Results tables** give placings for years without a bracket. Where both exist, the champions are compared.
- **Dates, places and staff** come from the text: "took place on November 9", `Location:` lines, and `'''Judges:'''` lists.

The draft writes the editions that have no file yet, leaving out those whose date it can't find, and appends the dancers and crews the files lack. It never overwrites a file: once written, a file is yours. It prints what it couldn't read: a missing date, an unclear winner, an unknown flag, a cell with no Latin name. Go through the files, fix what the sources got wrong (citing extra sources in `sources`), and run `check` until it passes.

## Drafting from YouTube

For channels whose battle videos are titled one match each (`A vs B [semi] // … DPC Jam 2025`):

```toml
[youtube]
channels = ["UCDpTV6PL7WoPdHWPl-LoWXw", "UCySwo6Ue4QxxsYDvIBdwynw"]   # every channel that filmed the series
title = "Unbreakable"                 # what a title must contain, spacing and case aside
exclude = ["who's the one"]           # titles to leave out: other events, other dance styles
ignore = ["bboy world"]               # phrases removed before reading, e.g. a channel's signature
battles = [
  { key = "crew", name = "Crew battle", sides = "crews", words = ["crew"] },
  { key = "bboy", name = "1v1 Bboy", gender = "bboy", words = ["bboy", "1on1"] },
]
```

Put `YOUTUBE_API_KEY=…` in `data/.env` (git-ignored), then, from `backend/`:

```sh
cargo run --bin data -- fetch-youtube unbreakable   # lists the channels into data/.cache (1 quota unit per 50 videos)
cargo run --bin data -- draft-youtube unbreakable   # drafts from those lists, as often as you like, at no cost
```

To find a series' channels, or videos no channel list holds, search all of YouTube (101 quota units a query):

```sh
cargo run --bin data -- search-youtube "IBE 2005"   # id, day, channel id, channel, title, length, description
```

**How titles are read:**
- **Parts:** a title splits into parts at `//`, `|`, arrows (`▶ ◀`), ` / ` and ` - `.
- **Round:** from words like `top 16`, `semi`, `eight-final` or `final`.
- **Tags:** bracketed tags such as `[BGIRL TOP 16]` or `(kids semifinal)` are dropped.
- **Battle:**
  - It comes from its `words`. When several battles match, the longest word wins, so `KIDZ CREW` names the kids' crew battle, not the crew battle.
  - A title naming none goes to the battle of any match it shares an entrant with, through chains of such matches. Otherwise it goes to the battle without words, else to the first.
- **Edition:** the year in the title, else the upload year.
- **Sides:**
  - A side is members joined by `&`, a crew or members in brackets, a `[country]` tag, or a lone name.
  - A lone name is a dancer, a team or a crew, as the battle's `sides` says.
- **Capitals:** titles written all in capitals get ordinary capitals.
- **Re-uploads:** the same match uploaded twice is kept once.

**Winners:**
- Whoever plays the next round won.
- A final's winner comes from a title announcing it ("congrats to Grom & Alvin for winning…"); otherwise it stays `TODO`.
- A spelling that differs between rounds ("MaxMax" for "Madmax") leaves that winner unclear. Fix the spelling, then fill the winner.

**What drafts can't know, and leave for you:**
- **The date:** `starts_on` is the Saturday before the first battle video went up, marked `check`.
- **Missing matches:** every battle not on YouTube. `check` reports incomplete rounds until they're filled in, or until the battle switches to `results`.
- **Countries:** dancers' countries, unless a title tags them. Set `ZZ` for one you can't find.
- **Homonyms:** whether a reused key is the same dancer or a homonym.

## Red Bull BC One

Drafted from Wikipedia on 2026-10-19. The 22 World Finals from 2004 to 2025 have full brackets: bboy every year, and bgirl from 2018. All 30 champions match Wikipedia's winners table.

- **Seven dates** not on Wikipedia come from the [and8.dance](https://and8.dance) event pages (2004–2007, 2014, 2018) and Red Bull (2020); they are cited in `sources`.
- **Merged:** Fresh Bella/Freshbella and Hiro 10/Hiro10.
- **Split:** Benny of Flying Steps (DE, a judge) from Benny (ZA, a competitor).
- **Two countries:** Lilou (FR, DZ) and Lagaet (PT, FR).
- **Still open:**
  - the countries of 2005's DJ Ace and DJ Billy Brown;
  - whether bgirl Mess is Dutch or Russian (flagged both ways);
  - none: every one of the 437 battles has its video since 2026-11-11 (`reports/battle-videos.md`).

## DPC Jam and Battle of Sun

DPC Jam 2025–2026 and Battle of Sun 2026 were drafted from YouTube on 2026-10-19: [stance](https://www.youtube.com/channel/UCgiz3Pm3FBhDyy3g_fP5OVA) for DPC Jam, [Skillzoo Production](https://www.youtube.com/channel/UCBDSkBbTmI63mIp6UNt09vA) for Battle of Sun. The earlier editions were added on 2026-11-11 (`reports/dpc-jam.md`, `reports/battle-of-sun.md`).

**DPC Jam** (Zurich, the D.Point.C crew's anniversary 2v2): every edition from 2014, the first, to 2026; 2020 was cancelled.
- **What's there:** a full top 16 bracket every year from 2015, nearly every battle on [the organiser's channel](https://www.youtube.com/channel/UCqzSbOMDzVX1lVia0KAxEbg) (two quarter-finals, 2015 and 2024, are unfilmed and follow from the rest); 2014 as placings (5 of 8 top 16 battles filmed) with its 7 to Smoke; DPC Jam Europe 2025 (`2025-europe.toml`, the World Final's qualifier at Sneakerness) as placings, every battle filmed but its winner unpublished.
- **Facts:** dates, venues and staff from and8.dance from 2017, and from the organiser's descriptions before; 2014's and 2015's dates are the Saturday before the first upload, marked `check`. and8 titles 2019 "Kappel am Albis" but gives GZ Heuried as its venue.
- **Spellings unified before drafting:** Toshkin/Toschkin, El Mouwahidin(e), TruCru, Lilzoo, Chaulin, Schlag (Shlag), Aslan a.k.a Bootuz (`bootuz`).
- **Still open:** the kids battles (and8 has their rankings from 2022), DPC Europe 2025's winner, most new dancers' countries, and the homonyms in `reports/name-review.md`.

**Battle of Sun** (Saint-Louis, by Ossun Crew): 2018 (Vol. III, a full top 16 filmed by Breakingstras, SBX champion), 2025 (Battle of Sun X: date, venue and judges, no result found) and 2026 (2v2 top 16 and kids top 8).
- **Drafts** in `data/drafts/battle-of-sun/`: 2013 and 2014 (friends' battles by Ossun Crew, no date), 2015 (the first public edition: five battles, no date or champion), 2017 (one listing) and 2021 (two battles, no date).
- **Still open:** the winners of both 2026 finals; whether the 2026 kids battle is 1v1 (assumed); editions 2019, 2020 and 2022–2024, for which nothing was found; the organiser's numbering (2018 is the third, 2021 the fourth, 2025 the tenth).

## The Floor is Flava

Added on 2026-11-11 (`reports/floor-is-flava.md`). Brussels, at C12, by Future Art Movement: an international 2v2 of 10 invited and 6 qualified duos, every November from 2019 except 2020.

- **What's there:** 2019 and 2021–2024, each a full top 16 bracket with every battle filmed by [LawkSam](https://www.youtube.com/channel/UCDpTV6PL7WoPdHWPl-LoWXw), each winner in the video's description, judges and DJs from the judges' showcase and final descriptions.
- **Unified before drafting:** crew-named sides replaced by the duo their descriptions name (Belgium With Attitude = Tirock & Lucky, The Floorriorz = Nori & Satoru, Predatorz = Amir & Dias, and the 2019 crews), "Metal" as `jerry-the-metall` (3:16), "Mighty Jimm", "Djibril & Fabab".
- **Left out:** the preliminaries and qualifiers (2021–2022), the 2022 and 2023 "Cypher King" four-way battles, and the 2024 Benelux qualifier.
- **Still open:** 2023's date (the Saturday before the final's upload, marked `check`); 2021's DJs and hosts (TBA on and8); any 2025 edition (none found).

## Outbreak Europe and Battle of the Year

Drafted from Wikipedia on 2026-10-19.

**Outbreak Europe:** 17 editions, 2010–2026.
- **What's there:** 1v1 brackets for 2014–2018 (top 16) and 2023–2026 (bboy and bgirl, top 32). The winners of the 1v1, bgirl, 2v2 and kids battles come from the winners table for every year.
- **Places:** all in Banská Bystrica (from the series file); check that it holds every year.
- **Still open:**
  - dates from 2019 on;
  - the kids winners of 2017–2019, who were duos (the kids battle is drafted as 1v1);
  - three spellings that differ between rounds (e.g. Phil Wizzard/Phil Wizard).

**Battle of the Year:** 1990–2025.
- **What's there:**
  - crew battle placings every year: 1st to 4th until 2005, then 1st, 2nd and the two losing semi-finalists;
  - the 1v1 bracket in 2013–2016, 2019 and 2023, and its champion and runner-up in other years;
  - the bgirl champions, a 2v2 most years.
- **Left out:** the crew World Final brackets (a six-crew format with byes) and the crew lists; the placings table covers the result.
- **From [battleoftheyear.net](https://battleoftheyear.net/en/editions):**
  - the edition pages give the city, venue and judges for 2019, 2021, 2022, 2023 and 2025;
  - the history page gives the cities of 1990 (and its date, 9 June), 2000, 2001–2009 ("nine years in Braunschweig") and 2010–2012 (Montpellier).
  - Each file cites its page.
- **Still open:**
  - every date but 1990's;
  - the cities of 1991–1999 (probably Hannover, but the site doesn't say) and of 2013–2018;
  - the 2023 1v1's "?" opponent and 革命前夜, a name with no Latin letters;
  - Pac Pac/PacPac.

## Unbreakable and Freestyle Session

Drafted from YouTube on 2026-10-19.

**Unbreakable** (Belgium): filmed by LawkSam (2021, 2026) and BBOY WORLD (2011–2018). Merged with the [hall of fame](https://unbreakable.be/20-years/#hall-of-fame), which gives every edition's venue, city and champions.
- **Editions:** 2005–2007, 2009–2019, 2021–2023, 2025 and 2026. 2008 didn't take place, and 2020 was cancelled.
- **From the hall of fame:**
  - the champions of the 1v1 (from 2010), crew, kids, kids crew, bgirl (a 7-to-smoke 2016–2019) and 2v2 (2005–2009) battles, with their countries;
  - the final winners of the brackets drafted from videos.
- **Merged:**
  - Bruce Allmighty into Bruce Almighty;
  - Team Shmetta into Shmetta Skwad;
  - Battledroids into Battle Droids;
  - UKkrazy into UKrazy;
  - LO as an alias of Legiteam Obstruxion;
  - RhythmBox into Rhythm Box.
- **Moved:** the 2017 crew and kids crew finals, drafted into the 1v1, became results of their own battles.
- **Still open:**
  - **Dates:** the videos give the Saturday-before-first-upload dates (marked `check`); 2005–2010 have no videos.
  - **2023's city:** Leuven, not on the page (it was the WDSF World Championships edition).
  - **2016's kids crew:** the hall of fame names Battle Droids, but the video is titled "HFC vs Infilaskills [kids crew final]".
  - **2017 round labels:** it calls the top 16 "Top 8" and the top 8 "Quarter-Final".
  - **Incomplete brackets** wherever videos are missing.
  - **2013 kids:** Louis (DK) is keyed `louis-dk`, apart from the French Louis.

**Freestyle Session:** filmed by stance; the World Final only, 2014–2025.
- **Left out:** regional events, qualifiers, other dance styles and the 40+ category.
- **The main battle is drafted as a crew battle,** with 1v1, bgirl and kids beside it.
- **Formats changed over the years** (3v3, 2v2 bgirl in 2025…), and many videos are missing, so expect the most review here.
- **City:** unknown.

## Groove Session

Harvested on 2026-11-09 from the battle videos of the organiser, New Dance TV, LawkSam and stance (`reports/groove-session.md`). Neuchâtel, 2017–2026; no edition in 2020 or 2021, and 2026 was the last.

- **What's there:** the 2v2 kid & adult, each duo a star and a kid drawn at random, every year; the crew battle from 2022. Full brackets with every video for 2017, 2018 and 2023–2026; placings with videos for the 2019 and 2022 2v2s and the 2022 crew battle.
- **Still open:** the 2022 crew champion; the two missing top 16 videos; judges of 2023, 2025 and 2026; crew members; the 2016 edition.

## Red Bull BC One Cyphers: Italy, Spain, Portugal, Belgium, Germany, Holland, UK

Harvested on 2026-11-09, 2018–2026 (`reports/red-bull-bc-one-cyphers.md`). Luxembourg has no Cypher.

- **What's there:** 34 jams; full brackets where every battle was filmed (Belgium 2024–2026, Holland 2019, top 4 brackets for most 2018–2021 editions), otherwise the finalists and semi-finalists with their videos.
- **Drafts:** 17 editions whose date or city rests on one source are in `data/drafts/`, battles included; confirm the missing fact and move them.
- **Still open:** Spain 2022's b-boy champion (Grazy or Minijoe), the champions listed as single-source in the report, and every judge, MC and DJ.
