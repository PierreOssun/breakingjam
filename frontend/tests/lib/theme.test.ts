import { setTheme } from "../../src/lib/theme";

describe("theme", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("remembers the choice across reloads", async () => {
    setTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("bj.theme")).toBe("light");

    // A reload: the page starts without the attribute and a fresh module reads the choice.
    delete document.documentElement.dataset.theme;
    vi.resetModules();
    const reloaded = await import("../../src/lib/theme");
    reloaded.applyTheme();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("leaves Auto to the OS setting", () => {
    setTheme("dark");
    setTheme("auto");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("bj.theme")).toBe("auto");
  });
});
