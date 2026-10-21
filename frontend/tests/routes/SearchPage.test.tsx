import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LOGGED_OUT, mockApi, renderApp } from "../support/app";
import { freezeToday, geojson, jamFeature } from "../support/jams";

const LILOU = {
  id: "01920000-0000-7000-8000-0000000000d1",
  dancer_name: "Lilou",
  aliases: [],
  country: "FR",
  country2: null,
  city: "Lyon",
  instagram_handle: null,
  verified: true,
  avatar_url: null,
  avatar_parts: null,
  crews: [],
};

const section = async (name: string) =>
  within(
    (await screen.findByRole("heading", { level: 2, name })).closest(
      "section",
    )!,
  );

describe("SearchPage", () => {
  beforeEach(() => freezeToday());

  it("shows the jams and the people the words match", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": geojson(
        jamFeature(1, "Lyon Footwork Fest", { country: "FR" }),
        jamFeature(2, "Seoul Power Moves", { country: "KR" }),
      ),
      "GET /api/dancers": {
        status: 200,
        body: { items: [LILOU], next_cursor: null },
      },
    });
    renderApp("/search?q=lyon");

    const jams = await section("Jams");
    await waitFor(() => expect(jams.getAllByRole("link")).toHaveLength(1));
    expect(jams.getByRole("link")).toHaveAttribute(
      "href",
      "/jams/lyon-footwork-fest-1",
    );
    const people = await section("People");
    expect(await people.findByRole("link", { name: /Lilou/ })).toHaveAttribute(
      "href",
      `/dancers/${LILOU.id}`,
    );
    expect(
      screen.getByRole("searchbox", { name: "Search jams and people" }),
    ).toHaveValue("lyon");
  });

  it("says when nothing matches, and searches again from its field", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": geojson(
        jamFeature(1, "Lyon Jam", { country: "FR" }),
      ),
      "GET /api/dancers": {
        status: 200,
        body: { items: [], next_cursor: null },
      },
    });
    const router = renderApp("/search?q=nowhere");

    expect(
      await (await section("Jams")).findByText("No jam matches “nowhere”."),
    ).toBeInTheDocument();
    expect(
      await (await section("People")).findByText("No one matches “nowhere”."),
    ).toBeInTheDocument();

    const field = screen.getByRole("searchbox", {
      name: "Search jams and people",
    });
    await userEvent.clear(field);
    await userEvent.type(field, "lyon{Enter}");
    await waitFor(() => expect(router.state.location.search).toBe("?q=lyon"));
    // The same field stays, focus and all.
    expect(field).toHaveFocus();
    expect(field).toHaveValue("lyon");
  });

  it("sends the rest of a long jam list to the map", async () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      jamFeature(i + 10, `Zurich Jam ${i + 10}`),
    );
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/events.geojson": geojson(...many),
      "GET /api/dancers": {
        status: 200,
        body: { items: [], next_cursor: null },
      },
    });
    renderApp("/search?q=zurich");

    const jams = await section("Jams");
    expect(
      await jams.findByRole("link", { name: "See all on the map" }),
    ).toHaveAttribute("href", "/map?q=zurich");
    expect(
      within(jams.getByRole("list", { name: "Jams" })).getAllByRole("link"),
    ).toHaveLength(10);
  });
});
