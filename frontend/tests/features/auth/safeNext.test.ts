import { beyondWelcome, safeNext } from "../../../src/features/auth/safeNext";

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

describe("beyondWelcome", () => {
  it("skips a sign-up's welcome step, keeping where it leads", () => {
    expect(beyondWelcome("/welcome?next=%2Forg%2Fjams")).toBe("/org/jams");
    expect(beyondWelcome("/welcome")).toBe("/");
  });

  it("keeps any other page, and never leads off-site", () => {
    expect(beyondWelcome("/jams/paris?tab=battles")).toBe(
      "/jams/paris?tab=battles",
    );
    expect(beyondWelcome("/welcome?next=%2F%2Fevil.com")).toBe("/");
  });
});
