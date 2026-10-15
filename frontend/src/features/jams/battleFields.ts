// The battle form's values and the API body they become; pure, so tested without a form.
import type { Schemas } from "../../api/client";

type Battle = Schemas["Battle"];
type BattleFields = Schemas["BattleFields"];

/** §4 age presets: Kids (8–17, lower bound editable), Adult (18+), Masters (40+). */
export type AgePreset = "kids" | "adult" | "masters" | "na";

/** What the battle form edits; numbers stay text until submitted. */
export type BattleFormValues = {
  name: string;
  format: Schemas["BattleFormat"];
  team_size: string;
  gender: Schemas["BattleGender"];
  preset: AgePreset;
  age_min: string;
  age_max: string;
  bracket_size: string;
  max_entries: string;
};

/** The ages a preset starts with, as `[age_min, age_max]`. */
export const PRESET_AGES: Record<AgePreset, [string, string]> = {
  kids: ["8", "17"],
  adult: ["18", ""],
  masters: ["40", ""],
  na: ["", ""],
};

const text = (n: number | null | undefined) => (n == null ? "" : String(n));
const number = (value: string) => (value.trim() === "" ? null : Number(value));

/** Which preset a stored battle reads as; its own ages are kept either way. */
export function presetOf(battle: Pick<Battle, "age" | "age_min">): AgePreset {
  if (battle.age === "kids") return "kids";
  if (battle.age === "na") return "na";
  return (battle.age_min ?? 0) >= 40 ? "masters" : "adult";
}

/** The form for a new battle (1v1 Mixed Adult), or filled with a stored one. */
export function battleValues(battle?: Battle): BattleFormValues {
  if (!battle) {
    return {
      name: "",
      format: "team",
      team_size: "1",
      gender: "mixed",
      preset: "adult",
      age_min: "18",
      age_max: "",
      bracket_size: "",
      max_entries: "",
    };
  }
  return {
    name: battle.name,
    format: battle.format,
    team_size: text(battle.team_size) || "1",
    gender: battle.gender,
    preset: presetOf(battle),
    age_min: text(battle.age_min),
    age_max: text(battle.age_max),
    bracket_size: text(battle.bracket_size),
    max_entries: text(battle.max_entries),
  };
}

/** The API body; a blank name lets the server name it from the fields. */
export function battleBody(values: BattleFormValues): BattleFields {
  return {
    name: values.name.trim() || null,
    format: values.format,
    team_size: values.format === "team" ? number(values.team_size) : null,
    gender: values.gender,
    age:
      values.preset === "kids"
        ? "kids"
        : values.preset === "na"
          ? "na"
          : "adult",
    age_min: values.preset === "na" ? null : number(values.age_min),
    age_max: values.preset === "na" ? null : number(values.age_max),
    bracket_size: number(values.bracket_size),
    max_entries: number(values.max_entries),
  };
}

/**
 * The name the server gives a battle left unnamed, e.g. "2v2 Mixed Kids"; the same rules as
 * `BattleFields::display_name` in the API. Shown as the name field's placeholder.
 */
export function defaultBattleName(fields: BattleFields): string {
  const format =
    fields.format === "team" && fields.team_size
      ? `${fields.team_size}v${fields.team_size}`
      : fields.format === "seven_to_smoke"
        ? "Seven to Smoke"
        : "Battle";
  const gender = { bboy: "Bboy", bgirl: "Bgirl", mixed: "Mixed" }[
    fields.gender
  ];
  const age =
    fields.age === "kids"
      ? " Kids"
      : fields.age === "adult" && (fields.age_min ?? 0) >= 40
        ? " Masters"
        : "";
  return `${format} ${gender}${age}`;
}

/** How many dancers an entry holds: the team size, one for seven to smoke, else up to 10. */
export function membersPerEntry(battle: Pick<Battle, "format" | "team_size">) {
  if (battle.format === "team") return battle.team_size ?? 1;
  if (battle.format === "seven_to_smoke") return 1;
  return 10;
}
