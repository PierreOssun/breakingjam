// The people behind BreakingJam, for `/team` (DESIGN.md §6 Team page): a few lines that change
// by hand, so not a table.

/** What someone does for BreakingJam: picks the chip's label, colour and icon. */
export type TeamRole = "developer" | "marketing";

export type TeamMember = {
  /** Stable name for React and the generated avatar's seed. */
  key: string;
  name: string;
  role: TeamRole;
  /** Instagram handle, without the "@". */
  instagram: string;
  /** Their key in `data/dancers.toml`: their page and avatar, found by key since ids differ
   * between environments; null: no page. */
  dancerKey: string | null;
};

export const TEAM: TeamMember[] = [
  {
    key: "iki",
    name: "Iki",
    role: "developer",
    instagram: "pierreossun",
    dancerKey: "iki",
  },
  {
    key: "simba",
    name: "Simba",
    role: "marketing",
    instagram: "simba_ossun",
    dancerKey: "simba",
  },
];
