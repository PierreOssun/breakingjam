import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIL_G, LOGGED_OUT, bodyOf, mockApi, renderApp } from "../support/app";

const at = "2026-10-01T10:00:00Z";
const JAM = {
  id: "01920000-0000-7000-8000-00000000e001",
  organizer_id: "01920000-0000-7000-8000-0000000000a1",
  name: "Paris Cypher Sessions",
  slug: "paris-cypher-sessions-00e001",
  description: "Open floor.\nBring your crew.",
  status: "published",
  starts_on: "2030-06-01",
  ends_on: "2030-06-02",
  timezone: "Europe/Paris",
  venue_name: "Le Hangar",
  address: "12 Rue des Arts",
  city: "Paris",
  country: "FR",
  lat: 48.8566,
  lng: 2.3522,
  registration_url: "https://example.com/register",
  instagram_url: "https://www.instagram.com/paris.cypher",
  created_at: at,
  updated_at: at,
  can_edit: false,
  organizer: {
    id: "01920000-0000-7000-8000-0000000000a1",
    display_name: "Floor Lords e.V.",
    instagram_handle: "floor.lords",
    verified: true,
  },
};

const battle = (
  id: string,
  name: string,
  teamSize: number,
  maxEntries: number | null,
) => ({
  id,
  event_id: JAM.id,
  name,
  format: "team",
  team_size: teamSize,
  gender: "mixed",
  age: "adult",
  age_min: 18,
  max_entries: maxEntries,
  position: 0,
  created_at: at,
  updated_at: at,
});

const dancer = (id: string, name: string) => ({
  id,
  dancer_name: name,
  country: "FR",
});

const entry = (id: string, battleId: string, extra: object) => ({
  id,
  battle_id: battleId,
  status: "confirmed",
  reached: "na",
  members: [],
  created_at: at,
  updated_at: at,
  ...extra,
});

function mockJam(
  overrides: object = {},
  replies: Parameters<typeof mockApi>[0] = {},
) {
  const jam = { ...JAM, ...overrides };
  return mockApi({
    "GET /api/auth/me": LOGGED_OUT,
    [`GET /api/events/${JAM.slug}`]: { status: 200, body: jam },
    [`GET /api/events/${JAM.id}/battles`]: {
      status: 200,
      body: [battle("b1", "1v1 Bboy", 1, 16), battle("b2", "2v2 Mixed", 2, 1)],
    },
    "GET /api/battles/b1/entries": {
      status: 200,
      body: [
        entry("e2", "b1", {
          reached: "top8",
          members: [dancer("d2", "Ventus")],
        }),
        entry("e1", "b1", {
          reached: "winner",
          final_rank: 1,
          video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          video_offset_seconds: 90,
          members: [dancer("d1", "Lil G")],
        }),
        entry("e3", "b1", {
          status: "withdrawn",
          members: [dancer("d3", "Ghost")],
        }),
      ],
    },
    "GET /api/battles/b2/entries": {
      status: 200,
      body: [
        entry("e4", "b2", {
          status: "pending",
          team_name: "Floor Lords",
          crew: { id: "c1", name: "Floor Lords" },
          members: [dancer("d4", "Atlas"), dancer("d5", "Drift")],
        }),
      ],
    },
    [`GET /api/events/${JAM.id}/staff`]: {
      status: 200,
      body: [
        { role: "judge", dancer: dancer("d9", "Sensei Kai") },
        { role: "dj", dancer: dancer("d8", "DJ Spin") },
      ],
    },
    [`GET /api/events/${JAM.id}/flyer.svg`]: {
      status: 200,
      text: '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Generated flyer: Paris Cypher Sessions, Sat 01 Jun, Paris"><text>SAT</text></svg>',
      type: "image/svg+xml",
    },
    ...replies,
  });
}

/** The jam as its organiser sees it. */
const asOrganiser = (replies: Parameters<typeof mockApi>[0] = {}) =>
  mockJam(
    { can_edit: true },
    { "GET /api/auth/me": { status: 200, body: LIL_G }, ...replies },
  );

describe("JamPage", () => {
  it("shows the jam, its facts and the generated flyer", async () => {
    mockJam();
    renderApp(`/jams/${JAM.slug}`);
    const main = within(await screen.findByRole("main"));

    expect(
      await main.findByRole("heading", {
        level: 1,
        name: "Paris Cypher Sessions",
      }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Paris Cypher Sessions · BreakingJam");
    expect(main.getByText("Published")).toBeInTheDocument();
    expect(
      main.getAllByText(/Saturday,? 1.+Sunday,? 2 June 2030/).length,
    ).toBeGreaterThan(0);
    expect(main.getByText("Le Hangar · Paris, France")).toBeInTheDocument();
    expect(main.getByText(/Open floor\./)).toBeInTheDocument();

    // The inlined SVG names itself (DESIGN.md §4.24); the page adds no second label.
    const flyer = await main.findByRole("img", {
      name: "Generated flyer: Paris Cypher Sessions, Sat 01 Jun, Paris",
    });
    expect(flyer.tagName.toLowerCase()).toBe("svg");

    expect(
      main.getByRole("link", { name: "Open in maps" }).getAttribute("href"),
    ).toContain("mlat=48.8566");

    // DESIGN.md §6 item 9: the organiser, verified, and a way to reach them.
    const organiser = main
      .getByRole("heading", { name: "Organiser" })
      .closest("section")!;
    expect(
      within(organiser).getByRole("link", { name: "Floor Lords e.V." }),
    ).toHaveAttribute(
      "href",
      "/organizers/01920000-0000-7000-8000-0000000000a1",
    );
    expect(
      within(organiser).getByRole("img", { name: "Verified" }),
    ).toBeInTheDocument();
    expect(
      within(organiser).getByRole("link", { name: "Contact" }),
    ).toHaveAttribute("href", "https://ig.me/m/floor.lords");
    // Only its writers get the edit link.
    expect(main.queryByRole("link", { name: "Edit jam" })).toBeNull();
  });

  it("lists battles with results first, links every dancer and hides withdrawn entries", async () => {
    mockJam();
    renderApp(`/jams/${JAM.slug}`);
    const main = within(await screen.findByRole("main"));

    const solo = (
      await main.findByRole("heading", { name: "1v1 Bboy" })
    ).closest("li")!;
    const names = await within(solo).findAllByRole("link");
    expect(names.map((a) => a.textContent)).toEqual(["Lil G", "Ventus"]);
    expect(names[0]).toHaveAttribute("href", "/dancers/d1");
    expect(within(solo).getByText("1st")).toBeInTheDocument();
    expect(within(solo).getByText("Top 8")).toBeInTheDocument();
    expect(within(solo).getByText("14 spots left")).toBeInTheDocument();
    expect(within(solo).queryByText("Ghost")).not.toBeInTheDocument();

    const duo = main.getByRole("heading", { name: "2v2 Mixed" }).closest("li")!;
    expect(
      await within(duo).findByText("Floor Lords", { selector: "p" }),
    ).toBeInTheDocument();
    expect(within(duo).getByText("Full")).toBeInTheDocument();

    expect(main.getByRole("heading", { name: "Judges" })).toBeInTheDocument();
    expect(main.getByRole("link", { name: "Sensei Kai" })).toHaveAttribute(
      "href",
      "/dancers/d9",
    );
  });

  it("links registration out, on desktop and in the mobile bar", async () => {
    mockJam();
    renderApp(`/jams/${JAM.slug}`);

    const links = await screen.findAllByRole("link", {
      name: "Register to battle",
    });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", JAM.registration_url);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("drops registration and spots once the jam is completed", async () => {
    mockJam({ status: "completed" });
    renderApp(`/jams/${JAM.slug}`);

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "1v1 Bboy" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Register to battle" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/spots left|Full/)).not.toBeInTheDocument();
  });

  it("plays an entry's video from its offset in the YouTube player", async () => {
    mockJam();
    renderApp(`/jams/${JAM.slug}`);

    await userEvent.click(
      await screen.findByRole("button", { name: "Watch Lil G" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Video: 1v1 Bboy — Lil G",
    });
    expect(dialog.querySelector("iframe")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=90",
    );

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Close video" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows prizes in the battle's currency", async () => {
    mockJam(
      {},
      {
        [`GET /api/events/${JAM.id}/battles`]: {
          status: 200,
          body: [
            {
              ...battle("b1", "1v1 Bboy", 1, 16),
              prize_currency: "CHF",
              prize_first: 1000,
              prize_second: 500,
            },
          ],
        },
      },
    );
    renderApp(`/jams/${JAM.slug}`);

    expect(
      await screen.findByText("1st CHF 1,000 · 2nd CHF 500"),
    ).toBeInTheDocument();
  });

  it("lets its organiser add a dancer, created only after a search", async () => {
    const created = { id: "d7", dancer_name: "Lil Nova", country: "FR" };
    const fetch = asOrganiser({
      "GET /api/dancers": {
        status: 200,
        body: { items: [], next_cursor: null },
      },
      "POST /api/dancers": { status: 201, body: created },
      "POST /api/battles/b1/entries": { status: 201, body: {} },
    });
    renderApp(`/jams/${JAM.slug}`);

    const solo = (
      await screen.findByRole("heading", { name: "1v1 Bboy" })
    ).closest("li")!;
    // The organiser also sees withdrawn entries, marked.
    expect(
      await within(solo).findByText("Withdrawn", { selector: "p" }),
    ).toBeInTheDocument();
    await userEvent.click(
      within(solo).getByRole("button", { name: "Add a dancer" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Add an entry" });
    const create = within(dialog).getByRole("button", {
      name: "Create a new dancer",
    });
    expect(create).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText("Dancer"), "Lil");
    expect(
      await within(dialog).findByText("Nothing found for “Lil”."),
    ).toBeInTheDocument();
    await userEvent.click(create);
    const name = within(dialog).getByLabelText("Dancer name");
    expect(name).toHaveValue("Lil");
    await userEvent.type(name, " Nova");
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Country"),
      "FR",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create" }),
    );
    expect(
      await within(dialog).findByRole("button", { name: "Remove Lil Nova" }),
    ).toBeInTheDocument();
    expect(await bodyOf(fetch, "POST /api/dancers")).toEqual({
      dancer_name: "Lil Nova",
      country: "FR",
      instagram_handle: null,
    });

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Entry saved.")).toBeInTheDocument();
    expect(await bodyOf(fetch, "POST /api/battles/b1/entries")).toMatchObject({
      dancer_ids: ["d7"],
      status: "confirmed",
      reached: "na",
      team_name: null,
      crew_id: null,
    });
  });

  it("lets its organiser delete an entry", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetch = asOrganiser({
      "DELETE /api/entries/e2": { status: 204 },
    });
    renderApp(`/jams/${JAM.slug}`);

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete Ventus" }),
    );
    expect(await screen.findByText("Entry deleted.")).toBeInTheDocument();
    expect(
      fetch.mock.calls.some(
        ([request]) =>
          request instanceof Request &&
          request.method === "DELETE" &&
          request.url.endsWith("/api/entries/e2"),
      ),
    ).toBe(true);
  });

  it("lets its organiser add a judge from a search and remove the DJ", async () => {
    const atlas = {
      id: "d6",
      dancer_name: "Atlas",
      aliases: [],
      country: "CH",
      instagram_handle: "atlas_bj",
      verified: false,
      crews: [{ id: "c1", name: "Alpine Breakers" }],
    };
    const judge = { role: "judge", dancer: dancer("d9", "Sensei Kai") };
    const fetch = asOrganiser({
      "GET /api/dancers": {
        status: 200,
        body: { items: [atlas], next_cursor: null },
      },
      [`PUT /api/events/${JAM.id}/staff`]: (n) => ({
        status: 200,
        body:
          n === 0
            ? [
                judge,
                { role: "judge", dancer: atlas },
                { role: "dj", dancer: dancer("d8", "DJ Spin") },
              ]
            : [judge, { role: "judge", dancer: atlas }],
      }),
    });
    renderApp(`/jams/${JAM.slug}`);

    await userEvent.click(
      await screen.findByRole("button", { name: "Add a judge" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Add a judge" });
    await userEvent.type(within(dialog).getByLabelText("Dancer"), "atl");
    // Search results tell namesakes apart: @handle, country, crew.
    await userEvent.click(
      await within(dialog).findByRole("button", {
        name: /Atlas.*@atlas_bj.*CH.*Alpine Breakers/,
      }),
    );
    expect(await bodyOf(fetch, `PUT /api/events/${JAM.id}/staff`)).toEqual([
      { dancer_id: "d9", role: "judge" },
      { dancer_id: "d8", role: "dj" },
      { dancer_id: "d6", role: "judge" },
    ]);
    const lineup = screen
      .getByRole("heading", { name: "Lineup" })
      .closest("section")!;
    expect(
      await within(lineup).findByRole("link", { name: "Atlas" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove DJ Spin (DJ)" }),
    );
    expect(await bodyOf(fetch, `PUT /api/events/${JAM.id}/staff`)).toEqual([
      { dancer_id: "d9", role: "judge" },
      { dancer_id: "d6", role: "judge" },
    ]);
  });

  it("is a not-found page for unknown jams and hidden drafts", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/jams/nowhere");

    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });
});
