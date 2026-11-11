import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  LIL_G,
  LOGGED_OUT,
  bodyOf,
  calls,
  mockApi,
  renderApp,
} from "../support/app";

// jsdom has no WebGL: the venue's mini map is a stand-in.
vi.mock("../../src/features/map/StaticMap", () => ({
  default: () => <div>Venue map</div>,
}));

const at = "2026-10-01T10:00:00Z";
const JAM = {
  id: "01920000-0000-7000-8000-00000000e001",
  organizer_id: "01920000-0000-7000-8000-0000000000a1",
  name: "Paris Cypher Sessions",
  slug: "paris-cypher-sessions-00e001",
  description: "Open floor.\nBring your crew.",
  status: "published",
  phase: "upcoming",
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
  website_url: "https://www.pariscypher.com/",
  contact_email: "hello@pariscypher.com",
  created_at: at,
  updated_at: at,
  can_edit: false,
  can_edit_battles: false,
  actions: [],
  organizer: {
    id: "01920000-0000-7000-8000-0000000000a1",
    display_name: "Floor Lords e.V.",
    jams: 3,
    instagram_handle: "floor.lords",
    verified: true,
  },
};

const battle = (
  id: string,
  name: string,
  teamSize: number,
  maxEntries: number | null,
  entries: object[] = [],
  matches: object[] = [],
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
  entries,
  matches,
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
      body: [
        battle("b1", "1v1 Bboy", 1, 16, [
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
        ]),
        battle("b2", "2v2 Mixed", 2, 1, [
          entry("e4", "b2", {
            status: "pending",
            team_name: "Floor Lords",
            crew: { id: "c1", name: "Floor Lords" },
            members: [dancer("d4", "Atlas"), dancer("d5", "Drift")],
          }),
        ]),
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

/** What only GET adds to a jam: what the caller may do, and its organiser. */
const PAGE_ONLY = ["can_edit", "can_edit_battles", "actions", "organizer"];

/** A jam as write routes return it: without what only GET adds. */
const asWritten = (jam: object) =>
  Object.fromEntries(
    Object.entries(jam).filter(([key]) => !PAGE_ONLY.includes(key)),
  );

/** What the organiser of the published, upcoming jam may do with it. */
const ORGANISER = {
  can_edit: true,
  can_edit_battles: true,
  actions: ["close-registration", "cancel"],
};

/** The jam as its organiser sees it. */
/** A battle's card with its entry rows open, behind "Edit entries" once it has results. */
async function entriesOf(name: string) {
  const card = (await screen.findByRole("heading", { name })).closest("li")!;
  await userEvent.click(
    within(card).getByRole("button", { name: "Edit entries" }),
  );
  return card;
}

const asOrganiser = (replies: Parameters<typeof mockApi>[0] = {}) =>
  mockJam(ORGANISER, {
    "GET /api/auth/me": { status: 200, body: LIL_G },
    ...replies,
  });

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
    // "Published" tells a visitor nothing: only its organiser sees it.
    expect(main.queryByText("Published")).toBeNull();
    expect(
      main.getAllByText(/Saturday,? 1.+Sunday,? 2 June 2030/).length,
    ).toBeGreaterThan(0);
    expect(main.getByText("Le Hangar · Paris, France")).toBeInTheDocument();
    // In the desktop facts grid and under Info on phones; CSS shows one of them.
    for (const link of main.getAllByRole("link", { name: "pariscypher.com" }))
      expect(link).toHaveAttribute("href", "https://www.pariscypher.com/");
    for (const link of main.getAllByRole("link", {
      name: "hello@pariscypher.com",
    }))
      expect(link).toHaveAttribute("href", "mailto:hello@pariscypher.com");
    expect(main.getByText(/Open floor\./)).toBeInTheDocument();

    // The inlined SVG names itself (DESIGN.md §4.24); the page adds no second label.
    const flyer = await main.findByRole("img", {
      name: "Generated flyer: Paris Cypher Sessions, Sat 01 Jun, Paris",
    });
    expect(flyer.tagName.toLowerCase()).toBe("svg");

    // Not an Apple device in jsdom: Google Maps.
    expect(
      main.getByRole("link", { name: "Directions" }).getAttribute("href"),
    ).toContain("destination=48.8566,2.3522");

    // Who's in: four dancers (the withdrawn one left out), then a lone judge and DJ by name.
    const whosIn = await main.findByRole("link", { name: /4 dancers in/ });
    expect(whosIn).toHaveAttribute("href", "#battles");
    expect(whosIn).toHaveTextContent("Judge Sensei Kai · DJ Spin");

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
      within(organiser).getByText("3 jams on BreakingJam · @floor.lords"),
    ).toBeInTheDocument();
    // The jam's public email, as it has one; an Instagram DM otherwise.
    expect(
      within(organiser).getByRole("link", { name: "Contact" }),
    ).toHaveAttribute("href", "mailto:hello@pariscypher.com");
    // Only its writers get the edit link and the flyer buttons.
    expect(main.queryByRole("link", { name: "Edit jam" })).toBeNull();
    expect(main.queryByRole("button", { name: "Upload a flyer" })).toBeNull();
  });

  it("holds the page's shape while the jam loads", async () => {
    // Every request stays pending.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    renderApp(`/jams/${JAM.slug}`);
    const main = within(await screen.findByRole("main"));

    // Screen readers hear one "Loading…"; the grey shapes are hidden from them.
    expect(await main.findByText("Loading…")).toBeInTheDocument();
    expect(main.getByText("Loading…").closest("[aria-busy]")).toBeTruthy();
    expect(main.queryByRole("heading")).toBeNull();
  });

  it("shows the organiser's flyer instead of the generated one", async () => {
    const fetch = mockJam({
      flyer_url: "https://media.breakingjam.com/flyers/e001/f.jpg",
      flyer_card_url: "https://media.breakingjam.com/flyers/e001/f-card.jpg",
    });
    renderApp(`/jams/${JAM.slug}`);
    const main = within(await screen.findByRole("main"));

    const flyer = await main.findByRole("img", {
      name: "Flyer of Paris Cypher Sessions",
    });
    // The jam page takes the full size; cards and lists the card one.
    expect(flyer).toHaveAttribute(
      "src",
      "https://media.breakingjam.com/flyers/e001/f.jpg",
    );
    expect(calls(fetch)).not.toContain(`GET /api/events/${JAM.id}/flyer.svg`);
  });

  it("gives its organiser the flyer buttons under the flyer", async () => {
    // Admins and the BreakingJam team get them too: `can_edit` covers every writer.
    mockJam(
      {
        ...ORGANISER,
        flyer_url: "https://media.breakingjam.com/flyers/e001/f.jpg",
        flyer_card_url: "https://media.breakingjam.com/flyers/e001/f-card.jpg",
      },
      {
        "GET /api/auth/me": { status: 200, body: LIL_G },
        [`DELETE /api/events/${JAM.id}/flyer`]: {
          status: 200,
          body: asWritten({ ...JAM, flyer_url: null, flyer_card_url: null }),
        },
      },
    );
    renderApp(`/jams/${JAM.slug}`);
    const main = within(await screen.findByRole("main"));

    expect(
      await main.findByRole("button", { name: "Replace flyer" }),
    ).toBeInTheDocument();
    await userEvent.click(main.getByRole("button", { name: "Remove flyer" }));

    // Back to the generated flyer, and to a button that adds one.
    expect(
      await main.findByRole("img", {
        name: "Generated flyer: Paris Cypher Sessions, Sat 01 Jun, Paris",
      }),
    ).toBeInTheDocument();
    expect(
      main.getByRole("button", { name: "Upload a flyer" }),
    ).toBeInTheDocument();
    expect(main.queryByRole("button", { name: "Remove flyer" })).toBeNull();
  });

  it("falls back to each round's placings when pairings are unknown, links every dancer and hides withdrawn entries", async () => {
    mockJam();
    renderApp(`/jams/${JAM.slug}`);
    const main = within(await screen.findByRole("main"));

    const solo = (
      await main.findByRole("heading", { name: "1v1 Bboy" })
    ).closest("li")!;
    // No pairing is known: each round lists its placings as rows under a note, the final first.
    const final = (
      await within(solo).findByRole("heading", { name: "Final" })
    ).closest("section")!;
    expect(within(final).getByText("1 battle")).toBeInTheDocument();
    // The name and the avatar both lead to the dancer; no name chips.
    const links = within(final).getAllByRole("link", { name: "Lil G" });
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/dancers/d1",
      "/dancers/d1",
    ]);
    // Its name shows on hover, over the avatar.
    expect(links[1]).toHaveTextContent("Lil G");
    expect(within(final).queryByText("1st")).not.toBeInTheDocument();
    // The old per-entry video stays on the row.
    expect(
      within(final).getByRole("button", { name: "Watch Lil G" }),
    ).toBeInTheDocument();
    const top8 = within(solo)
      .getByRole("heading", { name: "Top 8" })
      .closest("section")!;
    expect(within(top8).getAllByRole("link", { name: "Ventus" })).toHaveLength(
      2,
    );
    expect(within(top8).getByText("1 battle")).toBeInTheDocument();
    expect(within(top8).queryByRole("button")).toBeNull();
    expect(within(solo).getByText("2 / 16 dancers")).toBeInTheDocument();
    expect(within(solo).queryByText("Ghost")).not.toBeInTheDocument();

    const duo = main.getByRole("heading", { name: "2v2 Mixed" }).closest("li")!;
    expect(await within(duo).findByText("Floor Lords")).toBeInTheDocument();
    expect(within(duo).getByText("1 / 1 teams")).toBeInTheDocument();

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

  it("offers the calendar once registration closes", async () => {
    mockJam({ status: "registration_closed" });
    renderApp(`/jams/${JAM.slug}`);
    const calendar = await screen.findAllByRole("link", {
      name: "Add to calendar",
    });
    // The action bar on phones and the action card on desktop.
    expect(calendar).toHaveLength(2);
    expect(calendar[0]?.getAttribute("href")).toMatch(
      new RegExp(`/api/events/${JAM.slug}/calendar\\.ics$`),
    );
    expect(
      screen.queryByRole("link", { name: "Register to battle" }),
    ).toBeNull();
  });

  it("points to the results once the jam took place", async () => {
    // Over by its own calendar, whatever status it was left in.
    mockJam({ status: "published", phase: "past" });
    renderApp(`/jams/${JAM.slug}`);
    const results = await screen.findAllByRole("link", { name: "See results" });
    for (const link of results)
      expect(link).toHaveAttribute("href", "#battles");
    expect(document.getElementById("battles")).toBeInTheDocument();
  });

  it("asks a team-added jam's organiser to write in, and leaves out the website, the email and the pitch when there are none", async () => {
    // A jam the BreakingJam team entered, e.g. an imported past edition.
    mockJam({
      organizer: null,
      website_url: null,
      contact_email: null,
      description: null,
    });
    renderApp(`/jams/${JAM.slug}`);
    const main = within(await screen.findByRole("main"));

    expect(
      await main.findByRole("heading", {
        level: 1,
        name: "Paris Cypher Sessions",
      }),
    ).toBeInTheDocument();
    // No organiser card: the team runs no jam, so it asks whoever does to write in.
    const organiser = main
      .getByRole("heading", { name: "Organiser" })
      .closest("section")!;
    expect(organiser).toHaveTextContent("You’re the organiser?");
    expect(
      within(organiser).getByRole("link", { name: "Contact us" }),
    ).toHaveAttribute(
      "href",
      `mailto:breakingjamtv@gmail.com?subject=${encodeURIComponent("Organiser of Paris Cypher Sessions: ")}`,
    );
    expect(main.queryByRole("heading", { name: "About" })).toBeNull();
    expect(main.queryByRole("link", { name: "pariscypher.com" })).toBeNull();
    expect(
      main.queryByRole("link", { name: "hello@pariscypher.com" }),
    ).toBeNull();
  });

  it("drops registration and spots once the jam is past", async () => {
    mockJam({ status: "registration_closed", phase: "past" });
    renderApp(`/jams/${JAM.slug}`);

    expect(await screen.findByText("Past")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "1v1 Bboy" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Register to battle" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/spots left|Full/)).not.toBeInTheDocument();
  });

  it("shows the jam's own hours once announced, else the first battle's start", async () => {
    mockJam({ opens_at: "14:00:00", closes_at: "21:30:00" });
    renderApp(`/jams/${JAM.slug}`);
    expect(
      (await screen.findAllByText(/Sun,? 2 Jun(e 2030)? · 14:00–21:30$/))
        .length,
    ).toBeGreaterThan(0);
  });

  it("says from when it opens, when only that is known", async () => {
    mockJam({ opens_at: "14:00:00" });
    renderApp(`/jams/${JAM.slug}`);
    expect(
      (await screen.findAllByText(/Sun,? 2 Jun(e 2030)? · from 14:00$/)).length,
    ).toBeGreaterThan(0);
  });

  it("shows an organiser their draft before it has a venue", async () => {
    mockJam(
      {
        status: "draft",
        venue_name: null,
        address: null,
        city: null,
        country: null,
        lat: null,
        lng: null,
        can_edit: true,
        can_edit_battles: true,
        actions: ["submit", "cancel"],
      },
      { "GET /api/auth/me": { status: 200, body: LIL_G } },
    );
    renderApp(`/jams/${JAM.slug}`);

    expect(
      await screen.findByRole("heading", { name: "Paris Cypher Sessions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.queryByText(/Paris, France/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Venue" })).toBeNull();
    expect(screen.getByRole("link", { name: "Edit jam" })).toHaveAttribute(
      "href",
      `/org/jams/${JAM.id}/edit`,
    );
  });

  it("shows the video pill only beside the entries that have a video", async () => {
    mockJam();
    renderApp(`/jams/${JAM.slug}`);

    const pill = await screen.findByRole("button", { name: "Watch Lil G" });
    expect(pill).toHaveTextContent("Video");
    expect(screen.getAllByRole("button", { name: /^Watch / })).toEqual([pill]);
  });

  it("scrolls to the battles once they load when a preview links there", async () => {
    // jsdom does no layout, so it has no scrollIntoView.
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    onTestFinished(() => {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    });
    mockJam();
    renderApp(`/jams/${JAM.slug}#battles`);

    await screen.findByRole("button", { name: "Watch Lil G" });
    const targets = scroll.mock.contexts as Element[];
    expect(targets.map((section) => section.id)).toContain("battles");
  });

  it("shows the final card, then each round's battles with the winner first and crowned", async () => {
    const team = (id: string, name: string, extra: object) =>
      entry(id, "b9", {
        team_name: name,
        members: [dancer(`d-${id}`, `${name} 1`)],
        ...extra,
      });
    const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    mockJam(
      {},
      {
        [`GET /api/events/${JAM.id}/battles`]: {
          status: 200,
          body: [
            battle(
              "b9",
              "2v2",
              2,
              null,
              [
                team("s2", "Saison 2", { reached: "winner", final_rank: 1 }),
                team("fm", "Fresh Mob Crew", {
                  reached: "top2",
                  final_rank: 2,
                }),
                team("gl", "Gatling & Loggy", { reached: "top4" }),
                team("pv", "Pura Vida Mae", { reached: "top4" }),
              ],
              [
                {
                  id: "m1",
                  round: "top4",
                  winner_id: "s2",
                  loser_id: "gl",
                  video_url: VIDEO,
                },
                {
                  id: "m2",
                  round: "top4",
                  winner_id: "fm",
                  loser_id: "pv",
                  video_url: null,
                },
                {
                  id: "m3",
                  round: "final",
                  winner_id: "s2",
                  loser_id: "fm",
                  video_url: VIDEO,
                },
              ],
            ),
          ],
        },
      },
    );
    renderApp(`/jams/${JAM.slug}`);

    const final = await screen.findByRole("region", { name: "Final" });
    expect(within(final).getByText("Saison 2")).toBeInTheDocument();
    expect(within(final).getByText("1st")).toBeInTheDocument();
    expect(within(final).getByText("Fresh Mob Crew")).toBeInTheDocument();
    expect(within(final).getByText("2nd")).toBeInTheDocument();
    expect(
      within(final).getByRole("button", {
        name: "Watch Saison 2 vs Fresh Mob Crew",
      }),
    ).toBeInTheDocument();

    const semis = screen
      .getByRole("heading", { name: "Semi-finals" })
      .closest("section")!;
    expect(within(semis).getByText("2 battles")).toBeInTheDocument();
    const [first, second] = within(semis).getAllByRole("listitem");
    // The winner is the first line, crowned; the loser has no crown. Each line starts with its name.
    const lines = (card: HTMLElement) =>
      Array.from(card.querySelectorAll("p")).map(
        (line) => line.firstElementChild?.textContent,
      );
    expect(lines(first!)).toEqual(["Saison 2", "Gatling & Loggy"]);
    expect(within(first!).getAllByRole("img", { name: "Winner" })).toHaveLength(
      1,
    );
    expect(
      first!.querySelector("p")?.querySelector('[aria-label="Winner"]'),
    ).not.toBeNull();
    expect(lines(second!)).toEqual(["Fresh Mob Crew", "Pura Vida Mae"]);
    // Members as avatars only, each a link named after its dancer.
    const avatar = within(first!).getByRole("link", { name: "Saison 2 1" });
    expect(avatar).toHaveAttribute("href", "/dancers/d-s2");
    expect(avatar).toHaveTextContent("Saison 2 1");
    // The name is the avatar's hover label, not a chip of its own.
    expect(within(first!).getAllByText("Saison 2 1")).toEqual([
      within(avatar).getByText("Saison 2 1"),
    ]);
    expect(
      within(final).getByRole("link", { name: "Fresh Mob Crew 1" }),
    ).toBeInTheDocument();
    // The video pill only where the battle has a video.
    expect(
      within(first!).getByRole("button", {
        name: "Watch Saison 2 vs Gatling & Loggy",
      }),
    ).toBeInTheDocument();
    expect(within(second!).queryByRole("button")).toBeNull();

    await userEvent.click(
      within(first!).getByRole("button", {
        name: "Watch Saison 2 vs Gatling & Loggy",
      }),
    );
    expect(
      screen.getByRole("dialog", {
        name: "Video: 2v2 — Semi-finals: Saison 2 vs Gatling & Loggy",
      }),
    ).toBeInTheDocument();
  });

  it("folds the rounds below the quarter-finals behind a button on phones", async () => {
    const solos = Array.from({ length: 16 }, (_, i) =>
      entry(`e${i}`, "b9", {
        reached: i === 0 ? "winner" : i === 1 ? "top2" : "top16",
        members: [dancer(`d${i}`, `Dancer ${i}`)],
      }),
    );
    const top16 = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      round: "top16",
      winner_id: `e${i}`,
      loser_id: `e${i + 8}`,
      video_url: null,
    }));
    mockJam(
      {},
      {
        [`GET /api/events/${JAM.id}/battles`]: {
          status: 200,
          body: [battle("b9", "1v1 Bboy", 1, null, solos, top16)],
        },
      },
    );
    renderApp(`/jams/${JAM.slug}`);

    const show = await screen.findByRole("button", {
      name: "Show the 8 battles",
    });
    const round = show.closest("section")!;
    // Hidden below lg, shown from lg: the CSS decides, the list stays in the page.
    expect(round.querySelector("ul")).toHaveClass("hidden", "lg:grid");
    await userEvent.click(show);
    expect(round.querySelector("ul")).not.toHaveClass("hidden");
    expect(
      screen.queryByRole("button", { name: "Show the 8 battles" }),
    ).toBeNull();
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

  it("shows when each battle starts, with the day as the jam runs two days", async () => {
    mockJam(
      {},
      {
        [`GET /api/events/${JAM.id}/battles`]: {
          status: 200,
          body: [
            {
              ...battle("b1", "1v1 Bboy", 1, 16),
              starts_at: "2030-06-02T14:30:00",
            },
          ],
        },
      },
    );
    renderApp(`/jams/${JAM.slug}`);

    expect(
      await screen.findByText(/^Starts Sun,? 2 Jun,? 14:30$/),
    ).toBeInTheDocument();
  });

  it("tags a showcase, counting crews or dancers by its size", async () => {
    mockJam(
      {},
      {
        [`GET /api/events/${JAM.id}/battles`]: {
          status: 200,
          body: [
            { ...battle("s1", "Crew Showcase", 5, 8), format: "showcase" },
            { ...battle("s2", "Solo Showcase", 1, 12), format: "showcase" },
          ],
        },
      },
    );
    renderApp(`/jams/${JAM.slug}`);
    const main = within(await screen.findByRole("main"));

    const crews = (
      await main.findByRole("heading", { name: "Crew Showcase" })
    ).closest("li")!;
    expect(within(crews).getByText("Showcase")).toBeInTheDocument();
    expect(await within(crews).findByText("0 / 8 teams")).toBeInTheDocument();
    const solo = main
      .getByRole("heading", { name: "Solo Showcase" })
      .closest("li")!;
    expect(await within(solo).findByText("0 / 12 dancers")).toBeInTheDocument();
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

    const solo = await entriesOf("1v1 Bboy");
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
    const name = within(dialog).getByLabelText("Stage name");
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

  it("searches dancers in the picker after a search on Dancers", async () => {
    asOrganiser({
      "GET /api/dancers": {
        status: 200,
        body: { items: [], next_cursor: null },
      },
    });
    // Dancers pages its results; the picker must not read those pages as its list.
    const router = renderApp("/dancers?q=Lil");
    expect(
      await screen.findByText("No one matches “Lil”."),
    ).toBeInTheDocument();
    await router.navigate(`/jams/${JAM.slug}`);

    const solo = await entriesOf("1v1 Bboy");
    await userEvent.click(
      within(solo).getByRole("button", { name: "Add a dancer" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Add an entry" });
    await userEvent.type(within(dialog).getByLabelText("Dancer"), "Lil");

    expect(
      await within(dialog).findByText("Nothing found for “Lil”."),
    ).toBeInTheDocument();
  });

  it("shows its organiser the results as visitors see them, the entry rows one switch away", async () => {
    asOrganiser();
    renderApp(`/jams/${JAM.slug}`);

    const solo = (
      await screen.findByRole("heading", { name: "1v1 Bboy" })
    ).closest("li")!;
    const manage = within(solo).getByRole("button", { name: "Edit entries" });
    expect(within(solo).getByText("Top 8")).toBeInTheDocument();
    expect(
      within(solo).queryByRole("button", { name: "Delete Ventus" }),
    ).toBeNull();

    await userEvent.click(manage);
    expect(
      within(solo).getByRole("button", { name: "Delete Ventus" }),
    ).toBeInTheDocument();
    await userEvent.click(within(solo).getByRole("button", { name: "Done" }));
    expect(
      within(solo).queryByRole("button", { name: "Delete Ventus" }),
    ).toBeNull();
  });

  it("keeps results for later on a draft previewed on its day", async () => {
    mockJam(
      { ...ORGANISER, status: "draft", phase: "live" },
      { "GET /api/auth/me": { status: 200, body: LIL_G } },
    );
    renderApp(`/jams/${JAM.slug}`);
    await screen.findByRole("heading", { name: "1v1 Bboy" });
    expect(screen.queryByRole("button", { name: /results$/ })).toBeNull();
  });

  it("names a team after the crew picked for it, and says when the name is taken", async () => {
    asOrganiser({
      [`GET /api/events/${JAM.id}/battles`]: {
        status: 200,
        body: [
          battle("b2", "2v2 Mixed", 2, 8, [
            entry("e4", "b2", {
              team_name: "Floor Lords",
              crew: { id: "c1", name: "Floor Lords" },
              members: [dancer("d4", "Atlas"), dancer("d5", "Drift")],
            }),
          ]),
        ],
      },
      "GET /api/crews": {
        status: 200,
        body: {
          items: [
            { id: "c1", name: "Floor Lords", city: "Paris", country: "FR" },
          ],
          next_cursor: null,
        },
      },
    });
    renderApp(`/jams/${JAM.slug}`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Add a team" }),
    );
    const sheet = within(screen.getByRole("dialog", { name: "Add an entry" }));
    await userEvent.type(sheet.getByLabelText("Crew"), "Floor");
    await userEvent.click(
      await sheet.findByRole("button", { name: /Floor Lords/ }),
    );
    expect(sheet.getByLabelText(/^Team name/)).toHaveValue("Floor Lords");
    // A second team of the same crew needs a name of its own.
    expect(
      sheet.getByText(/Another entry in this battle already goes by this name/),
    ).toBeInTheDocument();
  });

  it("lets its organiser delete an entry", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetch = asOrganiser({
      "DELETE /api/entries/e2": { status: 204 },
    });
    renderApp(`/jams/${JAM.slug}`);

    await entriesOf("1v1 Bboy");
    const remove = screen.getByRole("button", { name: "Delete Ventus" });
    // Before the jam is over, battles themselves are edited in the editor.
    expect(screen.queryByRole("button", { name: "Edit 1v1 Bboy" })).toBeNull();
    await userEvent.click(remove);
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

  it("keeps the battles open to its organiser once the jam is past, and nothing else", async () => {
    mockJam(
      { phase: "past", can_edit: false, can_edit_battles: true, actions: [] },
      { "GET /api/auth/me": { status: 200, body: LIL_G } },
    );
    renderApp(`/jams/${JAM.slug}`);

    const solo = await entriesOf("1v1 Bboy");
    expect(
      within(solo).getByRole("button", { name: "Add a dancer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Ventus" }),
    ).toBeInTheDocument();
    // The battle itself still opens its sheet here, since the editor is closed.
    await userEvent.click(
      within(solo).getByRole("button", { name: "Edit results" }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // The details, the flyer and the lineup are settled.
    expect(screen.queryByRole("link", { name: "Edit jam" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Upload a flyer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a judge" })).toBeNull();
  });

  it("lets its organiser enter the battles round by round once the jam is past, saved as they go", async () => {
    const VIDEO = "https://youtu.be/dQw4w9WgXcQ";
    const fetch = mockJam(
      { phase: "past", can_edit: false, can_edit_battles: true, actions: [] },
      {
        "GET /api/auth/me": { status: 200, body: LIL_G },
        [`GET /api/events/${JAM.id}/battles`]: {
          status: 200,
          body: [
            {
              ...battle("b1", "1v1 Bboy", 1, 16, [
                entry("e1", "b1", { members: [dancer("d1", "Lil G")] }),
                // Their video, entered before matches existed, was of the battle they lost.
                entry("e2", "b1", {
                  members: [dancer("d2", "Ventus")],
                  video_url: VIDEO,
                  video_offset_seconds: 90,
                }),
              ]),
              bracket_size: 2,
            },
          ],
        },
        "PUT /api/battles/b1/matches": { status: 200, body: [] },
      },
    );
    renderApp(`/jams/${JAM.slug}`);

    await userEvent.click(
      await screen.findByRole("button", { name: "Enter results" }),
    );
    const sheet = within(await screen.findByRole("dialog"));
    // Over, the jam opens the sheet on its results.
    expect(sheet.getByRole("button", { name: "Results" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.selectOptions(
      sheet.getByLabelText("Battle 1, side 1"),
      "e1",
    );
    await userEvent.selectOptions(
      sheet.getByLabelText("Battle 1, side 2"),
      "e2",
    );
    await userEvent.click(
      sheet.getByRole("button", { name: "Mark Lil G as the winner" }),
    );
    expect(sheet.getByLabelText(/Video link/)).toHaveValue(VIDEO);
    // No Save button: the battle goes out by itself once it has both sides and a winner.
    expect(sheet.queryByRole("button", { name: "Save" })).toBeNull();
    await waitFor(
      () => expect(calls(fetch)).toContain("PUT /api/battles/b1/matches"),
      { timeout: 3000 },
    );
    expect(await bodyOf(fetch, "PUT /api/battles/b1/matches")).toEqual([
      {
        round: "final",
        position: 0,
        winner_id: "e1",
        loser_id: "e2",
        video_url: VIDEO,
        video_offset_seconds: 90,
      },
    ]);
    expect(await sheet.findByText("Saved")).toBeInTheDocument();

    // Not a YouTube link: the field says so, and it never goes out.
    await userEvent.clear(sheet.getByLabelText(/Video link/));
    await userEvent.type(
      sheet.getByLabelText(/Video link/),
      "https://vimeo.com/1",
    );
    expect(
      sheet.getByText("Paste a YouTube link: this one isn’t saved."),
    ).toBeInTheDocument();
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
