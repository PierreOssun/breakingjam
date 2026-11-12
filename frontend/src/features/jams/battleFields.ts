// The battle form's values and the API body they become; pure, so tested without a form.
import type { TFunction } from "i18next";
import type { Schemas } from "../../api/client";
import { localeOf } from "../../lib/dates";

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
    // The server stores the name it made from the fields; loaded blank, it follows them again.
    name: battle.name === defaultBattleName(battle) ? "" : battle.name,
    format: battle.format,
    // Seven to smoke is solo; blank is no fixed size (an unknown format, or a showcase).
    team_size:
      battle.format === "seven_to_smoke" ? "1" : text(battle.team_size),
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
  // A currency with no amount is no prize: the sheet may have suggested it.
  const prize =
    values.prize_currency !== "" &&
    PLACES.some((place) => values[`prize_${place}`].trim() !== "")
      ? values.prize_currency
      : null;
  return {
    name: values.name.trim() || null,
    format: values.format,
    // Team battles and showcases say how many dancers an entry holds.
    team_size:
      values.format === "team" || values.format === "showcase"
        ? number(values.team_size)
        : null,
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
    prize_currency: prize,
    prize_first: prize ? number(values.prize_first) : null,
    prize_second: prize ? number(values.prize_second) : null,
    prize_third: prize ? number(values.prize_third) : null,
    starts_at: values.start_time
      ? `${values.start_day}T${values.start_time}:00`
      : null,
  };
}

/** The battle sheet's category chips (M24), in display order. */
export const CATEGORIES = [
  "bboy",
  "bgirl",
  "open",
  "duo",
  "crew",
  "kids",
  "footwork",
  "powermove",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** The battle sheet's format chips (M24), in display order. */
export const FORMATS = [
  "top4",
  "top8",
  "top16",
  "top32",
  "smoke",
  "showcase",
] as const;
export type FormatChip = (typeof FORMATS)[number];

/** A chip that names the battle, and the word that shows a typed name already says it. */
type Named = { name: string; word: RegExp };
const FOOTWORK: Named = { name: "1v1 Footwork", word: /footwork/i };
const POWERMOVE: Named = { name: "1v1 Powermove", word: /power ?move/i };

/** Who each category lets in; Footwork and Powermove are 1v1 Open battles with their name. */
const CATEGORY: Record<
  Category,
  {
    size: string;
    gender: Schemas["BattleGender"];
    preset: AgePreset;
    named?: Named;
  }
> = {
  bboy: { size: "1", gender: "bboy", preset: "adult" },
  bgirl: { size: "1", gender: "bgirl", preset: "adult" },
  open: { size: "1", gender: "mixed", preset: "adult" },
  duo: { size: "2", gender: "mixed", preset: "adult" },
  crew: { size: "3", gender: "mixed", preset: "adult" },
  kids: { size: "1", gender: "mixed", preset: "kids" },
  footwork: { size: "1", gender: "mixed", preset: "adult", named: FOOTWORK },
  powermove: { size: "1", gender: "mixed", preset: "adult", named: POWERMOVE },
};

/** What a format chip sets: a bracket, or a format of its own. */
const BRACKET: Partial<Record<FormatChip, string>> = {
  top4: "4",
  top8: "8",
  top16: "16",
  top32: "32",
};
const FORMAT: Partial<Record<FormatChip, Schemas["BattleFormat"]>> = {
  smoke: "seven_to_smoke",
  showcase: "showcase",
};

/**
 * The name once a category chip is picked: a naming chip's own, unless the name already says it;
 * a name a naming chip gave is dropped; a typed one stays.
 */
function renamed(name: string, named: Named | undefined) {
  if (named) return named.word.test(name) ? name : named.name;
  return [FOOTWORK, POWERMOVE].some((chip) => chip.name === name) ? "" : name;
}

const same = (a: BattleFormValues, b: BattleFormValues) =>
  (Object.keys(a) as (keyof BattleFormValues)[]).every(
    (key) => a[key] === b[key],
  );

/** The values once a category chip is picked; the chips are presets over the fields. */
export function withCategory(
  values: BattleFormValues,
  category: Category,
): BattleFormValues {
  const { size, gender, preset, named } = CATEGORY[category];
  // A crew keeps the size it has.
  const team_size =
    category === "crew" && Number(values.team_size) >= 3
      ? values.team_size
      : size;
  // The age preset it already has keeps its ages, e.g. kids from 10.
  const [age_min, age_max] =
    values.preset === preset
      ? [values.age_min, values.age_max]
      : PRESET_AGES[preset];
  return {
    ...values,
    // Seven to smoke is solo and a showcase takes any size; with a size, any other battle is a
    // team battle.
    format:
      values.format === "showcase" ||
      (values.format === "seven_to_smoke" && team_size === "1")
        ? values.format
        : "team",
    team_size,
    gender,
    preset,
    age_min,
    age_max,
    name: renamed(values.name, named),
  };
}

/** The values once a format chip is picked, or none: a bracket not known yet. */
export function withFormat(
  values: BattleFormValues,
  chip: FormatChip | undefined,
): BattleFormValues {
  return {
    ...values,
    // Without a size, a battle stays of unknown format: a bracket says nothing of its crews.
    format: (chip && FORMAT[chip]) ?? (values.team_size === "" ? "na" : "team"),
    // Seven to smoke sends no size but keeps the one the form has, so letting go of it gives
    // back the crew battle, or the battle of unknown size, it was.
    bracket_size: (chip && BRACKET[chip]) ?? "",
  };
}

/**
 * The category chip the values read as: the one picking would change nothing about. The naming
 * chips come last, so "1v1 Footwork" reads as Footwork rather than 1v1 Open.
 */
export function categoryOf(values: BattleFormValues): Category | undefined {
  // Seven to smoke is solo, whatever size the form keeps for when it is let go.
  const seen =
    values.format === "seven_to_smoke" ? { ...values, team_size: "1" } : values;
  return CATEGORIES.filter((chip) => same(withCategory(seen, chip), seen)).at(
    -1,
  );
}

/** The format chip the values read as, if any. */
export function formatOf(values: BattleFormValues): FormatChip | undefined {
  return FORMATS.find((chip) => same(withFormat(values, chip), values));
}

/**
 * "1v1 · Bboys · 18+ · Top 16 · 16 spots · 1st CHF 1,000", or "Showcase · Crews of 5 · …": the
 * structured fields in words.
 */
export function battleSummary(
  battle: Pick<
    BattleFields,
    | "format"
    | "team_size"
    | "gender"
    | "age"
    | "age_min"
    | "age_max"
    | "bracket_size"
    | "max_entries"
    | `prize_${"currency" | Place}`
  >,
  t: TFunction,
  language: string,
): string {
  const preset = presetOf(battle);
  return [
    // "1v1" already says it is a team battle.
    battle.format === "team"
      ? `${battle.team_size}v${battle.team_size}`
      : t(`org.battles.formats.${battle.format}`),
    battle.format === "showcase" &&
      battle.team_size &&
      t("org.battles.crewsOf", { count: battle.team_size }),
    t(`org.battles.genders.${battle.gender}`),
    preset === "kids"
      ? t("org.battles.kidsRange", {
          from: battle.age_min ?? 0,
          to: battle.age_max ?? 17,
        })
      : preset !== "na" &&
        t("org.battles.adultFrom", { from: battle.age_min ?? 18 }),
    battle.bracket_size &&
      t("org.battles.bracketOf", { n: battle.bracket_size }),
    battle.max_entries && t("org.battles.spots", { count: battle.max_entries }),
    prizeLine(battle, t, language),
  ]
    .filter(Boolean)
    .join(" · ");
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
  const money = new Intl.NumberFormat(localeOf(language), {
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
export function defaultBattleName(
  fields: Pick<
    BattleFields,
    "format" | "team_size" | "gender" | "age" | "age_min"
  >,
): string {
  const format =
    fields.format === "team" && fields.team_size
      ? `${fields.team_size}v${fields.team_size}`
      : fields.format === "seven_to_smoke"
        ? "Seven to Smoke"
        : fields.format === "showcase"
          ? "Showcase"
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

/** How many dancers an entry holds, as the API counts it (`entry_size`); none when open. */
export function entrySize(battle: Pick<Battle, "format" | "team_size">) {
  return battle.format === "seven_to_smoke" ? 1 : (battle.team_size ?? null);
}

/** Whether a save from entry size `before` to `after` removes the battle's entries, as the
 * API does: an open size holds any entry, another fixed one none of the old. */
export function wipes(before: number | null, after: number | null) {
  return after !== null && after !== before;
}

/** How many dancers an entry holds: the team size, one for seven to smoke, else up to 10. */
export function membersPerEntry(battle: Pick<Battle, "format" | "team_size">) {
  if (battle.format === "team") return battle.team_size ?? 1;
  if (battle.format === "seven_to_smoke") return 1;
  if (battle.format === "showcase") return battle.team_size ?? 10;
  return 10;
}
