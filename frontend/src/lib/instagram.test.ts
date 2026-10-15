import { instagramLabel, toHandle } from "./instagram";

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

describe("toHandle", () => {
  it("keeps the handle from whatever was typed or pasted", () => {
    expect(toHandle("@lil_g")).toBe("lil_g");
    expect(toHandle("  lil_g ")).toBe("lil_g");
    expect(toHandle("https://www.instagram.com/lil_g/?hl=fr")).toBe("lil_g");
    expect(toHandle("instagram.com/lil.g")).toBe("lil.g");
    expect(toHandle("")).toBe("");
  });
});
