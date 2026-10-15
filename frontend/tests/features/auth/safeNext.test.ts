import { safeNext } from "../../../src/features/auth/safeNext";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/org/jams/new?step=2")).toBe("/org/jams/new?step=2");
  });

  it.each([
    null,
    "",
    "//evil.com",
    "https://evil.com",
    "/\\evil.com",
    "/jams\nSet-Cookie: x",
  ])("falls back to / for %j", (next) => {
    expect(safeNext(next)).toBe("/");
  });
});
