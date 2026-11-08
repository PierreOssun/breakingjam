# Battle results by round (M29)

Until M29 the jam page showed a battle's results as one row of chips, sorted by placing. Who beat whom was lost, though the curated data records every match: its round, both sides, the winner, the judges' votes, and the video with its start time. The import squashed each bracket into placings (`entries.reached`, `final_rank`) and gave each entry the video of its last match. M29 stores matches and shows the results round by round. Design: "Jam page — battle results by round" on the canvas, with the match-card edit (crown, same name style). Agreed with the author on 2026-11-06.

## Decisions

- **`battle_matches`**: one row per match, with its round, its position in the round, the winner and loser entries, and an optional video with its start time.
  - Rounds keep the data's names: `top64`…`top8`, `top4` (shown as "Semi-finals"), `third` (the small final, shown as "3rd place") and `final`.
  - Winner and loser rather than A, B and a winner: the winner is always the first line, and there is no "winner is neither side" state to guard against.
  - Deleting an entry deletes its matches.
- **Existing results**: the migration turns each battle's single 1st and single 2nd into its final, with the winner's video, since their last battle was the final. Earlier rounds stay placings.
- **The curated import** stores every match between the entries it writes, numbered in file order within each round. Entries keep their placings and last-match videos, so dancer pages are unchanged.
- **The jam page, for visitors:**
  - No result yet: the entrant chips, unchanged.
  - Results: the Final card, then one section per round. A round with known pairings shows match cards. A round without them lists its placings as chips (the fallback). Without a known final, the finalists show as chips under "Final".
  - Rounds below Top 8 fold on phones behind "Show the N battles".
  - A solo dancer's name links to their page, as the chips did.
- **The organiser's view** keeps its editing rows until step 2.
- **`has_videos`** (M28) also counts match videos.
- **Not in M29:** judge votes (stored in the data, not shown), prelims scoring, the live battle manager.

## Steps

1. Data, API, jam page — done 2026-11-06:
   - migration `20261106000001_battle_matches`;
   - `MatchRound`, `Match` and `MatchFields`, and the shared `canonical_video`;
   - the import writing matches;
   - `matches` on `GET /events/{id}/battles`;
   - `rounds.ts` (grouping and fallbacks) and `BattleResults.tsx`;
   - DESIGN.md and tests.
2. Organisers enter matches — done 2026-11-06:
   - **API:** `PUT /battles/{id}/matches` replaces a battle's matches, with the same rights and locks as entries. It refuses a bracket (422 on `matches`) unless:
     - both sides are the battle's entries, none withdrawn;
     - an entry battles once a round;
     - a round holds no more battles than it can;
     - a knocked-out entry battles no later round, except a semi-final loser in the small final.
   - **Placings follow:** each loser's stage; 1st and 2nd from the final, 3rd and 4th from the small final; the video of each entry's last match. Hand placings are kept for entries that have only won so far. Removing a match doesn't undo the placing it set.
   - **The battle sheet** gets a Details | Results switch. Results shows one round at a time: per battle, a crown and an entrant select for each side, then an optional video link. A crowned winner fills the next round (and a semi-final's loser the small final). The sheet opens on Results from the jam page once the jam is over.
   - A curated match's video start is kept unless its link changes.

3. Finish (2026-11-08), against the brief re-read:
   - the Results step saves as you go (no Save button), and a battle just decided takes the video its loser had as an entry;
   - the Final card also comes from a single 1st and 2nd when no final is stored;
   - avatars link to their dancers (name as `title` and `aria-label`), and no name chips remain in the results;
   - rounds without pairings: "N battles", then plain rows (name, avatars, the entry's video), with no note;
   - avatars show the dancer's name on hover;
   - review fixes: a placing keeps its match's video start; each match keeps its `position` (sent by the Results step, checked by the API), so skipped battles keep their place; a corrected winner uncrowns the next battle and leaves the rounds after; a non-YouTube link is held back with a field error instead of refusing the whole bracket.
   - Kept on purpose: winner and loser rather than entry A, B and a winner, the data's round names, and no `updated_at` (a save replaces the battle's matches).

## Before deploying

- The migration runs with the old API still serving, which ignores the new table.
- UAT's curated jams have only their backfilled finals until UAT is reset and re-imported; their earlier rounds show as placings until then.
