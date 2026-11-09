import {
  battleBody,
  battleSummary,
  battleValues,
  CATEGORIES,
  categoryOf,
  defaultBattleName,
  FORMATS,
  formatOf,
  membersPerEntry,
  presetOf,
  withCategory,
  withFormat,
} from "../../../src/features/jams/battleFields";
import i18n from "../../../src/i18n";
import {
  entryBody,
  entryLabel,
  entryValues,
  formatOffset,
  parseOffset,
} from "../../../src/features/jams/entryFields";
import type { TFunction } from "i18next";
import {
  brokenSpot,
  checklist,
  emptyJam,
  jamBody,
  jamProblems,
  jamValues,
  sameJam,
  startBody,
  withheld,
} from "../../../src/features/jams/jamFields";

describe("jam fields", () => {
  it("trims, and sends blanks as null", () => {
    const body = jamBody({
      ...emptyJam(),
      name: "  Paris Cypher ",
      starts_on: "2030-06-01",
      city: " Paris ",
      country: "FR",
      venue_name: "  ",
      opens_at: "14:00",
      registration_url: "https://example.com/register",
      contact_email: " hello@pariscypher.com ",
    });
    expect(body).toMatchObject({
      name: "Paris Cypher",
      ends_on: "2030-06-01",
      city: "Paris",
      opens_at: "14:00",
      closes_at: null,
      venue_name: null,
      address: null,
      description: null,
      registration_url: "https://example.com/register",
      website_url: null,
      contact_email: "hello@pariscypher.com",
      lat: null,
      lng: null,
    });
  });

  it("starts a jam from a name and a day, without a place", () => {
    expect(startBody("Winter Cypher Jam", "2030-12-12")).toMatchObject({
      name: "Winter Cypher Jam",
      starts_on: "2030-12-12",
      ends_on: "2030-12-12",
      city: null,
      country: null,
      lat: null,
    });
  });

  it("reads a one-day jam as a blank last day, and times as HH:MM", () => {
    const stored = {
      ...emptyJam(),
      starts_on: "2030-06-08",
      ends_on: "2030-06-08",
      opens_at: "14:00:00",
      closes_at: null,
      city: null,
      country: null,
    } as never;
    expect(jamValues(stored)).toMatchObject({
      ends_on: "",
      opens_at: "14:00",
      closes_at: "",
      city: "",
      country: "",
    });
    expect(
      jamValues({ ...(stored as object), ends_on: "2030-06-09" } as never)
        .ends_on,
    ).toBe("2030-06-09");
  });

  it("lists what a draft still needs to go public", () => {
    const missing = (...args: Parameters<typeof checklist>) =>
      checklist(...args)
        .filter((item) => !item.done)
        .map((item) => item.key);
    const bare = {
      city: null,
      country: null,
      lat: null,
      lng: null,
      instagram_url: null,
      contact_email: "crew@example.com",
    };
    expect(missing(bare, 0)).toEqual(["place", "battle"]);
    expect(missing({ ...bare, city: "Zürich", country: "CH" }, 1)).toEqual([
      "place",
    ]);
    const placed = {
      ...bare,
      city: "Zürich",
      country: "CH",
      lat: 47.38,
      lng: 8.54,
    };
    expect(missing(placed, 1)).toEqual([]);
    expect(checklist(placed, 0).find((i) => !i.done)?.block).toBe("battles");
    // A way for the BreakingJam team to reach the organiser: Instagram or an email.
    const unreachable = { ...placed, contact_email: null };
    expect(missing(unreachable, 1)).toEqual(["contact"]);
    expect(checklist(unreachable, 1).at(-1)?.block).toBe("links");
    expect(
      missing({ ...unreachable, instagram_url: "https://instagram.com/x" }, 1),
    ).toEqual([]);
  });
});

describe("what the API would refuse", () => {
  const t = ((key: string) => key) as unknown as TFunction;
  const fine = { ...emptyJam(), name: "Jam", starts_on: "2030-06-01" };
  const problems = (changes: object, kept?: typeof fine) =>
    jamProblems({ ...fine, ...changes }, t, kept);

  it("finds nothing wrong with a bare draft", () => {
    expect(problems({})).toEqual({});
  });

  it("wants a name and a first day, in the right order", () => {
    expect(problems({ name: "  " })).toEqual({ name: "validation.required" });
    expect(problems({ starts_on: "" })).toEqual({
      starts_on: "validation.required",
    });
    expect(problems({ ends_on: "2030-05-31" })).toEqual({
      ends_on: "validation.endsBeforeStarts",
    });
    expect(problems({ ends_on: "2030-06-01" })).toEqual({});
  });

  it("reads links and emails as the API does, blanks allowed", () => {
    expect(problems({ website_url: "www.myjam.com" })).toEqual({
      website_url: "validation.url",
    });
    expect(problems({ instagram_url: "https://exa mple.com" })).toEqual({
      instagram_url: "validation.url",
    });
    expect(problems({ registration_url: " https://example.com " })).toEqual({});
    expect(problems({ contact_email: "hello at" })).toEqual({
      contact_email: "validation.email",
    });
    expect(problems({ contact_email: " hello@jam.com " })).toEqual({});
  });

  it("counts what is sent, trimmed", () => {
    expect(problems({ description: "x".repeat(201) })).toEqual({
      description: "validation.tooLong",
    });
    expect(problems({ description: `${"x".repeat(200)}  ` })).toEqual({});
  });

  it("keeps the city and country of a jam past draft", () => {
    const stored = { ...fine, city: "Paris", country: "FR" };
    expect(problems({ city: "  ", country: "" }, stored)).toEqual({
      city: "validation.required",
      country: "validation.required",
    });
    expect(problems({ city: "Lyon", country: "FR" }, stored)).toEqual({});
    // A draft, or a place it never had, has nothing to keep.
    expect(problems({ city: "" })).toEqual({});
    expect(problems({ city: "" }, fine)).toEqual({});
  });

  it("holds back only the fields with a problem", () => {
    const stored = { ...fine, website_url: "https://old.example" };
    const typed = { ...stored, website_url: "nope", description: "New." };
    const next = withheld(typed, stored, { website_url: "validation.url" });
    expect(next).toEqual({ ...typed, website_url: "https://old.example" });
    expect(sameJam(next, stored)).toBe(false);
    expect(sameJam({ ...stored, name: " Jam " }, stored)).toBe(true);
  });

  it("leads to the first field at fault, not to what concerns the whole jam", () => {
    expect(brokenSpot({})).toBeNull();
    expect(brokenSpot({ root: "Something went wrong." })).toBeNull();
    expect(brokenSpot({ name: "x" })).toBe("title");
    expect(brokenSpot({ contact_email: "x", city: "x" })).toBe("venue");
    expect(brokenSpot({ ends_on: "x", root: undefined })).toBe("dates");
  });
});

const DAY = "2030-06-01";

describe("battle fields", () => {
  it("sends a start only with a time, on the chosen day", () => {
    expect(battleBody(battleValues(DAY)).starts_at).toBeNull();
    const evening = { ...battleValues(DAY), start_time: "14:30" };
    expect(battleBody(evening).starts_at).toBe("2030-06-01T14:30:00");
    const later = { ...evening, start_day: "2030-06-02" };
    expect(battleBody(later).starts_at).toBe("2030-06-02T14:30:00");
    // A stored start reads back as its day and time.
    const stored = battleValues(DAY, {
      ...battleBody(later),
      id: "b1",
      event_id: "j1",
      name: "1v1 Mixed",
      position: 0,
      created_at: "",
      updated_at: "",
    } as Parameters<typeof battleValues>[1]);
    expect([stored.start_day, stored.start_time]).toEqual([
      "2030-06-02",
      "14:30",
    ]);
  });

  // The examples of `BattleFields::display_name` in the API.
  it("names battles the way the server does", () => {
    const named = (values: Partial<ReturnType<typeof battleValues>>) =>
      defaultBattleName(battleBody({ ...battleValues(DAY), ...values }));
    expect(named({ gender: "bboy" })).toBe("1v1 Bboy");
    expect(
      named({ team_size: "2", preset: "kids", age_min: "8", age_max: "17" }),
    ).toBe("2v2 Mixed Kids");
    expect(named({ format: "seven_to_smoke", gender: "bgirl" })).toBe(
      "Seven to Smoke Bgirl",
    );
    expect(named({ preset: "masters", age_min: "40" })).toBe(
      "1v1 Mixed Masters",
    );
  });

  it("maps presets to the stored ages, and back", () => {
    expect(
      battleBody({
        ...battleValues(DAY),
        preset: "kids",
        age_min: "10",
        age_max: "17",
      }),
    ).toMatchObject({ age: "kids", age_min: 10, age_max: 17 });
    expect(
      battleBody({ ...battleValues(DAY), preset: "masters", age_min: "40" }),
    ).toMatchObject({ age: "adult", age_min: 40, age_max: null });
    expect(battleBody({ ...battleValues(DAY), preset: "na" })).toMatchObject({
      age: "na",
      age_min: null,
    });
    expect(presetOf({ age: "adult", age_min: 45 })).toBe("masters");
    expect(presetOf({ age: "adult", age_min: 18 })).toBe("adult");
  });

  it("sends a team size only for team battles, and blank numbers as null", () => {
    expect(
      battleBody({
        ...battleValues(DAY),
        format: "seven_to_smoke",
        team_size: "3",
      }),
    ).toMatchObject({
      team_size: null,
      bracket_size: null,
      max_entries: null,
      name: null,
    });
    expect(
      battleBody({
        ...battleValues(DAY),
        bracket_size: "16",
        max_entries: "32",
      }),
    ).toMatchObject({ team_size: 1, bracket_size: 16, max_entries: 32 });
  });

  it("sends prizes only with a currency", () => {
    const prizes = { prize_first: "1000", prize_second: "", prize_third: "" };
    expect(
      battleBody({ ...battleValues(DAY), ...prizes, prize_currency: "CHF" }),
    ).toMatchObject({
      prize_currency: "CHF",
      prize_first: 1000,
      prize_second: null,
      prize_third: null,
    });
    expect(battleBody({ ...battleValues(DAY), ...prizes })).toMatchObject({
      prize_currency: null,
      prize_first: null,
    });
  });

  it("knows how many dancers an entry holds", () => {
    expect(membersPerEntry({ format: "team", team_size: 3 })).toBe(3);
    expect(membersPerEntry({ format: "seven_to_smoke" })).toBe(1);
    expect(membersPerEntry({ format: "na" })).toBe(10);
  });

  it("says a battle's fields in words", () => {
    const fields = battleBody({
      ...battleValues(DAY),
      gender: "bboy",
      bracket_size: "16",
      max_entries: "32",
      prize_currency: "EUR",
      prize_first: "500",
    });
    expect(battleSummary(fields, i18n.t, "en")).toBe(
      "1v1 · Bboys · 18+ · Top 16 · 32 spots · 1st €500",
    );
  });
});

describe("battle sheet chips", () => {
  const fresh = () => battleValues(DAY);

  it("starts a new battle as 1v1 Open, of no known format", () => {
    expect(categoryOf(fresh())).toBe("open");
    expect(formatOf(fresh())).toBeUndefined();
  });

  it("sets who may enter, and reads the fields back as the chip", () => {
    const duo = withCategory(fresh(), "duo");
    expect(battleBody(duo)).toMatchObject({ team_size: 2, gender: "mixed" });
    expect(categoryOf(duo)).toBe("duo");
    const bgirl = withCategory(duo, "bgirl");
    expect(battleBody(bgirl)).toMatchObject({ team_size: 1, gender: "bgirl" });
    expect(categoryOf(bgirl)).toBe("bgirl");
    const kids = withCategory(bgirl, "kids");
    expect(battleBody(kids)).toMatchObject({
      gender: "mixed",
      age: "kids",
      age_min: 8,
      age_max: 17,
    });
  });

  it("keeps what a chip leaves open: a crew's size, a kids battle's youngest age", () => {
    const fives = { ...withCategory(fresh(), "crew"), team_size: "5" };
    expect(withCategory(fives, "crew").team_size).toBe("5");
    expect(categoryOf(fives)).toBe("crew");
    expect(withCategory(fresh(), "crew").team_size).toBe("3");
    const fromTen = { ...withCategory(fresh(), "kids"), age_min: "10" };
    expect(categoryOf(fromTen)).toBe("kids");
  });

  it("names Footwork and Powermove, but never over a name that already says it", () => {
    const footwork = withCategory(fresh(), "footwork");
    expect(footwork.name).toBe("1v1 Footwork");
    expect(categoryOf(footwork)).toBe("footwork");
    // Another chip takes back the name it gave, never one that was typed.
    expect(withCategory(footwork, "bboy").name).toBe("");
    const typed = { ...fresh(), name: "Winter Power Move" };
    expect(categoryOf(typed)).toBe("powermove");
    expect(withCategory(typed, "powermove").name).toBe("Winter Power Move");
    expect(withCategory(typed, "bboy").name).toBe("Winter Power Move");
  });

  it("sets the bracket, and lets go when picked again", () => {
    const top16 = withFormat(fresh(), "top16");
    expect(battleBody(top16)).toMatchObject({
      format: "team",
      bracket_size: 16,
    });
    expect(formatOf(top16)).toBe("top16");
    expect(formatOf(withFormat(top16, undefined))).toBeUndefined();
    expect(withFormat(top16, undefined).bracket_size).toBe("");
  });

  it("keeps seven to smoke solo, and a team size a team battle", () => {
    const smoke = withFormat(withCategory(fresh(), "crew"), "smoke");
    expect(battleBody(smoke)).toMatchObject({
      format: "seven_to_smoke",
      team_size: null,
      bracket_size: null,
    });
    expect(categoryOf(smoke)).toBe("open");
    // A 1v1 category keeps it; 2v2 turns it back into a team battle.
    expect(withCategory(smoke, "bgirl").format).toBe("seven_to_smoke");
    expect(battleBody(withCategory(smoke, "duo"))).toMatchObject({
      format: "team",
      team_size: 2,
    });
    // Let go, it gives back the crew it was taken from, never a 1v1.
    const fives = { ...withCategory(fresh(), "crew"), team_size: "5" };
    const back = withFormat(withFormat(fives, "smoke"), undefined);
    expect(battleBody(back)).toMatchObject({ format: "team", team_size: 5 });
    expect(withCategory(withFormat(fives, "smoke"), "crew").team_size).toBe(
      "5",
    );
  });

  /** A battle as the API returns it: the server stores the name it made when none was given. */
  const stored = (fields: Partial<Parameters<typeof battleBody>[0]> = {}) => {
    const body = battleBody({ ...fresh(), ...fields });
    return battleValues(DAY, {
      ...body,
      id: "b1",
      event_id: "j1",
      name: body.name ?? defaultBattleName(body),
      position: 0,
      created_at: "",
      updated_at: "",
    } as Parameters<typeof battleValues>[1]);
  };

  it("makes a showcase a format of its own, of any size, that never touches the name", () => {
    const showcase = withFormat(withCategory(fresh(), "crew"), "showcase");
    expect(battleBody(showcase)).toMatchObject({
      name: null,
      format: "showcase",
      team_size: 3,
      bracket_size: null,
    });
    expect([categoryOf(showcase), formatOf(showcase)]).toEqual([
      "crew",
      "showcase",
    ]);
    // A category keeps it a showcase; picked again, Showcase lets go, typed name or not.
    expect(withCategory(showcase, "kids").format).toBe("showcase");
    const winter = { ...showcase, name: "Winter Showcase" };
    expect(formatOf(withFormat(winter, undefined))).toBeUndefined();
    expect(battleBody(withFormat(winter, undefined))).toMatchObject({
      format: "team",
      team_size: 3,
      name: "Winter Showcase",
    });
    // Footwork names the battle, Showcase sets the format: both stay lit.
    const both = withFormat(withCategory(fresh(), "footwork"), "showcase");
    expect([categoryOf(both), formatOf(both)]).toEqual([
      "footwork",
      "showcase",
    ]);
  });

  it("loads a name the server made as blank, so it follows the fields", () => {
    const bboy = stored({ gender: "bboy" });
    expect(bboy.name).toBe("");
    expect(battleBody(withCategory(bboy, "bgirl")).name).toBeNull();
    const typed = stored({ gender: "bboy", name: "Winter Kings" });
    expect(battleBody(withCategory(typed, "bgirl")).name).toBe("Winter Kings");
    // A stored seven to smoke reads as its chips again.
    const smoke = stored({ format: "seven_to_smoke", gender: "bgirl" });
    expect([categoryOf(smoke), formatOf(smoke)]).toEqual(["bgirl", "smoke"]);
  });

  it("leaves an imported battle of unknown size as it is under a bracket", () => {
    const unknown = stored({ format: "na", name: "Crew battle" });
    expect(unknown.team_size).toBe("");
    expect([categoryOf(unknown), formatOf(unknown)]).toEqual([
      undefined,
      undefined,
    ]);
    const top16 = withFormat(unknown, "top16");
    expect(battleBody(top16)).toMatchObject({
      format: "na",
      team_size: null,
      bracket_size: 16,
    });
    expect(formatOf(top16)).toBe("top16");
    expect(battleBody(withFormat(top16, undefined)).format).toBe("na");
    // A showcase of it keeps the size open; a category gives it one.
    expect(battleBody(withFormat(unknown, "showcase"))).toMatchObject({
      format: "showcase",
      team_size: null,
    });
    expect(battleBody(withCategory(unknown, "crew"))).toMatchObject({
      format: "team",
      team_size: 3,
    });
  });

  it("lights no chip for what none says", () => {
    const bgirlCrew = {
      ...withCategory(fresh(), "crew"),
      gender: "bgirl" as const,
    };
    expect(categoryOf(bgirlCrew)).toBeUndefined();
    const masters = { ...fresh(), preset: "masters" as const, age_min: "40" };
    expect(categoryOf(masters)).toBeUndefined();
    expect(formatOf({ ...fresh(), bracket_size: "64" })).toBeUndefined();
  });

  it("says a showcase's size in words", () => {
    const showcase = battleBody(
      withFormat(withCategory(fresh(), "crew"), "showcase"),
    );
    expect(battleSummary(showcase, i18n.t, "en")).toBe(
      "Showcase · Crews of 3 · Everyone · 18+",
    );
    expect(defaultBattleName(showcase)).toBe("Showcase Mixed");
    expect(membersPerEntry({ format: "showcase", team_size: 3 })).toBe(3);
    expect(membersPerEntry({ format: "showcase" })).toBe(10);
  });

  /** Battles as organisers and the import leave them, as form values over a new one. */
  const SHAPES: Record<string, Partial<Parameters<typeof battleBody>[0]>> = {
    "1v1 Bboy": { gender: "bboy" },
    "2v2 Kids from 10": {
      team_size: "2",
      preset: "kids",
      age_min: "10",
      age_max: "17",
    },
    "3v3 Bgirl Masters, Top 64": {
      team_size: "3",
      gender: "bgirl",
      preset: "masters",
      age_min: "40",
      bracket_size: "64",
    },
    "Seven to Smoke": { format: "seven_to_smoke", team_size: "1" },
    "imported crew battle": {
      format: "na",
      team_size: "",
      name: "Crew battle",
    },
    "crew showcase": { format: "showcase", team_size: "5" },
    "showcase of any size": { format: "showcase", team_size: "" },
    "no age, prizes, a start and a name": {
      preset: "na",
      age_min: "",
      max_entries: "32",
      prize_currency: "CHF",
      prize_first: "1000",
      prize_third: "250",
      start_time: "14:30",
      name: "Winter Kings",
    },
  };

  it.each(Object.entries(SHAPES))(
    "saves a stored %s as it was when nothing is touched",
    (_, shape) => {
      expect(battleBody(stored(shape))).toEqual(
        battleBody({ ...fresh(), ...shape }),
      );
    },
  );

  /** What the API refuses of a body (`BattleFields` in backend/src/domain/battle.rs), by field. */
  const refused = (body: ReturnType<typeof battleBody>) => {
    const size = body.team_size ?? null;
    const sized = size !== null && size >= 1 && size <= 10;
    return [
      body.format === "team" && !sized && "team_size",
      ["seven_to_smoke", "na"].includes(body.format) &&
        size !== null &&
        "team_size",
      body.format === "showcase" && size !== null && !sized && "team_size",
      body.age === "kids" && !((body.age_max ?? 99) <= 17) && "age_max",
      body.age === "adult" && !((body.age_min ?? 0) >= 18) && "age_min",
      body.age_min != null &&
        body.age_max != null &&
        body.age_max < body.age_min &&
        "age_max",
      body.bracket_size != null &&
        ![2, 4, 8, 16, 32, 64].includes(body.bracket_size) &&
        "bracket_size",
    ].filter(Boolean);
  };

  it.each(Object.entries(SHAPES))(
    "gives a body the API takes, whatever chips are picked on a %s",
    (_, shape) => {
      const start = stored(shape);
      const picks = [
        ...CATEGORIES.map((chip) => (v: typeof start) => withCategory(v, chip)),
        ...[...FORMATS, undefined].map(
          (chip) => (v: typeof start) => withFormat(v, chip),
        ),
      ];
      for (const first of picks) {
        for (const second of picks) {
          const values = second(first(start));
          expect(refused(battleBody(values))).toEqual([]);
        }
      }
      // A picked chip lights up, and picking it again changes nothing.
      for (const chip of FORMATS) {
        expect(formatOf(withFormat(start, chip))).toBe(chip);
        // A format chip tapped by mistake and let go leaves the size as it was.
        const undone = withFormat(withFormat(start, chip), undefined);
        expect(battleBody(undone).team_size).toBe(
          battleBody(withFormat(start, undefined)).team_size,
        );
      }
      for (const chip of CATEGORIES) {
        const picked = withCategory(start, chip);
        expect(withCategory(picked, chip)).toEqual(picked);
        expect(categoryOf(picked)).toBe(chip);
      }
    },
  );
});

describe("entry fields", () => {
  it("reads video start times as h:mm:ss, m:ss or seconds", () => {
    expect(parseOffset("1:02:03")).toBe(3723);
    expect(parseOffset("2:15")).toBe(135);
    expect(parseOffset("90")).toBe(90);
    expect(parseOffset("")).toBeNull();
    expect(parseOffset("1h2m")).toBeNull();
    expect(formatOffset(3723)).toBe("1:02:03");
    expect(formatOffset(135)).toBe("2:15");
    expect(formatOffset(null)).toBe("");
  });

  it("builds the body from the form and the pickers", () => {
    const body = entryBody(
      {
        ...entryValues(),
        team_name: " Floor Lords ",
        reached: "winner",
        video_url: "https://youtu.be/dQw4w9WgXcQ",
        video_start: "0:42",
      },
      { dancerIds: ["a", "b"], crewId: "c" },
    );
    expect(body).toEqual({
      team_name: "Floor Lords",
      crew_id: "c",
      dancer_ids: ["a", "b"],
      status: "confirmed",
      reached: "winner",
      final_rank: null,
      video_url: "https://youtu.be/dQw4w9WgXcQ",
      video_offset_seconds: 42,
    });
    // No video, no start time.
    expect(
      entryBody(
        { ...entryValues(), video_start: "0:42" },
        {
          dancerIds: ["a"],
          crewId: null,
        },
      ).video_offset_seconds,
    ).toBeNull();
  });

  it("names an entry by its team, else its members", () => {
    const members = [
      { id: "a", dancer_name: "Lil G", country: "FR", deleted: false },
      { id: "b", dancer_name: "Ventus", country: "FR", deleted: false },
    ];
    expect(entryLabel({ team_name: null, members })).toBe("Lil G & Ventus");
    expect(entryLabel({ team_name: "Floor Lords", members })).toBe(
      "Floor Lords",
    );
  });
});
