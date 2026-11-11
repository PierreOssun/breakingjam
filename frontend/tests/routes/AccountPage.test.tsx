import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIL_G, LOGGED_OUT, mockApi, renderApp } from "../support/app";

const at = "2026-10-01T10:00:00Z";
const PAGE = {
  id: "01920000-0000-7000-8000-0000000000d1",
  dancer_name: "claude MPC",
  aliases: [],
  country: "CH",
  city: null,
  bio: null,
  instagram_handle: null,
  source: "user",
  verified_at: null,
  avatar_url: null,
  merged_into_id: null,
  created_at: at,
  updated_at: at,
  crews: [],
  titles: [],
  can_edit: true,
  can_set_titles: false,
  instagram_hidden: false,
};
const ORGANISER = {
  id: LIL_G.id,
  display_name: "Claude Test Org",
  instagram_handle: null,
  country: null,
  city: null,
  bio: null,
  verified_at: null,
  can_edit: true,
  jams: 1,
};
const own = {
  id: PAGE.id,
  dancer_name: PAGE.dancer_name,
  avatar_url: null,
  avatar: null,
  verified: false,
};

describe("AccountPage", () => {
  it("gathers the stage name, the organiser name and the sign-in", async () => {
    mockApi({
      "GET /api/auth/me": {
        status: 200,
        body: { ...LIL_G, role: "organizer", dancer: own },
      },
      [`GET /api/dancers/${PAGE.id}`]: { status: 200, body: PAGE },
      [`GET /api/organizers/${LIL_G.id}`]: { status: 200, body: ORGANISER },
    });
    renderApp("/account");

    const stage = (await screen.findByRole("heading", { name: "Stage name" }))
      .parentElement!;
    expect(
      await within(stage).findByRole("link", { name: "claude MPC" }),
    ).toHaveAttribute("href", `/dancers/${PAGE.id}`);
    await userEvent.click(within(stage).getByRole("button", { name: "Edit" }));
    expect(
      within(
        screen.getByRole("dialog", { name: "Edit profile" }),
      ).getByLabelText("Stage name"),
    ).toHaveValue("claude MPC");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    const organiser = (
      await screen.findByRole("heading", { name: "Organiser name" })
    ).parentElement!;
    expect(
      await within(organiser).findByRole("link", { name: "Claude Test Org" }),
    ).toBeInTheDocument();

    const signIn = screen.getByRole("heading", {
      name: "Sign-in",
    }).parentElement!;
    expect(signIn).toHaveTextContent(LIL_G.email);
    expect(
      within(signIn).getByRole("link", { name: "Change password" }),
    ).toHaveAttribute("href", "/forgot-password?next=%2Faccount");
  });

  it("leads an account without a page to the welcome step", async () => {
    mockApi({
      "GET /api/auth/me": { status: 200, body: { ...LIL_G, dancer: null } },
    });
    renderApp("/account");
    expect(
      await screen.findByRole("link", { name: "Find my page" }),
    ).toHaveAttribute("href", "/welcome?next=%2Faccount");
    // A plain account organises nothing yet.
    expect(
      screen.queryByRole("heading", { name: "Organiser name" }),
    ).toBeNull();
  });

  it("asks a visitor to log in first", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    const router = renderApp("/account");
    await screen.findByRole("heading", { name: "Log in" });
    expect(router.state.location.search).toBe("?next=%2Faccount");
  });
});
