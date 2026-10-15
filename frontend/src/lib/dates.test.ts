import {
  dayAndMonth,
  formatDateRange,
  formatShortDateRange,
  yearOf,
} from "./dates";

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
});
