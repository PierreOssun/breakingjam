import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LOGGED_OUT, mockApi, renderApp } from "../support/app";

const person = (n: number, name: string, extra: object = {}) => ({
  id: `0192000${n}-0000-7000-8000-000000000000`,
  dancer_name: name,
  aliases: [],
  country: "NL",
  country2: null,
  city: null,
  instagram_handle: null,
  verified: false,
  avatar_url: null,
  avatar_parts: null,
  crews: [],
  ...extra,
});
const MENNO = person(1, "Menno", {
  city: "Breda",
  verified: true,
  crews: [{ id: "crew-1", name: "Hustle Kidz" }],
});
const AMI = person(2, "Ami", { country: "JP" });
const page = (items: object[], next_cursor: string | null = null) => ({
  status: 200,
  body: { items, next_cursor },
});

/** The `q` and `cursor` of each `GET /api/dancers` call. */
function searches(fetch: ReturnType<typeof mockApi>) {
  return fetch.mock.calls
    .map(([input]) => new URL((input as Request).url))
    .filter((url) => url.pathname === "/api/dancers")
    .map((url) => [url.searchParams.get("q"), url.searchParams.get("cursor")]);
}

describe("PeoplePage", () => {
  it("lists people, notable first, each opening their page", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/dancers": page([MENNO, AMI]),
    });
    renderApp("/dancers");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Find someone" }),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Find someone" });
    const rows = await within(list).findAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual([
      `/dancers/${MENNO.id}`,
      `/dancers/${AMI.id}`,
    ]);
    expect(rows[0]).toHaveTextContent("Menno");
    expect(rows[0]).toHaveTextContent("Breda · Hustle Kidz");
    expect(
      within(rows[0]!).getByRole("img", { name: "Verified" }),
    ).toBeInTheDocument();
    expect(
      within(rows[1]!).getByRole("img", { name: "Japan" }),
    ).toBeInTheDocument();
  });

  it("searches as you type and keeps the search in the URL", async () => {
    const fetch = mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/dancers": (n) => (n === 0 ? page([MENNO, AMI]) : page([AMI])),
    });
    const router = renderApp("/dancers");
    await screen.findByText("Menno");

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Name, alias or @handle" }),
      "ami",
    );

    // Ami is in the first list too: the new results are in once Menno is gone and Ami is back.
    await vi.waitFor(() =>
      expect(screen.queryByText("Menno")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Ami")).toBeInTheDocument();
    expect(router.state.location.search).toBe("?q=ami");
    expect(searches(fetch).at(-1)).toEqual(["ami", null]);
  });

  it("says when no one matches", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/dancers": page([]),
    });
    renderApp("/dancers?q=zzz");

    expect(
      await screen.findByText("No one matches “zzz”."),
    ).toBeInTheDocument();
  });

  it("says when nobody is listed yet", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/dancers": page([]),
    });
    renderApp("/dancers");

    expect(
      await screen.findByText("Nobody is listed yet."),
    ).toBeInTheDocument();
  });

  it("clears the search when the header's link opens the page again", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/dancers": page([]),
    });
    const router = renderApp("/dancers?q=zzz");
    await screen.findByText("No one matches “zzz”.");

    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("link", {
        name: "Find someone",
      }),
    );

    expect(
      await screen.findByText("Nobody is listed yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Name, alias or @handle" }),
    ).toHaveValue("");
    // The stale search must not come back once the typing pause has passed.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(router.state.location.search).toBe("");
  });

  it("shows more from the next page", async () => {
    const fetch = mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/dancers": (n) => (n === 0 ? page([MENNO], "20") : page([AMI])),
    });
    renderApp("/dancers");
    await screen.findByText("Menno");

    await userEvent.click(screen.getByRole("button", { name: "Show more" }));

    expect(await screen.findByText("Ami")).toBeInTheDocument();
    expect(searches(fetch).at(-1)).toEqual([null, "20"]);
    expect(
      screen.queryByRole("button", { name: "Show more" }),
    ).not.toBeInTheDocument();
  });

  it("is in the header", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "GET /api/dancers": page([]),
    });
    renderApp("/");
    const header = within(await screen.findByRole("banner"));

    await userEvent.click(
      await header.findByRole("link", { name: "Find someone" }),
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Find someone" }),
    ).toBeInTheDocument();
  });
});
