import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setTheme } from "../../src/lib/theme";
import { LIL_G, mockApi, renderApp } from "../support/app";

const NOVA = {
  ...LIL_G,
  display_name: "Nova B",
  dancer: {
    id: "01920000-0000-7000-8000-0000000000aa",
    dancer_name: "Nova",
    country: "FR",
    country2: null,
    instagram_handle: "nova",
    avatar_url: null,
    avatar: null,
    deleted: false,
    verified: true,
  },
};
const ORGANIZER = { ...LIL_G, role: "organizer" };
const ADMIN = { ...LIL_G, role: "admin" };
const me = (user: object) => ({ status: 200, body: user });
const drafts = (count: number) => ({
  status: 200,
  body: { items: Array.from({ length: count }, () => ({})), next_cursor: null },
});
const inReview = (count: number) => ({
  status: 200,
  body: {
    jams_in_review: count,
    dancer_claims_pending: 0,
    organizer_claims_pending: 0,
  },
});

/** Opens the desktop button's menu. */
async function openMenu(name: string) {
  await userEvent.click(
    await screen.findByRole("button", { name: `Account menu, ${name}` }),
  );
  return within(screen.getByRole("menu", { name: "Account" }));
}

describe("AccountMenu", () => {
  afterEach(() => setTheme("auto"));

  it("opens on a dancer's page, without My jams or Admin", async () => {
    mockApi({ "GET /api/auth/me": me(NOVA), "GET /api/events": drafts(0) });
    renderApp("/nowhere");
    const menu = await openMenu("Nova");

    const first = menu.getAllByRole("menuitem")[0];
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("href", `/dancers/${NOVA.dancer.id}`);
    expect(first).toHaveAccessibleName(/^Nova Verified View my page/);
    expect(menu.queryByRole("menuitem", { name: /My jams/ })).toBeNull();
    expect(menu.queryByRole("menuitem", { name: /Admin/ })).toBeNull();
  });

  it("shows a page the account made as its own, asking to verify it", async () => {
    const unverified = { ...NOVA, dancer: { ...NOVA.dancer, verified: false } };
    mockApi({
      "GET /api/auth/me": me(unverified),
      "GET /api/events": drafts(0),
    });
    renderApp("/nowhere");
    const menu = await openMenu("Nova");

    const first = menu.getAllByRole("menuitem")[0];
    expect(first).toHaveAttribute("href", `/dancers/${NOVA.dancer.id}`);
    expect(first).toHaveAccessibleName("Nova Not verified yet · Verify it");
  });

  it("without a page, leads to the welcome step, back here after", async () => {
    mockApi({ "GET /api/auth/me": me(LIL_G), "GET /api/events": drafts(0) });
    renderApp("/nowhere?x=1");
    const menu = await openMenu("Lil G");

    const find = menu.getAllByRole("menuitem")[0];
    expect(find).toHaveAccessibleName("Find my page");
    expect(find).toHaveAccessibleDescription(
      "Are you on BreakingJam? Find your page, or make it.",
    );
    expect(find).toHaveAttribute("href", "/welcome?next=%2Fnowhere%3Fx%3D1");
    expect(menu.queryByRole("menuitem", { name: /My jams/ })).toBeNull();
    expect(menu.queryByRole("menuitem", { name: /Admin/ })).toBeNull();
  });

  it("gives an account that registered a jam My jams, still without Admin", async () => {
    mockApi({
      "GET /api/auth/me": me(ORGANIZER),
      "GET /api/events": drafts(0),
    });
    renderApp("/nowhere");
    const menu = await openMenu("Lil G");

    expect(menu.getByRole("menuitem", { name: "My jams" })).toHaveAttribute(
      "href",
      "/org/jams",
    );
    expect(menu.queryByRole("menuitem", { name: /Admin/ })).toBeNull();
  });

  it("shows admins Admin, with live counts that hide at 0", async () => {
    // Each opening asks again: the second answers say everything was dealt with.
    let waiting = 3;
    mockApi({
      "GET /api/auth/me": me(ADMIN),
      "GET /api/events": (n) => drafts(n === 0 ? 1 : 0),
      "GET /api/admin/stats": () => inReview(waiting),
    });
    renderApp("/nowhere");
    let menu = await openMenu("Lil G");

    expect(
      await menu.findByRole("menuitem", { name: "My jams 1 draft" }),
    ).toHaveAttribute("href", "/org/jams");
    expect(
      await menu.findByRole("menuitem", { name: "Admin 3 to review" }),
    ).toHaveAttribute("href", "/admin");

    await userEvent.keyboard("{Escape}");
    waiting = 0;
    menu = await openMenu("Lil G");
    expect(
      await menu.findByRole("menuitem", { name: "Admin" }),
    ).toBeInTheDocument();
    expect(
      await menu.findByRole("menuitem", { name: "My jams" }),
    ).toBeInTheDocument();
  });

  it("shows only the avatar on the desktop button, the name in its label and tooltip", async () => {
    mockApi({ "GET /api/auth/me": me(NOVA), "GET /api/events": drafts(0) });
    renderApp("/nowhere");
    const trigger = await screen.findByRole("button", {
      name: "Account menu, Nova",
    });

    expect(trigger).toHaveTextContent("");
    expect(trigger).toHaveAttribute("title", "Nova");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      within(screen.getByRole("menu", { name: "Account" })).getByRole(
        "menuitem",
        { name: /^Nova/ },
      ),
    ).toBeInTheDocument();
  });

  it("marks the closed button while an admin has items to review", async () => {
    mockApi({
      "GET /api/auth/me": me(ADMIN),
      "GET /api/events": drafts(0),
      "GET /api/admin/stats": inReview(2),
    });
    renderApp("/nowhere");

    expect(await screen.findByTestId("review-dot")).toBeInTheDocument();
  });

  it("has no dot with nothing to review", async () => {
    let asked = false;
    mockApi({
      "GET /api/auth/me": me(ADMIN),
      "GET /api/events": drafts(0),
      "GET /api/admin/stats": () => {
        asked = true;
        return inReview(0);
      },
    });
    renderApp("/nowhere");

    await screen.findByRole("button", { name: "Account menu, Lil G" });
    await waitFor(() => expect(asked).toBe(true));
    expect(screen.queryByTestId("review-dot")).toBeNull();
  });

  it("doesn't ask a non-admin what's to review", async () => {
    mockApi({
      "GET /api/auth/me": me(ORGANIZER),
      "GET /api/events": drafts(0),
    });
    renderApp("/nowhere");

    await screen.findByRole("button", { name: "Account menu, Lil G" });
    expect(screen.queryByTestId("review-dot")).toBeNull();
  });

  it("switches the theme from the menu", async () => {
    mockApi({ "GET /api/auth/me": me(LIL_G), "GET /api/events": drafts(0) });
    renderApp("/nowhere");
    let menu = await openMenu("Lil G");
    expect(menu.getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(menu.getByRole("menuitemradio", { name: "Auto" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await userEvent.click(menu.getByRole("menuitemradio", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("bj.theme")).toBe("dark");
    menu = await openMenu("Lil G");
    expect(menu.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("works from the keyboard and gives focus back to its button", async () => {
    mockApi({ "GET /api/auth/me": me(NOVA), "GET /api/events": drafts(0) });
    renderApp("/nowhere");
    const trigger = await screen.findByRole("button", {
      name: "Account menu, Nova",
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");

    trigger.focus();
    await userEvent.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = within(screen.getByRole("menu", { name: "Account" }));
    expect(menu.getAllByRole("menuitem")[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(menu.getByRole("menuitem", { name: "Account" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(menu.getByRole("menuitemradio", { name: "Light" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(menu.getByRole("menuitemradio", { name: "Dark" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("below xl, opens a sheet with the nav and Register a jam, locking the page", async () => {
    mockApi({ "GET /api/auth/me": me(NOVA), "GET /api/events": drafts(0) });
    const router = renderApp("/nowhere");
    const avatar = await screen.findByRole("button", { name: "Account menu" });
    expect(
      screen.queryByRole("button", { name: "Open menu" }),
    ).not.toBeInTheDocument();

    await userEvent.click(avatar);
    const menu = within(screen.getByRole("menu", { name: "Account" }));
    expect(
      menu.getAllByRole("menuitem").map((item) => item.getAttribute("href")),
    ).toEqual([
      `/dancers/${NOVA.dancer.id}`,
      "/map",
      "/jams",
      "/dancers",
      "/account",
      null, // Log out
      "/org/jams/new",
    ]);
    expect(document.body.style.overflow).toBe("hidden");

    // Tapping the avatar again closes it; so does going somewhere.
    await userEvent.click(avatar);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    await userEvent.click(avatar);
    await userEvent.click(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: "Dancers",
      }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/dancers"),
    );
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
