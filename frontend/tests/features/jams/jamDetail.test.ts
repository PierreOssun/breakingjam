import {
  actionCaption,
  countdown,
  directionsUrl,
  firstStart,
  initialsOf,
  primaryAction,
  shareTitle,
  totalPrizes,
  whoIsIn,
} from "../../../src/features/jams/jamDetail";

const JAM = {
  status: "published" as const,
  starts_on: "2030-06-08",
  ends_on: "2030-06-09",
  timezone: "Europe/Zurich",
};
/** A moment given as the jam's own wall clock (Zurich is UTC+2 in June). */
const zurich = (local: string) => new Date(`${local}+02:00`);

describe("the countdown chip", () => {
  it("counts the days until the jam, in its own timezone", () => {
    expect(countdown(JAM, null, zurich("2030-05-30T12:00"))).toEqual({
      key: "days",
      count: 9,
    });
    expect(countdown(JAM, null, zurich("2030-06-07T23:30"))).toEqual({
      key: "tomorrow",
    });
    // 00:30 in Zurich is still the 7th in UTC: the jam's clock decides.
    expect(countdown(JAM, null, zurich("2030-06-08T00:30"))).toEqual({
      key: "today",
    });
  });

  it("goes live with the first battle, or from the second day", () => {
    const start = "2030-06-08T14:00:00";
    expect(countdown(JAM, start, zurich("2030-06-08T13:59"))).toEqual({
      key: "today",
    });
    expect(countdown(JAM, start, zurich("2030-06-08T14:00"))).toEqual({
      key: "live",
    });
    expect(countdown(JAM, null, zurich("2030-06-09T09:00"))).toEqual({
      key: "live",
    });
  });

  it("is gone once the jam is over, completed or cancelled", () => {
    expect(countdown(JAM, null, zurich("2030-06-10T09:00"))).toBeNull();
    const early = zurich("2030-05-30T12:00");
    expect(countdown({ ...JAM, status: "completed" }, null, early)).toBeNull();
    expect(countdown({ ...JAM, status: "cancelled" }, null, early)).toBeNull();
  });

  it("survives an unknown timezone", () => {
    const jam = { ...JAM, timezone: "Mars/Olympus" };
    expect(countdown(jam, null, zurich("2030-05-30T12:00"))?.key).toBe("days");
  });
});

describe("the primary action", () => {
  const url = "https://example.com/register";
  it("follows the jam's state", () => {
    expect(primaryAction({ status: "published", registration_url: url })).toBe(
      "register",
    );
    expect(primaryAction({ status: "published", registration_url: null })).toBe(
      "calendar",
    );
    expect(
      primaryAction({ status: "registration_closed", registration_url: url }),
    ).toBe("calendar");
    expect(primaryAction({ status: "completed", registration_url: url })).toBe(
      "results",
    );
    expect(
      primaryAction({ status: "cancelled", registration_url: url }),
    ).toBeNull();
  });

  it("captions the action card", () => {
    expect(actionCaption({ status: "published", registration_url: url })).toBe(
      "open",
    );
    expect(
      actionCaption({ status: "registration_closed", registration_url: url }),
    ).toBe("closed");
    expect(actionCaption({ status: "published", registration_url: null })).toBe(
      "spectators",
    );
    expect(
      actionCaption({ status: "completed", registration_url: null }),
    ).toBeNull();
    expect(actionCaption({ status: "cancelled", registration_url: url })).toBe(
      "cancelled",
    );
  });
});

const battle = (extra: object) =>
  ({
    prize_currency: null,
    prize_first: null,
    prize_second: null,
    prize_third: null,
    starts_at: null,
    ...extra,
  }) as never;

describe("the jam's numbers", () => {
  it("sums every battle's prizes per currency", () => {
    const eur = { prize_currency: "EUR", prize_first: 1000, prize_second: 500 };
    expect(
      totalPrizes(
        [battle(eur), battle({ prize_currency: "EUR", prize_first: 250 })],
        "en",
      ),
    ).toBe("€1,750");
    expect(
      totalPrizes(
        [battle({ prize_currency: "CHF", prize_first: 1000 }), battle(eur)],
        "en",
      ),
    ).toMatch(/^CHF\s1,000 \+ €1,500$/); // Intl puts a no-break space after the code
    expect(totalPrizes([battle({})], "en")).toBeNull();
  });

  it("finds the first announced start", () => {
    expect(
      firstStart([
        battle({ starts_at: "2030-06-08T18:00:00" }),
        battle({}),
        battle({ starts_at: "2030-06-08T14:00:00" }),
      ]),
    ).toBe("2030-06-08T14:00:00");
    expect(firstStart([battle({})])).toBeNull();
  });

  it("counts each competitor once and leaves out withdrawn entries", () => {
    const d = (id: string) => ({ id, dancer_name: id, country: "FR" });
    const entry = (status: string, ids: string[]) =>
      ({ status, members: ids.map(d) }) as never;
    const who = whoIsIn(
      [
        entry("confirmed", ["a", "b"]),
        entry("pending", ["a"]),
        entry("withdrawn", ["c"]),
      ],
      [
        { role: "judge", dancer: d("j") },
        { role: "dj", dancer: d("krate") },
      ] as never,
    );
    expect(who.dancers.map((x) => x.id)).toEqual(["a", "b"]);
    expect(who.staff.map((x) => x.id)).toEqual(["j", "krate"]);
    expect(who.judges).toHaveLength(1);
    expect(who.djs.map((x) => x.id)).toEqual(["krate"]);
    expect(who.mcs).toEqual([]);
  });
});

describe("the lineup in Who's in", () => {
  it("shows a dancer with two roles once", () => {
    const kai = { id: "kai", dancer_name: "Sensei Kai", country: "JP" };
    const who = whoIsIn([], [
      { role: "judge", dancer: kai },
      { role: "mc", dancer: kai },
    ] as never);
    expect(who.staff).toEqual([kai]);
    expect(who.judges).toEqual([kai]);
    expect(who.mcs).toEqual([kai]);
  });
});

describe("sharing and directions", () => {
  it("titles a share with the jam's date and city", () => {
    const jam = {
      name: "Paris Cypher",
      starts_on: "2030-06-08",
      ends_on: "2030-06-08",
      city: "Paris",
    };
    expect(shareTitle(jam, "en")).toMatch(
      /^Paris Cypher · Sat,? 8 Jun · Paris$/,
    );
  });

  it("opens the platform's maps app", () => {
    const venue = { lat: 48.8566, lng: 2.3522 };
    expect(directionsUrl(venue, "apple")).toBe(
      "https://maps.apple.com/?daddr=48.8566,2.3522",
    );
    expect(directionsUrl(venue, "google")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=48.8566,2.3522",
    );
  });
});

describe("the organiser card", () => {
  it("shows initials until organisers have logos", () => {
    expect(initialsOf("Floor Lords e.V.")).toBe("FL");
    expect(initialsOf("dj krate")).toBe("DK");
    expect(initialsOf("  Cypher   Collective  Paris ")).toBe("CC");
    expect(initialsOf("@ 42")).toBe("?");
  });
});
