import {
  dayAndMonth,
  daysOf,
  formatBattleStart,
  formatDateRange,
  formatShortDateRange,
  yearOf,
} from "../../src/lib/dates";

describe("dates", () => {
  // Punctuation varies with the ICU version, so match the parts that carry meaning.
  it("formats one day and ranges in each language", () => {
    expect(formatDateRange("2026-11-14", "2026-11-14", "en")).toMatch(
      /^Saturday,? 14 November 2026$/,
    );
    expect(formatDateRange("2026-11-14", "2026-11-15", "en")).toMatch(
      /^Saturday,? 14.+Sunday,? 15 November 2026$/,
    );
    expect(formatDateRange("2026-11-14", "2026-11-14", "fr")).toMatch(
      /^samedi 14 novembre 2026$/,
    );
    expect(formatDateRange("2026-11-14", "2026-11-14", "de")).toMatch(
      /^Samstag, 14\. November 2026$/,
    );
  });

  it("has a short form for labels", () => {
    expect(formatShortDateRange("2026-11-14", "2026-11-14", "en")).toMatch(
      /^Sat,? 14 Nov$/,
    );
    expect(formatShortDateRange("2026-11-14", "2026-11-15", "en")).toMatch(
      /^Sat,? 14.+Sun,? 15 Nov$/,
    );
    expect(formatShortDateRange("2026-11-14", "2026-11-14", "fr")).toMatch(
      /^sam\. 14 nov\.$/,
    );
  });

  it("never shifts a calendar date", () => {
    expect(dayAndMonth("2026-01-01", "en")).toEqual({ day: "1", month: "Jan" });
    expect(dayAndMonth("2026-12-31", "fr")).toEqual({
      day: "31",
      month: "déc",
    });
    expect(yearOf("2026-12-31")).toBe(2026);
  });

  it("lists a jam's days, across a month end", () => {
    expect(daysOf("2023-09-22", "2023-09-24")).toEqual([
      "2023-09-22",
      "2023-09-23",
      "2023-09-24",
    ]);
    expect(daysOf("2030-06-30", "2030-07-01")).toEqual([
      "2030-06-30",
      "2030-07-01",
    ]);
    expect(daysOf("2030-06-01", "2030-06-01")).toEqual(["2030-06-01"]);
  });

  it("gives a battle's start as a time, with the day when the jam runs several days", () => {
    expect(formatBattleStart("2023-09-23T14:30:00", true, "en")).toBe("14:30");
    expect(formatBattleStart("2023-09-23T14:30:00", false, "en")).toMatch(
      /^Sat,? 23 Sept?,? 14:30$/,
    );
    expect(formatBattleStart("2023-09-23T14:30:00", false, "fr")).toMatch(
      /^sam\.? 23 sept\.?,? 14:30$/,
    );
  });
});
