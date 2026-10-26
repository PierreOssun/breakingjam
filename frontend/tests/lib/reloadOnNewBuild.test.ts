import { reloadOnNewBuild } from "../../src/lib/reloadOnNewBuild";

// One listener for the whole file, as in the app.
const reload = vi.fn();
reloadOnNewBuild(reload);

/** What Vite's build dispatches when a page file fails to load. */
const pageFileFails = () =>
  window.dispatchEvent(new Event("vite:preloadError"));

describe("reloadOnNewBuild", () => {
  beforeEach(() => {
    reload.mockClear();
    sessionStorage.clear();
    vi.useFakeTimers({ now: new Date("2026-10-26T10:00:00Z") });
  });
  afterEach(() => vi.useRealTimers());

  it("reloads when a page file of the old build is gone", () => {
    pageFileFails();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reloads once a minute at most, so a missing file can't loop", () => {
    pageFileFails();
    pageFileFails();
    expect(reload).toHaveBeenCalledOnce();
    vi.setSystemTime(new Date("2026-10-26T10:01:01Z"));
    pageFileFails();
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
