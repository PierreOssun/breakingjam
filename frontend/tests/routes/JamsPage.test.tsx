import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LOGGED_OUT, mockApi, renderApp } from "../support/app";
import { freezeToday, geojson, jamFeature } from "../support/jams";

const JAMS = geojson(
  jamFeature(1, "Zurich Toprock Jam", { day: "2030-05-01" }),
  jamFeature(2, "Seoul Power Moves", { country: "KR" }),
  jamFeature(3, "Paris Old School", { country: "FR", day: "2020-05-01" }),
);

const list = async () =>
  within(await screen.findByRole("list", { name: "Find a jam" }));

describe("JamsPage", () => {
  beforeEach(() => freezeToday());

  it("lists the upcoming jams soonest first, and the past ones on request", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": JAMS,
    });
    renderApp("/jams");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Find a jam" }),
    ).toBeInTheDocument();
    await waitFor(async () =>
      expect((await list()).getAllByRole("link")).toHaveLength(2),
    );
    // Soonest first: Zurich in May, then Seoul in June.
    expect(
      (await list())
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/jams/zurich-toprock-jam-1", "/jams/seoul-power-moves-2"]);
    expect(screen.getByRole("status")).toHaveTextContent("2 jams");

    await userEvent.click(screen.getByRole("button", { name: "Past jams" }));
    expect((await list()).getByRole("link")).toHaveAttribute(
      "href",
      "/jams/paris-old-school-3",
    );
  });

  it("marks only the jams with videos, and links them to their battles", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": geojson(
        jamFeature(1, "DPC Jam", { day: "2020-10-25", hasVideos: true }),
        jamFeature(2, "Quiet Jam", { day: "2020-10-18" }),
      ),
    });
    renderApp("/jams");
    await userEvent.click(
      await screen.findByRole("button", { name: "Past jams" }),
    );

    const filmed = (await list()).getByRole("link", { name: /DPC Jam/ });
    expect(filmed).toHaveAttribute("href", "/jams/dpc-jam-1#battles");
    expect(within(filmed).getByText("Videos available")).toBeInTheDocument();
    const quiet = (await list()).getByRole("link", { name: /Quiet Jam/ });
    expect(quiet).toHaveAttribute("href", "/jams/quiet-jam-2");
    expect(within(quiet).queryByText("Videos available")).toBeNull();
  });

  it("searches through every jam and keeps the words in the URL", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": JAMS,
    });
    const router = renderApp("/jams");

    await userEvent.type(
      await screen.findByRole("searchbox", { name: "Search jams" }),
      "paris",
    );

    await waitFor(async () =>
      expect((await list()).getByRole("link")).toHaveTextContent(
        "Paris Old School",
      ),
    );
    // The URL catches up once typing pauses.
    await waitFor(() => expect(router.state.location.search).toBe("?q=paris"));
  });

  it("shows thirty at a time", async () => {
    const many = Array.from({ length: 31 }, (_, i) =>
      jamFeature(i + 10, `Jam ${i + 10}`),
    );
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": geojson(...many),
    });
    renderApp("/jams");

    await waitFor(async () =>
      expect((await list()).getAllByRole("link")).toHaveLength(30),
    );
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect((await list()).getAllByRole("link")).toHaveLength(31);
  });
});
