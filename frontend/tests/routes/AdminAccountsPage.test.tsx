import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIL_G, bodyOf, mockApi, renderApp } from "../support/app";

const SUPER_ADMIN = { status: 200, body: { ...LIL_G, role: "super_admin" } };
const ID = "01930000-0000-7000-8000-0000000000c1";

const account = (overrides: object) => ({
  id: ID,
  email: "nova@example.com",
  display_name: "Nova",
  role: "organizer",
  created_at: "2026-10-01T10:00:00Z",
  email_verified_at: "2026-10-01T10:05:00Z",
  last_seen_at: "2026-11-08T18:30:00Z",
  public_jams: 2,
  private_jams: 1,
  team_roles: ["none", "seed_admin", "admin"],
  ...overrides,
});

/** The query strings `GET /api/admin/accounts` was called with, in order. */
function accountQueries(fetch: ReturnType<typeof mockApi>) {
  return fetch.mock.calls
    .map(([input]) => new URL(input instanceof Request ? input.url : input))
    .filter((url) => url.pathname === "/api/admin/accounts")
    .map((url) => url.search);
}

describe("AdminAccountsPage", () => {
  it("lists one view at a time and searches it by email", async () => {
    const fetch = mockApi({
      "GET /api/auth/me": SUPER_ADMIN,
      "GET /api/admin/accounts": {
        status: 200,
        body: { items: [account({})], next_cursor: null },
      },
    });
    const router = renderApp("/admin/accounts");

    expect(
      await screen.findByRole("link", { name: "nova@example.com" }),
    ).toHaveAttribute("href", "mailto:nova@example.com");
    expect(screen.getByText("Organiser")).toBeInTheDocument();
    expect(
      screen.getByText("2 public jams · 1 not public yet"),
    ).toBeInTheDocument();
    expect(accountQueries(fetch)[0]).toBe("?view=last_seen");

    await userEvent.click(screen.getByRole("button", { name: "Unconfirmed" }));
    await waitFor(() =>
      expect(router.state.location.search).toBe("?view=unconfirmed"),
    );
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search by email" }),
      "nova",
    );

    // The search keeps the view.
    await waitFor(() =>
      expect(router.state.location.search).toBe("?view=unconfirmed&q=nova"),
    );
    await waitFor(() =>
      expect(accountQueries(fetch).at(-1)).toBe("?view=unconfirmed&q=nova"),
    );
  });

  it("changes a team role, offering only what the API allows", async () => {
    const fetch = mockApi({
      "GET /api/auth/me": SUPER_ADMIN,
      "GET /api/admin/accounts": {
        status: 200,
        body: {
          items: [
            account({ team_roles: ["none", "seed_admin"] }),
            account({
              id: "01930000-0000-7000-8000-0000000000c2",
              email: "me@example.com",
              role: "super_admin",
              team_roles: [],
            }),
          ],
          next_cursor: null,
        },
      },
      [`PUT /api/admin/users/${ID}/role`]: {
        status: 200,
        body: { ...LIL_G, role: "seed_admin" },
      },
    });
    renderApp("/admin/accounts");

    // Nobody changes their own role, or one above theirs: no button there.
    const buttons = await screen.findAllByRole("button", { name: "Team role" });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]!);
    const dialog = screen.getByRole("dialog", {
      name: "Team role of nova@example.com",
    });
    const select = within(dialog).getByLabelText("Team role");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Not on the team", "Seed admin"]);
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    await userEvent.selectOptions(select, "seed_admin");
    await userEvent.click(save);

    expect(
      await screen.findByText("nova@example.com: Seed admin."),
    ).toBeInTheDocument();
    expect(await bodyOf(fetch, `PUT /api/admin/users/${ID}/role`)).toEqual({
      role: "seed_admin",
    });
  });

  it("shows an account once when the list shifted between two pages", async () => {
    const nova = account({});
    const kai = account({
      id: "01930000-0000-7000-8000-0000000000c3",
      email: "kai@example.com",
    });
    mockApi({
      "GET /api/auth/me": SUPER_ADMIN,
      // Kai came back between the two pages: Nova slid down onto the second one.
      "GET /api/admin/accounts": (n) => ({
        status: 200,
        body:
          n === 0
            ? { items: [nova], next_cursor: "1" }
            : { items: [nova, kai], next_cursor: null },
      }),
    });
    renderApp("/admin/accounts");

    await screen.findByRole("link", { name: "nova@example.com" });
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));

    expect(
      await screen.findByRole("link", { name: "kai@example.com" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "nova@example.com" }),
    ).toHaveLength(1);
  });
});
