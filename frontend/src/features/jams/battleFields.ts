// The battle form's values and the API body they become; pure, so tested without a form.
import type { TFunction } from "i18next";
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
  /** ISO 4217 code; blank = no cash prize. */
  prize_currency: string;
  prize_first: string;
  prize_second: string;
  prize_third: string;
  /** One of the jam's days, `YYYY-MM-DD`. */
  start_day: string;
  /** `HH:MM`; blank = the start isn't announced. */
  start_time: string;
};

/** Places with a cash prize, in order. */
export const PLACES = ["first", "second", "third"] as const;
export type Place = (typeof PLACES)[number];

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

/** The form for a new battle (1v1 Mixed Adult, starting on the jam's first day), or a stored one. */
export function battleValues(
  firstDay: string,
  battle?: Battle,
): BattleFormValues {
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
      prize_currency: "",
      prize_first: "",
      prize_second: "",
      prize_third: "",
      start_day: firstDay,
      start_time: "",
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
    prize_currency: battle.prize_currency ?? "",
    prize_first: text(battle.prize_first),
    prize_second: text(battle.prize_second),
    prize_third: text(battle.prize_third),
    start_day: battle.starts_at?.slice(0, 10) ?? firstDay,
    start_time: battle.starts_at?.slice(11, 16) ?? "",
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
    // The amounts are hidden, and dropped, while no currency is chosen.
    prize_currency: values.prize_currency || null,
    prize_first: values.prize_currency ? number(values.prize_first) : null,
    prize_second: values.prize_currency ? number(values.prize_second) : null,
    prize_third: values.prize_currency ? number(values.prize_third) : null,
    starts_at: values.start_time
      ? `${values.start_day}T${values.start_time}:00`
      : null,
  };
}

/** Every ISO 4217 code the browser knows, plus `keep`, with their names in `language`. */
export function currencies(language: string, keep?: string | null) {
  const names = new Intl.DisplayNames([language], { type: "currency" });
  const codes = Intl.supportedValuesOf("currency");
  // A stored code this browser doesn't list would show as "no prize" and be dropped on save.
  if (keep && !codes.includes(keep)) codes.push(keep);
  return codes.map((code) => ({ code, name: names.of(code) ?? code }));
}

/** "1st CHF 1,000 · 2nd CHF 500", in `language` and without cents; blank without a prize. */
export function prizeLine(
  battle: Pick<Battle, `prize_${"currency" | Place}`>,
  t: TFunction,
  language: string,
): string {
  const currency = battle.prize_currency;
  if (!currency) return "";
  const money = new Intl.NumberFormat(language, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return PLACES.flatMap((place) => {
    const amount = battle[`prize_${place}`];
    return amount == null
      ? []
      : [t(`org.battles.prizes.${place}`, { amount: money.format(amount) })];
  }).join(" · ");
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
