// The entry form's values and the API body they become; pure, so tested without a form.
import type { Schemas } from "../../api/client";

type Entry = Schemas["Entry"];

/** What the entry form edits besides its members and crew, which pickers hold. */
export type EntryFormValues = {
  team_name: string;
  status: Schemas["EntryStatus"];
  reached: Schemas["BracketStage"];
  final_rank: string;
  video_url: string;
  /** Where the battle starts in the video: `1:02:03`, `2:15` or seconds. */
  video_start: string;
};

/** "1:02:03" → 3723, "2:15" → 135, "90" → 90; null when blank or not a time. */
export function parseOffset(value: string): number | null {
  const parts = value.trim().split(":");
  if (parts.length > 3 || !parts.every((p) => /^\d+$/.test(p))) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/** 3723 → "1:02:03", 135 → "2:15"; blank for null. */
export function formatOffset(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** The form for a new entry, or filled with a stored one. */
export function entryValues(entry?: Entry): EntryFormValues {
  return {
    team_name: entry?.team_name ?? "",
    status: entry?.status ?? "confirmed",
    reached: entry?.reached ?? "na",
    final_rank: entry?.final_rank == null ? "" : String(entry.final_rank),
    video_url: entry?.video_url ?? "",
    video_start: formatOffset(entry?.video_offset_seconds),
  };
}

/** The API body: members and crew from the pickers, blanks as null. */
export function entryBody(
  values: EntryFormValues,
  { dancerIds, crewId }: { dancerIds: string[]; crewId: string | null },
): Schemas["EntryFields"] {
  const videoUrl = values.video_url.trim() || null;
  return {
    team_name: values.team_name.trim() || null,
    crew_id: crewId,
    dancer_ids: dancerIds,
    status: values.status,
    reached: values.reached,
    final_rank: values.final_rank.trim() ? Number(values.final_rank) : null,
    video_url: videoUrl,
    video_offset_seconds: videoUrl ? parseOffset(values.video_start) : null,
  };
}

/** What an entry shows as its name: the team name, else its members. */
export function entryLabel(entry: Pick<Entry, "team_name" | "members">) {
  return entry.team_name ?? entry.members.map((m) => m.dancer_name).join(" & ");
}
