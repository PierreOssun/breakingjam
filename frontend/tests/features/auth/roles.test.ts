import { atLeast } from "../../../src/features/auth/roles";

describe("atLeast", () => {
  it("orders roles as the API does", () => {
    expect(atLeast("super_admin", "admin")).toBe(true);
    expect(atLeast("admin", "admin")).toBe(true);
    expect(atLeast("seed_admin", "admin")).toBe(false);
    expect(atLeast("organizer", "user")).toBe(true);
    expect(atLeast("user", "organizer")).toBe(false);
  });
});
