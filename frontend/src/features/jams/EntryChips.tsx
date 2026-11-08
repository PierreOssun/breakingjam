import type { Schemas } from "../../api/client";
import { ResultBadge } from "../../components/ResultBadge";
import { VideoPill } from "../../components/VideoPill";
import { DancerChip } from "../dancers/DancerChip";
import { entryLabel } from "./entryFields";
import { resultOf } from "./result";

type Entry = Schemas["Entry"];

/** An entry for visitors: a dancer's chip with their podium badge inside, or a team's name and
 * badge over its members' chips; the video pill when there is one (§4.37). */
export function EntryChips({
  entry,
  onPlay,
}: {
  entry: Entry;
  onPlay: (entry: Entry) => void;
}) {
  const podium = resultOf(entry.final_rank, entry.reached)?.kind === "podium";
  const badge = podium && (
    <ResultBadge
      finalRank={entry.final_rank}
      reached={entry.reached}
      size="sm"
    />
  );
  const video = entry.video_url && (
    <VideoPill name={entryLabel(entry)} onClick={() => onPlay(entry)} />
  );
  const [solo] = entry.members;
  if (solo && entry.members.length === 1 && !entry.team_name) {
    return (
      <li className="flex items-center gap-2">
        <DancerChip dancer={solo} badge={badge} />
        {video}
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex min-h-7 items-center gap-2">
        <span className="text-body-sm font-extrabold">{entryLabel(entry)}</span>
        {video}
        {badge}
      </div>
      <div className="flex flex-wrap gap-2">
        {entry.members.map((member) => (
          <DancerChip key={member.id} dancer={member} />
        ))}
      </div>
    </li>
  );
}
