import {
  battleBody,
  battleValues,
  defaultBattleName,
  membersPerEntry,
  presetOf,
} from "../../../src/features/jams/battleFields";
import {
  entryBody,
  entryLabel,
  entryValues,
  formatOffset,
  parseOffset,
} from "../../../src/features/jams/entryFields";
import {
  emptyJam,
  jamBody,
  jamValues,
} from "../../../src/features/jams/jamFields";

describe("jam fields", () => {
  it("trims, and sends blanks as null", () => {
    const body = jamBody({
      ...emptyJam(),
      name: "  Paris Cypher ",
      starts_on: "2030-06-01",
      ends_on: "2030-06-01",
      city: " Paris ",
      country: "FR",
      venue_name: "  ",
      registration_url: "https://example.com/register",
      contact_email: " hello@pariscypher.com ",
    });
    expect(body).toMatchObject({
      name: "Paris Cypher",
      city: "Paris",
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
});

const DAY = "2030-06-01";

describe("one-day jams", () => {
  it("send their single date as both days", () => {
    const body = jamBody({
      ...emptyJam(),
      one_day: true,
      starts_on: "2030-06-08",
      ends_on: "2030-06-12",
    });
    expect([body.starts_on, body.ends_on]).toEqual([
      "2030-06-08",
      "2030-06-08",
    ]);
  });

  it("open ticked when the stored days are the same", () => {
    const jam = { ...emptyJam(), starts_on: "2030-06-08" } as never;
    expect(
      jamValues({ ...(jam as object), ends_on: "2030-06-08" } as never).one_day,
    ).toBe(true);
    expect(
      jamValues({ ...(jam as object), ends_on: "2030-06-09" } as never).one_day,
    ).toBe(false);
  });
});

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
      { id: "a", dancer_name: "Lil G", country: "FR" },
      { id: "b", dancer_name: "Ventus", country: "FR" },
    ];
    expect(entryLabel({ team_name: null, members })).toBe("Lil G & Ventus");
    expect(entryLabel({ team_name: "Floor Lords", members })).toBe(
      "Floor Lords",
    );
  });
});
