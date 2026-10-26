# BreakingJam — Seed harvest brief: top 40 breaking events (2011–2026)

Oct 26, 2026 · @POssun

## Purpose and scope

Claude Code: harvest editions, categories, results and battle videos for the 40 events below, one event at a time, writing straight into BreakingJam's existing data model. Each event ends with a two-line `report.md`. This brief extends `claude/seed-data-harvest-plan.md` (same pipeline and rules) with a curated event list and every source URL found so far; it replaces the plan's CSV review step.

Two windows:

- **Phase A, Sept 2024 to today:** every edition of the active events, full brackets where available, battle video URLs. This is the harvest plan's original scope and feeds the map at launch.
- **Phase B, 2011 to Aug 2024 backfill:** winners and finalists per edition (Top 2, Top 4 where published), from Wikipedia tables and federation pages. Full brackets only where a structured source exists.

The ranking is editorial (level of the field, international draw, weight on a dancer's record). It sets harvest priority, not truth. Source URLs were found via web search on 26 Oct 2026 and most have not been opened yet: treat each one as a lead to fetch and verify.

## Rules

Wrong results are worse than missing ones: only confirmed facts go into the model.

- **Facts only:** names, dates, cities, venues, placements, URLs. Never copy photos, posters, video files or article text.
- **Provenance:** every source used is listed in the event's `report.md`. Fill a source field only if the model already has one.
- **Confidence:** write a fact only if it comes from an official source, a results page, or two sources that agree. Anything less stays out of the model and goes on the report's "Not found" line as unconfirmed.
- **Rate limits:** worlddancesport.org and organiser sites at 1 request/s, every page cached locally, robots.txt respected.
- **YouTube:** Data API v3 within the 10k units/day quota. Store URLs only; videos stay embed-only.
- **and8.dance:** richest results source, but a competitor (see `claude/competitor-and8.md`). Check their terms before fetching anything; until then, use only for manual cross-checks, never bulk import.
- **Instagram:** never scraped.
- **One lineage, one event:** renamed or relocated events stay one event with editions (Chelles Battle Pro becomes Battle Pro; BOTY International and BOTY World Final are one lineage).
- **Names:** match existing dancers and crews in the model first; create a new one only when nothing matches. Ambiguous matches go to Pierre's review sheet (harvest plan step 4).

## Output: existing model + one report per event

Write into BreakingJam's existing data model. No CSVs, no new tables, no new fields.

- **Read the model first:** ARCHITECTURE and the entity / migration code in the repo. Map each fact onto it: the event as a jam, then its categories, entries, results and battles, with `video_url` on each battle.
- **Use the backend's existing write path** (the `seed_admin` import or admin API), not raw SQL. If no path fits a fact, stop and ask Pierre.
- **No home in the model** (source URL, conflicts, unconfirmed facts): it goes in the report, never in a new field.

After each event, write `reports/<event-slug>.md` with exactly two lines:

```markdown
- Sources and what was found: <source> — <what it gave>; <source> — <what it gave>
- Not found: <missing editions, categories, brackets, videos; unconfirmed facts left out>
```

## Europe: top 20

Phase column: A+B = active, harvest Sept 2024+ in full and backfill earlier editions; B = ended or one-off, backfill only; A = new or upcoming. "Verify" means the cell comes from memory.

| # | Event | Place | Categories | Years in scope | Status | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Olympic Games Paris 2024 | Paris, FR (Place de la Concorde) | B-Boy 1v1, B-Girl 1v1 | Aug 2024 | one-off | B |
| 2 | Red Bull BC One World Final, European editions | Moscow 2011, Paris 2014, Rome 2015, Amsterdam 2017, Zurich 2018, Salzburg 2020, Gdańsk 2021, Paris 2023 | B-Boy 1v1; B-Girl 1v1 from 2018 (verify) | 2011–2023 | active, host moves yearly | B |
| 3 | Battle of the Year International / World Final | Montpellier, FR (2010 to about 2023) | crew showcase + crew battle; 1v1 and kids added later | 2011–2024 | active, moved to Korea 2025 | B (2024 location: verify) |
| 4 | Outbreak Europe (inside The Legits Blast) | Banská Bystrica, SK | 2v2, B-Boy 1v1, B-Girl 1v1, kids, footwork/power/toprock 1v1, rep your country | 2011–2026 | active, late July | A+B |
| 5 | Battle Pro (formerly Chelles Battle Pro) | Chelles, FR; Lille 2018; now Théâtre du Châtelet, Paris | crew; Undisputed 1v1 2014–2017; 2v2; kids | 2011–2026 | active, October | A+B |
| 6 | UK B-Boy Championships World Finals | London (to 2019); Manchester 2026 | crew, solo 1v1, B-Girl 1v1 from 2019, other styles | 2011–2026, no 2015 edition | active | A+B |
| 7 | The Notorious IBE (Undisputed Masters host 2022–2024) | Heerlen, NL | crew, solo men, solo women, junior | 2011–2026 | active, August | A+B |
| 8 | WDSF World Breaking Championship 2023 | Leuven, BE | B-Boy 1v1, B-Girl 1v1 | 2023 | one-off host | B |
| 9 | Olympic Qualifier Series Budapest | Budapest, HU | B-Boy 1v1, B-Girl 1v1 | Jun 2024 (verify) | one-off | B |
| 10 | European Games 2023 | Kraków, PL | B-Boy 1v1, B-Girl 1v1 | 2023 | one-off | B |
| 11 | World Battle (MXM) | Porto / Matosinhos, PT | verify | 2011–2026 | active, 20th edition 2025 | A+B |
| 12 | Snipes Funkin Stylez | Germany, city to verify | 1v1, 2v2 (verify) | 2011–? | unknown | B |
| 13 | Floor Wars | Copenhagen, DK | crew (verify) | 2011–? | unknown | B |
| 14 | Hip Opsession | Nantes, FR | crew battle (verify) | 2011–? | unknown | A+B |
| 15 | Break The Floor International | Cannes, FR | crew + solo hybrid (verify) | 2011–? | unknown | B |
| 16 | WDSF European Breaking Championship | Sochi 2021, Manchester 2022, Almería 2023, later hosts TBD | B-Boy 1v1, B-Girl 1v1 | 2021–2026 | active, annual | A+B |
| 17 | Undisputed Masters, London and Amsterdam stops | London, UK; Amsterdam, NL | solo 1v1 | 2021–2022 | series | B |
| 18 | FISE Montpellier International Breaking Battle | Montpellier, FR | B-Boy 1v1, B-Girl 1v1, 2v2, youth | 2024–2026 | active, May | A |
| 19 | BOTY France (national qualifier) | Montpellier, FR (Zénith Sud) | crew showcase + battle | 2011–2026 | active | A |
| 20 | WDSF World Championships Paris | Paris, FR (adidas Arena) | B-Boy 1v1, B-Girl 1v1, plus hip hop | 4–6 Dec 2026 | upcoming | A, after the event |

## Outside Europe: top 20

Same columns as the Europe table. Row 20 is a league, not a jam: harvest it last, if at all.

| # | Event | Place | Categories | Years in scope | Status | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Red Bull BC One World Final, other editions | Rio 2012, Seoul 2013, Nagoya 2016, Mumbai 2019, New York 2022, Rio 2024, Tokyo 2025, Toronto 2026 | B-Boy 1v1, B-Girl 1v1 | 2012–2026 | active; Toronto on 29 Nov 2026 | A+B |
| 2 | Battle of the Year World Final, Korea | Hwaseong, KR | crew, 1v1, kids battle royale | 2025–2027 | active, September | A |
| 3 | R16 Korea | Seoul; Uijeongbu 2015 | crew (4 per crew from 2015), solo | 2011–2015 | ended after 2015 (verify) | B |
| 4 | Freestyle Session | USA, city to verify | 3v3 crew (formats vary); 1v1 from 2014 | 2011–? | active up to 2022 at least; later editions to verify | A+B |
| 5 | WDSF World Breaking Championships, Asian editions | Seoul 2022, Chengdu 2024, Kurume 2025 | B-Boy 1v1, B-Girl 1v1 | 2022–2025 | rotating host | A+B |
| 6 | Asian Games 2023 | Hangzhou, CN | B-Boy 1v1, B-Girl 1v1 | 2023 | one-off | B |
| 7 | Undisputed World Final | Tokyo, JP (March); qualifiers in São Paulo, Cape Town and others | solo men, solo women, 5v5 crew | 2025–2026 | active | A |
| 8 | Silverback Open Championships | Philadelphia, US | open 1v1, 3v3, B-Girl 1v1, U14 1v1 | 2014–2018 | ended 2018 | B |
| 9 | Youth Olympic Games 2018 | Buenos Aires, AR | B-Boy, B-Girl, mixed team (verify) | 2018 | one-off | B |
| 10 | Olympic Qualifier Series Shanghai | Shanghai, CN | B-Boy 1v1, B-Girl 1v1 | May 2024 (verify) | one-off | B |
| 11 | BBIC (Bucheon B-Boy International Championship) | Bucheon, KR | 4v4 crew, breaking 1v1, all-style 1v1, all-style performance | 2016–2026 | active to 2023 at least | A+B |
| 12 | Pan American Games 2023 | Santiago, CL | B-Boy 1v1, B-Girl 1v1 | 2023 | one-off | B |
| 13 | The World Games 2025 | Chengdu, CN | B-Boy 1v1, B-Girl 1v1 (verify) | 2025 | one-off | A |
| 14 | Outbreak World Finals | Orlando, US | various | 2011–2013 | ended; moved to Slovakia | B |
| 15 | Radikal Forze Jam | Singapore crew's jam; recent editions in Vietnam (verify) | verify | 2011–2026 | active | A+B |
| 16 | Bboy City | Austin, US | verify | 2011–? | unknown | B |
| 17 | Rock Steady Crew Anniversary | New York, US | verify | 2011–? | unknown | B |
| 18 | Mighty 4 | San Francisco, US | verify | 2011–? | unknown | B |
| 19 | B-Boy Park | Tokyo, JP | free outdoor festival, battles (verify) | 2011–? | unknown | B |
| 20 | D.League (pro league) | Tokyo, JP | team league; KOSÉ 8ROCKS is the breaking team | 2021–2026 | active | last, optional |

## Source index

Every URL surfaced so far, grouped by event. Reliability: high = results table or official page; medium = press or sponsor release; low = secondary aggregator, cross-check only.

| Event | Source | What it holds | Reliability |
| --- | --- | --- | --- |
| Red Bull BC One | [Wikipedia: Red Bull BC One](https://en.wikipedia.org/wiki/Red_Bull_BC_One) | Hosts and winners per year, incl. 2025 Tokyo and 2026 Toronto | high |
| Red Bull BC One | [Red Bull: BC One event series](https://redbull.com/ie-en/event-series/bc-one) | Official series page; 2024 Rio winners; 2025 date | high |
| Red Bull BC One | [Shifter: 2026 World Final Toronto](https://shiftermagazine.com/culture/2026-red-bull-bc-one-world-final) | Toronto venue and date; recent host list | medium |
| Red Bull BC One | [Billboard Canada: Toronto host city](https://ca.billboard.com/culture/events/toronto-host-city-2026-red-bull-breakdancing-final) | Tokyo 2025 attendance; Toronto announcement | medium |
| Red Bull BC One | [Red Bull: 2021 World Final line-up](https://www.redbull.com/int-en/red-bull-bc-one-world-final-line-up) | Gdańsk 2021 competitors and Last Chance Cypher | high |
| Red Bull BC One | [3mpg: Tokyo 2025 Last Chance Cypher](https://www.3mpg.ch/?p=4396) | Tokyo 2025 qualifiers, venue | medium |
| Red Bull BC One | [Oricon: Cypher Japan 2026](https://www.oricon.co.jp/article/3348871/) | Japan final 2026 date and venue; 2025 runner-up | medium |
| Red Bull BC One | [Ryukyu Shimpo: City Cyphers Japan 2026](https://ryukyushimpo.jp/prtimes/entry-5075942.html) | Five Japanese city qualifiers 2026 | medium |
| Red Bull BC One | [Quotidiano: Cypher Italy 2026](https://sport.quotidiano.net/en/ultimaora/torna-red-bull-bc-one-d010d432) | Italy final 2026, L'Aquila | medium |
| Battle of the Year | [battleoftheyear.net](https://battleoftheyear.net/en) | Official site; video archive by year (2022, 2023, 2025) | high |
| Battle of the Year | [SBS Star: 2025 World Final in Korea](https://sbsstar.net/article/N1008270165/battle-of-the-year-world-final-makes-historic-korea-debut-wraps-tv-broadcast-set-for-sept-29-on-sbs-sports) | 2025 venue, dates, winners, hosting through 2027 | medium |
| Battle of the Year | [Vikidia: Battle of the Year](https://fr.vikidia.org/wiki/Battle_of_the_Year) | Winner and runner-up countries 2010–2021 | low |
| Battle of the Year | [Anglophone Direct: Montpellier](https://anglophone-direct.com/?p=5015) | World final in Montpellier since 2010 | low |
| BOTY France | [Sportmag: BOTY France](https://sportmag.fr/?p=106489) | National final at Zénith Sud; Legiteam Obstruxion win (year to confirm) | medium |
| Outbreak Europe | [Wikipedia: Outbreak Europe](https://en.wikipedia.org/wiki/Outbreak_Europe) | History, results table per category, 2026 dates | high |
| Outbreak Europe | [DBpedia: Outbreak Europe](https://dbpedia-live.demo.openlinksw.com/page/Outbreak_Europe) | Infobox data incl. 2024 dates (conflicts, see Gaps) | low |
| Outbreak Europe | [TASR: 16th edition](https://www.teraz.sk/regiony/na-sutaz-outbreak-europe-pricestuje-e/893137-clanok.html) | 2025 edition dates, 90+ countries | medium |
| Outbreak Europe | [Startitup: The Legits Blast](https://www.startitup.sk/?p=1101102) | 2025 edition, ten categories | medium |
| Battle Pro | [Wikipedia: Chelles Battle Pro](https://en.wikipedia.org/wiki/Chelles_Battle_Pro) | Crew and Undisputed 1v1 results 2012–2018 | high |
| Battle Pro | [Paris je t'aime: Battle Pro 2026](https://parisjetaime.com/eng/event/battle-pro-international-final-e557) | 2026 date, venue, categories | medium |
| Battle Pro | [Sortir à Paris: Battle Pro](https://www.sortiraparis.com/en/what-to-do-in-paris/sport-wellness/articles/285435-battle-pro-2026-catch-the-world-s-best-breaking-dancers-at-the-theatre-du-chatelet) | 2024 and 2026 editions, categories | medium |
| Battle Pro | [Paris.fr: 25th anniversary](https://www.paris.fr/evenements/copie-de-battle-pro-25th-anniversary-phase-finale-86017) | 2025 final, 26 Oct 2025 | medium |
| Battle Pro | [Île-de-France grant: Battle Pro 2026](https://www.iledefrance.fr/tous-les-services/ma-region-pres-de-chez-moi/sport-loisirs/sport/253891-breaking-competition-battle-pro) | 2026 dates 10–12 Oct, 160 competitors | medium |
| UK B-Boy Championships | [Wikipedia: UK B-Boy Championships](https://en.wikipedia.org/wiki/UK_B-Boy_Championships) | Results tables; no 2015 edition | high |
| UK B-Boy Championships | [Happening Next: 30th anniversary 2026](https://happeningnext.com/event/uk-b-boy-championships-world-finals-30th-anniversary-eid3a0doknfac) | 16 Aug 2026, Aviva Studios, Manchester | medium |
| UK B-Boy Championships | [I Am Hip-Hop: 2019 World Finals](https://www.iamhiphopmagazine.com/?p=13507) | 2019 edition date, venue, first B-Girl solo | medium |
| UK B-Boy Championships | [Complex: 20th anniversary](https://www.complex.com/music/a/complex/win-tickets-to-the-20th-anniversary-of-the-uk-b-boy-championship-world-finals) | 20th-anniversary edition at O2 Forum (year to confirm) | low |
| UK B-Boy Championships | [Kyeonggi: Jinjo grand slam 2012](https://kyeonggi.com/article/201210170477184) | Jinjo crew win 2012 | medium |
| Notorious IBE / Undisputed | [Fujifilm: Undisputed Masters at IBE 2024](https://fujifilm.com/pt/en/news/FUJIFILM-INSTAX-UNDISPUTED-MASTERS-Returns-To-The-Notorious-IBE-This-August) | 2024 dates and categories | medium |
| Notorious IBE / Undisputed | [Fujifilm: Undisputed Masters Heerlen 2023](https://www.fujifilm.com/nl/en/consumer/event/instax_Undisputed_breakdance_contest_in_Heerleen) | 2023 dates | medium |
| Notorious IBE / Undisputed | [Fujifilm: Undisputed Masters Heerlen 2022](https://fujifilm.com/lt/en/consumer/events/Undisputed-Masters_Heerlen2022) | 2022 dates | medium |
| Undisputed | [Wikipedia: World BBoy Series](https://en.wikipedia.org/wiki/World_BBoy_Series) | Series history, Masters editions and winners | high |
| Undisputed | [DI Reporter: Masters series](https://direporter.com/?p=60228) | London, Amsterdam, Los Angeles, Tokyo stops | medium |
| Undisputed | [Stuff: Cape Town 2025](https://stuff.co.za/?p=201914) | Cape Town stop 18 Jan 2025; Tokyo final March 2025 | medium |
| Undisputed | [ZiFM: Cape Town Dec 2025](https://zifmstereo.co.zw/fujifilm-instax-undisputed-world-championship-returns-to-cpt/) | Cape Town stop 6 Dec 2025; Tokyo final March 2026 | medium |
| R16 Korea | [Wikipedia: R-16 Korea](https://en.wikipedia.org/wiki/R-16_Korea_National_Championships) | Crew winners 2007–2015, format changes | high |
| Silverback Open | [Wikipedia: Silverback Open Championships](https://en.wikipedia.org/wiki/Silverback_Open_Championships) | Editions 2014–2018, categories | high |
| Silverback Open | [silverbackopen.com](https://www.silverbackopen.com) | Official archive of recaps 2014–2018 | high |
| Silverback Open | [silverbackopen.com: 2018 competitors](https://silverbackopen.com/competitors2018/) | 2018 categories and results | high |
| Silverback Open | [and8: Silverback 2018 battle report, 1v1 open](https://www.and8.dance/en/stats/reports/2536/233/) | Full Top 32 bracket (check and8 terms first) | high |
| Freestyle Session | [Wikipedia: Freestyle Session](https://en.wikipedia.org/wiki/Freestyle_Session) | Crew and solo results per year | high |
| Freestyle Session | [and8: FSS Australia qualifier 2022](https://and8.dance/e/4034) | 2022 qualifier, proves circuit active in 2022 | medium |
| WDSF | [Wikipedia: WDSF European Breaking Championship](https://en.wikipedia.org/wiki/WDSF_European_Breaking_Championship) | Hosts and dates 2021–2023 | high |
| WDSF | [WDSF: Kurume 2025 Worlds](https://www.worlddancesport.org/News/kurume-2025-wdsf-world-breaking-championship-3645) | 2025 Worlds dates and host | high |
| WDSF | [WDSF: Youth Worlds Porto 2025](https://www.worlddancesport.org/News/2025-breaking-youth-world-championship-porto-3575) | Youth Worlds 2025; World Battle as co-organiser | high |
| WDSF | [WDSF: Youth Worlds entries](https://www.worlddancesport.org/News/youth-breaking-world-championship-porto-2025-3607) | 270 athletes, 40+ countries | high |
| WDSF | [Francs Jeux: Worlds 2026 in Paris](https://www.francsjeux.com/en/short/The-world-breaking-championships-awarded-to-Paris/) | Paris 2026 dates and venue | medium |
| WDSF | [Major Events International: WDSF portfolio](https://www.majoreventsinternational.com/_files/ugd/d23cf0_427924b373594150a3821fd3c0b850c9.pdf) | Past Worlds hosts incl. Chengdu 2024, Leuven | low |
| BBIC | [News Seoul: 8th BBIC 2023](https://newsseoul.co.kr/news/view/1065591014737866) | 2023 dates, venue, 800 dancers, prize money | medium |
| BBIC | [Asia Economy: BBIC 2020 online](https://cm.asiae.co.kr/en/article/2020092311201907927) | 5th edition online, 64 countries | medium |
| BBIC | [Seoul Shinmun: BBIC 2018 qualifier](https://m.go.seoul.co.kr/news/2018/06/10/20180610500056) | 3rd edition 2018; BOTY Korea 1v1 qualifier | medium |
| BBIC | [Korea Times: Jinjo and BBIC](https://www.koreatimes.co.kr/www/nation/2021/12/719_207627.html) | BBIC 2016 dates; Jinjo titles 2008–2012 | medium |
| FISE | [FISE: International Breaking Battle 2024](https://fise.fr/en/fise-world-series-2024/news/french-winners-international-breaking-battle-samsung) | 2024 finals and podiums | high |
| Radikal Forze Jam | [Shibuya Sakura Stage: KOSÉ Breaking Fes 2024](https://shibuya-sakura-stage.com/en/eventtopics/detail/?cd=000116) | Says RF Jam is held yearly in Vietnam | low |
| D.League | [Spread: KOSÉ 8ROCKS champions 2021–22](https://spread-sports.jp/archives/136838) | Season 2 final and prize | medium |
| General | [Red Bull: best breaking events to watch](https://www.redbull.com/my-en/best-breaking-events-to-watch-online) | Overview of BC One, BOTY, BBIC | low |

## Harvest method per source type

Wikipedia gives the Phase B backbone, WDSF the federation events, YouTube the Phase A battles and videos.

| Source type | How to fetch | What to extract | Notes |
| --- | --- | --- | --- |
| Wikipedia | MediaWiki API (`action=parse`, `prop=wikitext`), not HTML scraping | Year, location, winner, runner-up, bracket tables per category | Store revision id. Also look for: Breaking at the 2024 Summer Olympics, 2018 Youth Olympics, 2022 Asian Games, 2023 Pan American Games, 2023 European Games |
| worlddancesport.org | Events, results and athlete pages; 1 req/s, cached | Full placements, athlete country | Covers Olympics path, Worlds, Europeans, Youth Worlds |
| Organiser sites | battleoftheyear.net, silverbackopen.com, chatelet.com (Battle Pro), Outbreak / The Legits | Dates, venues, categories, published results, video lists | One-off fetches, cached |
| and8.dance | Event pages `/e/{id}` and battle reports `/en/stats/reports/{event}/{category}/` | Brackets, rankings, countries | Terms check first; until then manual cross-check only |
| YouTube Data API v3 | Resolve each channel id once with `search.list` (100 units), then `playlistItems` on the uploads playlist (1 unit per page) | Titles like `A vs B \| Final \| Event 2025`, upload date, URL | Channels to resolve: Red Bull BC One, Battle of the Year, Stance, The Legits, UDEF / Pro Breaking Tour, Freestyle Session, Undisputed, WDSF Breaking for Gold, Olympics, Notorious IBE, Battle Pro, BBIC / Jinjo Crew, Silverback, UK B-Boy Championships |
| Press and sponsor pages | Single fetch, cached | Dates, venue, headline winners only | Never copy text; medium confidence unless confirmed elsewhere |

## Facts to cross-check against

These came from search snippets on 26 Oct 2026. Use them as test fixtures: if harvested data disagrees, note the conflict in that event's report and write neither value.

| Event | Fact | Source |
| --- | --- | --- |
| Red Bull BC One | Hosts: Gdańsk 2021, New York 2022, Paris 2023, Rio 2024, Tokyo 2025, Toronto 2026 | [Shifter](https://shiftermagazine.com/culture/2026-red-bull-bc-one-world-final) |
| Red Bull BC One | Rio 2024 on 7 Dec at Farmasi Arena; Menno won his 4th title, India her 2nd | [Red Bull](https://redbull.com/ie-en/event-series/bc-one) |
| Red Bull BC One | Tokyo 2025 on 9 Nov at Ryōgoku Kokugikan; winners Issin (Body Carnival) and Riko; B-Boy runner-up haruto | [Wikipedia](https://en.wikipedia.org/wiki/Red_Bull_BC_One), [Oricon](https://www.oricon.co.jp/article/3348871/) |
| Red Bull BC One | Toronto 2026 on 29 Nov at Mattamy Athletic Centre | [Shifter](https://shiftermagazine.com/culture/2026-red-bull-bc-one-world-final) |
| Battle of the Year | 2025 World Final 20–21 Sept, Hwaseong Sports Complex Indoor Arena; \~1,000 dancers, 33 countries | [SBS Star](https://sbsstar.net/article/N1008270165/battle-of-the-year-world-final-makes-historic-korea-debut-wraps-tv-broadcast-set-for-sept-29-on-sbs-sports) |
| Battle of the Year | 2025 winners: 1v1 Phil Wizard (CA), crew The Ruggeds (NL), kids Louis Shan (CN) | [SBS Star](https://sbsstar.net/article/N1008270165/battle-of-the-year-world-final-makes-historic-korea-debut-wraps-tv-broadcast-set-for-sept-29-on-sbs-sports) |
| Battle of the Year | Winning countries: 2011 FR, 2012 FR, 2013 KR, 2014 RU, 2015 JP, 2016 JP, 2018 KR, 2019 FR, 2021 KR (crews to resolve) | [Vikidia](https://fr.vikidia.org/wiki/Battle_of_the_Year) (low) |
| R16 Korea | Crew winners: Jinjo 2011 and 2012, Morning of Owl 2013, Gamblerz 2014, Fusion MC 2015 (Uijeongbu) | [Wikipedia](https://en.wikipedia.org/wiki/R-16_Korea_National_Championships) |
| Outbreak Europe | 2016 entries: 334 b-boys, 114 b-girls, 225 2v2 teams | [Wikipedia](https://en.wikipedia.org/wiki/Outbreak_Europe) |
| Outbreak Europe | 16th edition 24–27 July 2025; 2026 edition 23–26 July | [TASR](https://www.teraz.sk/regiony/na-sutaz-outbreak-europe-pricestuje-e/893137-clanok.html), [Wikipedia](https://en.wikipedia.org/wiki/Outbreak_Europe) |
| Battle Pro | Menno won the first Undisputed 1v1 at Battle Pro 2014; 2018 edition held in Lille | [Wikipedia](https://en.wikipedia.org/wiki/Chelles_Battle_Pro) |
| Battle Pro | Châtelet editions: 13 Oct 2024, 25–26 Oct 2025, 10 Oct 2026 | [Sortir à Paris](https://www.sortiraparis.com/en/articles/tag/breaking), [Paris je t'aime](https://parisjetaime.com/eng/event/battle-pro-international-final-e557) |
| UK B-Boy Championships | 2019 = 22nd edition, 14 Apr 2019, Islington Assembly Hall, first B-Girl solo | [I Am Hip-Hop](https://www.iamhiphopmagazine.com/?p=13507) |
| UK B-Boy Championships | Jinjo won the crew title in Oct 2012 | [Kyeonggi](https://kyeonggi.com/article/201210170477184) |
| Undisputed / IBE | Masters at IBE Heerlen: 12–14 Aug 2022, 4–6 Aug 2023, 16–18 Aug 2024 | Fujifilm pages in the source index |
| Undisputed | Cape Town stops 18 Jan 2025 and 6 Dec 2025; Tokyo finals March 2025 and March 2026 | [Stuff](https://stuff.co.za/?p=201914), [ZiFM](https://zifmstereo.co.zw/fujifilm-instax-undisputed-world-championship-returns-to-cpt/) |
| Silverback Open | Final edition 27–28 Oct 2018, 2300 Arena Philadelphia, \~850 breakers from 50 countries, free entry | [silverbackopen.com](https://www.silverbackopen.com) |
| Freestyle Session | 2014 crew final: The Squadron (US) beat Top 9 (RU) | [Wikipedia](https://en.wikipedia.org/wiki/Freestyle_Session) |
| WDSF | Europeans: Sochi 26–27 Jun 2021, Manchester 5–6 Nov 2022, Almería 6–7 May 2023 | [Wikipedia](https://en.wikipedia.org/wiki/WDSF_European_Breaking_Championship) |
| WDSF | Worlds Kurume 12–13 Dec 2025; Worlds Paris 4–6 Dec 2026 | [WDSF](https://www.worlddancesport.org/News/kurume-2025-wdsf-world-breaking-championship-3645), [Francs Jeux](https://www.francsjeux.com/en/short/The-world-breaking-championships-awarded-to-Paris/) |
| BBIC | 8th edition 22–23 Jul 2023, Bucheon Gymnasium, \~800 dancers, 23 countries | [News Seoul](https://newsseoul.co.kr/news/view/1065591014737866) |
| FISE | 2024 B-Girl final: Kimie beat Carlota; B-Boy final Killian vs Dany Dann (winner to confirm); 3rd Mighty Jimm | [FISE](https://fise.fr/en/fise-world-series-2024/news/french-winners-international-breaking-battle-samsung) |

## Gaps to close

16 of the 40 events have no source yet, and some editions of sourced events lack a results page. Find one per item or drop it after one honest search.

- [ ] **No source yet, federation events:** Paris 2024 Olympics, Leuven 2023 Worlds, Budapest and Shanghai OQS 2024, Kraków 2023 European Games, Hangzhou 2023 Asian Games, Buenos Aires 2018 YOG, Santiago 2023 Pan Am Games, Seoul 2022 Worlds, Chengdu 2024 Worlds, Chengdu 2025 World Games. Start with worlddancesport.org and the Wikipedia "Breaking at…" pages.
- [ ] **No source yet, community events:** Snipes Funkin Stylez, Floor Wars, Hip Opsession, Break The Floor, Bboy City, Rock Steady Crew Anniversary, Mighty 4, B-Boy Park, World Battle results.
- [ ] **Status unverified:** Freestyle Session after 2022, R16 after 2015, BBIC after 2023, BOTY 2024 location, Radikal Forze Jam venue (Singapore or Vietnam).
- [ ] **Conflict:** Outbreak Europe 2024 dates. DBpedia says 22–25 Aug 2024; the event usually runs the last week of July.
- [ ] **Start years to confirm:** BC One B-Girl category (believed 2018); UK Championships 20th anniversary year.
- [ ] **Unknown event:** "Unbreakable" is on the harvest plan's channel list. Identify organiser, city and format before harvesting.
- [ ] **and8.dance terms:** read before using any battle report beyond manual checks.

## Grassroots jams spotted in passing

Not part of the top 40, but exactly the jams BreakingJam wants on the map. After the top 40, create each one as a jam in the model with its own report; take only what the pages state.

| Event | Place | Date | Format | Source |
| --- | --- | --- | --- | --- |
| Now or Never Crew 24th anniversary jam | Boogaloo Academy, Vancouver, CA | 15–16 Aug 2026 | 4v4 breaking; winners fly to Battle New School, Brittany, FR | [Happening Next](https://happeningnext.com/event/now-or-never-crew-24th-year-anniversary-jam-eid1ef0l1wkajha) |
| Move For Freedom Vol. 4 | Schlachthof, Wiesbaden, DE | 17–18 Jul 2026 | 4v4 crew, kids 1v1; €5,000 prize pool | [Wiesbaden.de](https://www.wiesbaden.de/info-networking-event?id=167756) |
| Up North Battle 2026 | Norrlandsoperan, Umeå, SE | 8–10 May 2026 | breaking 7-to-smoke, freestyle 1v1, rookie 1v1, showcase | [Norrlandsoperan](https://norrlandsoperan.se/?p=16850) |
| Get On Up Youth Breaking Battles | Fortitude Valley, Brisbane, AU | 19 Sep 2026 | youth crew battles | [Brisbane City Council](https://www.brisbane.qld.gov.au/events/get-on-up-youth-breaking-battles-2026/206170663) |
| Breakin' Summit 2026 | Yoyogi Park BE STAGE, Tokyo, JP | 10 Oct 2026 | U-15 crew battle by prefecture; produced by Shigekix | [Koubo / PR Times](https://koubo.jp/press-release/prtimes/c69009_r47) |
| Seoul Olympic Commemorative Breaking K Crew Battle | Olympic Park, Seoul, KR | 2026, day 16 (month to confirm) | crew battle, youth 1v1 | [Nocut News](https://en.nocutnews.co.kr/news/6516587) |
| KOSÉ Breaking Fes 2024 | Shibuya Sakura Stage, Tokyo, JP | 27 Oct 2024 | 2v2 (¥1M prize), U-15 1v1 | [Shibuya Sakura Stage](https://shibuya-sakura-stage.com/en/eventtopics/detail/?cd=000116) |
| Red Bull BC One City Cyphers Japan | Sapporo, Nagoya, Tokyo, Naha, Okayama | from 25 Apr 2026 | 1v1 qualifiers | [Ryukyu Shimpo](https://ryukyushimpo.jp/prtimes/entry-5075942.html) |
| Red Bull BC One Cypher Italy | L'Aquila, IT | 22–23 May 2026 | 1v1 national final | [Quotidiano](https://sport.quotidiano.net/en/ultimaora/torna-red-bull-bc-one-d010d432) |
| IT Battle, Crew Legend, French Breaking Supercup, Breaking Expert Battle | Île-de-France (Rosny 2, Montreuil, Évry, Cergy-Pontoise, Les Mureaux) | 2025–2026 | various | [Sortir à Paris tag page](https://www.sortiraparis.com/en/articles/tag/breaking) |
| Mantes Breaking Battle | Gymnase Albert-Camus, Mantes-la-Jolie, FR | 6 Jul 2024 | high-level breaking battle | [Mantes-la-Jolie](https://manteslajolie.fr/information/agenda/mantes-breaking-battle-de-lart-de-rue-aux-jeux-olympiques-juillet-2024-4848/pdf) |

## Work order for Claude Code

One event at a time, in rank order: Europe 1–20, outside Europe 1–20, then the grassroots jams. An event is written and reported before the next one starts.

1. **Once, before the first event:** read `claude/seed-data-harvest-plan.md`, this brief and the data model in the repo; resolve the YouTube channel ids.
2. **Pick the next event** in rank order.
3. **Gather its sources:** its rows in the source index, then Wikipedia, WDSF, the organiser site and its YouTube channel; and8 for manual checks only.
4. **Write it into the model:** jam, editions, categories, entries, results. Phase A editions in full, Phase B top placements.
5. **Battles one by one:** each battle with its sides, winner and `video_url`; finish one before starting the next.
6. **Cross-check** against "Facts to cross-check against"; a conflict goes in the report and neither value is written.
7. **Write `reports/<event-slug>.md`** (the two lines), then go back to step 2.
8. **At the end:** the name-normalisation review sheet for Pierre and a list of all reports.
