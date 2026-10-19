import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIL_G, LOGGED_OUT, calls, mockApi, renderApp } from "../support/app";

/** The page header, once the (possibly lazy) route has rendered. */
async function header() {
  return within(await screen.findByRole("banner"));
}

describe("Header", () => {
  it("leads home from the J mark and wordmark; the footer has the round logo", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/");
    const home = (await header()).getByRole("link", {
      name: "BreakingJam home",
    });

    expect(home).toHaveAttribute("href", "/");
    expect(home.querySelector("img")).toHaveAttribute("src", "/favicon.svg");
    const footer = within(screen.getByRole("contentinfo"));
    expect(
      footer
        .getByRole("link", { name: "BreakingJam home" })
        .querySelector("img"),
    ).toHaveAttribute("src", "/jam-logo.svg");
    expect(footer.getByRole("link", { name: "Instagram" })).toHaveAttribute(
      "href",
      "https://instagram.com/breaking.jam",
    );
  });

  it("switches language from the listbox and remembers it", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/");

    await userEvent.click(
      await (
        await header()
      ).findByRole("button", { name: "Language: English" }),
    );
    await userEvent.click(screen.getByRole("option", { name: "Français" }));

    expect(
      await (await header()).findByRole("link", { name: "Trouver une jam" }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("fr");
    expect(localStorage.getItem("bj.lang")).toBe("fr");
  });

  it("works from the keyboard", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/");
    const button = await (
      await header()
    ).findByRole("button", {
      name: "Language: English",
    });

    await userEvent.click(button);
    expect(screen.getByRole("option", { name: "English" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(
      await (await header()).findByRole("link", { name: "Jam finden" }),
    ).toBeInTheDocument();
    expect(
      (await header()).getByRole("button", { name: "Sprache: Deutsch" }),
    ).toHaveFocus();

    await userEvent.click(
      (await header()).getByRole("button", { name: "Sprache: Deutsch" }),
    );
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("offers log in, then log out once logged in", async () => {
    const fetch = mockApi({
      "GET /api/auth/me": { status: 200, body: LIL_G },
      "POST /api/auth/logout": { status: 204 },
    });
    renderApp("/jams/paris-cypher-3f9a1c");
    // Logged in, an organiser finds their jams in the header.
    expect(
      await (await header()).findByRole("link", { name: "My jams" }),
    ).toHaveAttribute("href", "/org/jams");

    await userEvent.click(
      await (await header()).findByRole("button", { name: "Log out" }),
    );

    expect(
      await (await header()).findByRole("link", { name: "Log in" }),
    ).toBeInTheDocument();
    expect(
      (await header()).queryByRole("link", { name: "My jams" }),
    ).not.toBeInTheDocument();
    expect(calls(fetch)).toContain("POST /api/auth/logout");
  });

  it("sends the log-in link back to the current page", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/jams/paris-cypher-3f9a1c");

    const login = await (await header()).findByRole("link", { name: "Log in" });
    expect(login).toHaveAttribute(
      "href",
      "/login?next=%2Fjams%2Fparis-cypher-3f9a1c",
    );
  });
});

describe("routing", () => {
  it("sends logged-out organisers to log in, then back", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    const router = renderApp("/org/jams/new");

    expect(
      await screen.findByRole("heading", { name: "Log in" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(router.state.location.search).toBe("?next=%2Forg%2Fjams%2Fnew"),
    );
  });

  it("has a not-found page", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/nowhere");

    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });
});
