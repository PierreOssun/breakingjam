import { instagramLabel } from "./instagram";

describe("instagramLabel", () => {
  it("shows the handle of a profile link", () => {
    expect(instagramLabel("https://www.instagram.com/paris.cypher")).toBe(
      "@paris.cypher",
    );
    expect(instagramLabel("https://instagram.com/paris.cypher/?hl=fr")).toBe(
      "@paris.cypher",
    );
  });

  it("falls back to the host, or the text itself", () => {
    expect(instagramLabel("https://www.instagram.com/")).toBe("instagram.com");
    expect(instagramLabel("https://linktr.ee/jam")).toBe("linktr.ee");
    expect(instagramLabel("not a link")).toBe("not a link");
  });
});
