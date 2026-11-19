import {
  addMonths,
  dayLabel,
  defaultRange,
  monthCounts,
  presetOf,
  presetRange,
  rangeFromUrl,
  rangeLabel,
  runsIn,
  sliderMonths,
  writeRange,
} from "../../../src/features/map/range";

const today = "2026-11-17";

describe("map date range", () => {
  it("defaults to today … a year from today", () => {
    expect(defaultRange(today)).toEqual({ from: today, to: "2027-11-17" });
  });

  it("adds months, ending on a shorter month's last day", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-17", 6)).toBe("2027-05-17");
    expect(addMonths("2026-12-31", -1)).toBe("2026-11-30");
  });

  it("names a preset only on an exact match", () => {
    expect(presetRange(6, today)).toEqual({ from: today, to: "2027-05-17" });
    expect(presetOf({ from: today, to: "2027-05-17" }, today)).toBe(6);
    expect(presetOf(defaultRange(today), today)).toBe(12);
    expect(presetOf({ from: today, to: "2027-05-18" }, today)).toBeNull();
    expect(
      presetOf({ from: "2026-11-18", to: "2027-05-17" }, today),
    ).toBeNull();
  });

  it("shows a jam with any day in the range", () => {
    const range = { from: "2026-12-01", to: "2026-12-31" };
    // Starts before From, ends inside.
    expect(
      runsIn({ starts_on: "2026-11-30", ends_on: "2026-12-01" }, range),
    ).toBe(true);
    expect(
      runsIn({ starts_on: "2026-12-31", ends_on: "2027-01-02" }, range),
    ).toBe(true);
    expect(
      runsIn({ starts_on: "2026-11-28", ends_on: "2026-11-30" }, range),
    ).toBe(false);
    expect(
      runsIn({ starts_on: "2027-01-01", ends_on: "2027-01-01" }, range),
    ).toBe(false);
  });

  it("reads the URL, clamping a past From and a To beyond a year", () => {
    const read = (search: string) =>
      rangeFromUrl(new URLSearchParams(search), today);
    expect(read("")).toEqual(defaultRange(today));
    expect(read("from=2027-02-03&to=2027-05-15")).toEqual({
      from: "2027-02-03",
      to: "2027-05-15",
    });
    expect(read("from=2020-01-01&to=2030-01-01")).toEqual(defaultRange(today));
    // A To before From is From: one day.
    expect(read("from=2027-03-01&to=2027-01-01")).toEqual({
      from: "2027-03-01",
      to: "2027-03-01",
    });
    expect(read("from=soon&to=2027-02-31")).toEqual({
      from: today,
      to: "2027-03-03",
    });
  });

  it("writes the URL only off the default, and reads back what it wrote", () => {
    const params = new URLSearchParams("q=zurich");
    writeRange(params, defaultRange(today), today);
    expect(params.toString()).toBe("q=zurich");

    const range = { from: "2027-02-03", to: "2027-05-15" };
    writeRange(params, range, today);
    expect(params.toString()).toBe("q=zurich&from=2027-02-03&to=2027-05-15");
    expect(rangeFromUrl(params, today)).toEqual(range);

    writeRange(params, defaultRange(today), today);
    expect(params.toString()).toBe("q=zurich");
  });

  it("counts the jams of each of the slider's 12 months", () => {
    const months = sliderMonths(today);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ from: today, to: "2026-12-16" });
    expect(months[11]).toEqual({ from: "2027-10-17", to: "2027-11-16" });

    const counts = monthCounts(
      [
        { starts_on: "2026-11-20", ends_on: "2026-11-20" },
        // Over the first two months' line: in both.
        { starts_on: "2026-12-16", ends_on: "2026-12-17" },
        { starts_on: "2027-06-01", ends_on: "2027-06-01" },
        // Past the year: in none.
        { starts_on: "2028-01-01", ends_on: "2028-01-01" },
      ],
      today,
    );
    expect(counts).toEqual([2, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
  });

  it("reads Now for today, and a year only when it isn't this one", () => {
    expect(dayLabel(today, today, "en", "Now")).toBe("Now");
    expect(dayLabel("2026-12-03", today, "en", "Now")).toBe("3 Dec");
    expect(dayLabel("2027-02-03", today, "en", "Now")).toBe("3 Feb 2027");
    expect(rangeLabel(defaultRange(today), today, "en", "Now")).toBe(
      "Now – 17 Nov 2027",
    );
    expect(dayLabel("2027-02-03", today, "de", "Jetzt")).toBe("3. Feb. 2027");
  });
});
