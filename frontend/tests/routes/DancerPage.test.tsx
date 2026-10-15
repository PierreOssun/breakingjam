import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LOGGED_OUT, mockApi, renderApp } from "../support/app";

const at = "2026-10-01T10:00:00Z";
const DANCER = {
  id: "01920000-0000-7000-8000-0000000000d1",
  dancer_name: "Lil G",
  aliases: ["G", "Lil Gee"],
  real_name: null,
  country: "FR",
  country2: "MA",
  city: "Paris",
  bio: null,
  instagram_handle: "lilg",
  source: "seed",
  verified_at: "2026-01-01T00:00:00Z",
  avatar_url: null,
  merged_into_id: null,
  created_at: at,
  updated_at: at,
  crews: [{ id: "c1", name: "Floor Lords", since: null }],
  can_edit: false,
};

const jam = (n: number, startsOn: string, country = "FR") => ({
  id: `jam-${n}`,
  name: `Jam ${n}`,
  slug: `jam-${n}`,
  starts_on: startsOn,
  ends_on: startsOn,
  city: "Paris",
  country,
  status: "completed",
});

const oneVOne = {
  id: "b1",
  name: "1v1 Bboy",
  format: "team",
  team_size: 1,
  gender: "bboy",
  age: "adult",
};

// 12 past jams: 2025 first (most recent), then 2024.
const PAST = [
  {
    event: jam(1, "2025-11-01"),
    battle: oneVOne,
    role: "competitor",
    reached: "winner",
    final_rank: 1,
    video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    event: jam(2, "2025-09-01", "DE"),
    battle: oneVOne,
    role: "competitor",
    reached: "top8",
  },
  { event: jam(3, "2025-06-01"), role: "judge" },
  ...Array.from({ length: 9 }, (_, i) => ({
    event: jam(4 + i, `2024-${String(12 - i).padStart(2, "0")}-01`),
    battle: oneVOne,
    role: "competitor",
    reached: "prelims",
  })),
];

const UPCOMING = [
  {
    event: { ...jam(20, "2030-06-01"), status: "published" },
    battle: oneVOne,
    role: "competitor",
    reached: "na",
  },
];

function mockDancer(events = { upcoming: UPCOMING, past: PAST }) {
  return mockApi({
    "GET /api/auth/me": LOGGED_OUT,
    [`GET /api/dancers/${DANCER.id}`]: { status: 200, body: DANCER },
    [`GET /api/dancers/${DANCER.id}/events`]: { status: 200, body: events },
  });
}

describe("DancerPage", () => {
  it("shows the identity card, crews and city", async () => {
    mockDancer();
    renderApp(`/dancers/${DANCER.id}`);
    const main = within(await screen.findByRole("main"));

    expect(
      await main.findByRole("heading", { level: 1, name: "Lil G" }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Lil G · BreakingJam");
    expect(main.getByRole("img", { name: "Verified" })).toBeInTheDocument();
    expect(main.getByRole("img", { name: "France" })).toBeInTheDocument();
    expect(main.getByRole("img", { name: "Morocco" })).toBeInTheDocument();
    expect(main.getByText("aka G · Lil Gee")).toBeInTheDocument();
    const instagram = main.getByRole("link", { name: "@lilg" });
    expect(instagram).toHaveAttribute("href", "https://instagram.com/lilg");
    expect(instagram).toHaveAttribute("target", "_blank");
    expect(main.getByText("Floor Lords")).toBeInTheDocument();
    expect(main.getByText("Paris", { selector: "span" })).toBeInTheDocument();
  });

  it("counts past jams in the stats strip", async () => {
    mockDancer();
    renderApp(`/dancers/${DANCER.id}`);

    const strip = (await screen.findByText("jams")).closest("dl")!;
    const cells = [...strip.querySelectorAll("div")].map((cell) => [
      cell.querySelector("dt")?.textContent,
      cell.querySelector("dd")?.textContent,
    ]);
    // 12 jams in FR and DE over 2024–2025, one win; the judge spot counts as a jam.
    expect(cells).toEqual([
      ["jams", "12"],
      ["countries", "2"],
      ["years active", "2"],
      ["podium", "1"],
    ]);
  });

  it("lists upcoming then past jams, by year, ten at a time", async () => {
    mockDancer();
    renderApp(`/dancers/${DANCER.id}`);
    const main = within(await screen.findByRole("main"));

    const upcoming = (
      await main.findByRole("heading", { name: "Upcoming" })
    ).closest("section")!;
    expect(
      await within(upcoming).findByRole("link", { name: /Jam 20/ }),
    ).toHaveAttribute("href", "/jams/jam-20");
    expect(within(upcoming).getByText("1v1 Bboy")).toBeInTheDocument();

    const past = main
      .getByRole("heading", { name: "Past" })
      .closest("section")!;
    expect(within(past).getByText("2025")).toBeInTheDocument();
    expect(within(past).getByText("2024")).toBeInTheDocument();
    expect(within(past).getByText("1st")).toBeInTheDocument();
    expect(within(past).getByText("Top 8")).toBeInTheDocument();
    expect(within(past).getByText("Judge")).toBeInTheDocument();
    expect(within(past).getAllByRole("link")).toHaveLength(10);

    await userEvent.click(
      within(past).getByRole("button", { name: "Show more (2)" }),
    );
    expect(within(past).getAllByRole("link")).toHaveLength(12);
    expect(
      within(past).queryByRole("button", { name: /Show more/ }),
    ).not.toBeInTheDocument();
  });

  it("plays a past battle's video", async () => {
    mockDancer();
    renderApp(`/dancers/${DANCER.id}`);

    await userEvent.click(
      await screen.findByRole("button", { name: "Watch Jam 1" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Video: Jam 1 — 1v1 Bboy",
    });
    expect(dialog.querySelector("iframe")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
    );
  });

  it("says so when there is nothing yet, and hides the empty stats", async () => {
    mockDancer({ upcoming: [], past: [] });
    renderApp(`/dancers/${DANCER.id}`);

    expect(await screen.findByText("No upcoming jams.")).toBeInTheDocument();
    expect(screen.getByText(/No past jams on record yet/)).toBeInTheDocument();
    expect(screen.queryByText("jams")).not.toBeInTheDocument();
  });

  it("follows a merge to the surviving dancer", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/dancers/old-id": {
        status: 200,
        body: { merged_into: DANCER.id },
      },
      [`GET /api/dancers/${DANCER.id}`]: { status: 200, body: DANCER },
      [`GET /api/dancers/${DANCER.id}/events`]: {
        status: 200,
        body: { upcoming: [], past: [] },
      },
    });
    const router = renderApp("/dancers/old-id");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Lil G" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/dancers/${DANCER.id}`),
    );
  });

  it("is a not-found page for unknown dancers", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/dancers/nobody");

    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });
});
