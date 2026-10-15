import { screen, within } from "@testing-library/react";
import { LIL_G, mockApi, renderApp } from "../support/app";

const ADMIN = { status: 200, body: { ...LIL_G, role: "admin" } };
const STATS = {
  jams_upcoming: 12,
  jams_past: 40,
  jams_in_review: 3,
  jams_draft: 4,
  jams_cancelled: 1,
  dancers: 50,
  dancers_verified: 9,
  dancers_with_instagram: 20,
  organizers: 8,
  organizers_verified: 4,
  accounts: 63,
  accounts_new: 12,
  dancer_claims_pending: 4,
  organizer_claims_pending: 1,
};

describe("AdminOverviewPage", () => {
  it("counts what the site holds and what waits for review", async () => {
    mockApi({
      "GET /api/auth/me": ADMIN,
      "GET /api/admin/stats": { status: 200, body: STATS },
    });
    renderApp("/admin");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Admin" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(
      screen.getByText("40 past · 4 drafts · 1 cancelled"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("18% verified · 40% with Instagram"),
    ).toBeInTheDocument();
    expect(screen.getByText("50% verified")).toBeInTheDocument();
    expect(screen.getByText("+12 in the last 30 days")).toBeInTheDocument();

    // Each tab carries the size of its queue.
    const tabs = within(
      screen.getByRole("navigation", { name: "Admin sections" }),
    );
    expect(tabs.getByRole("link", { name: "Jams 3" })).toHaveAttribute(
      "href",
      "/admin/jams",
    );
    expect(tabs.getByRole("link", { name: "Claims 5" })).toHaveAttribute(
      "href",
      "/admin/claims",
    );
    expect(
      screen.getByRole("link", { name: "3 jams waiting" }),
    ).toHaveAttribute("href", "/admin/jams");
    expect(
      screen.getByRole("link", { name: "1 organiser claim" }),
    ).toHaveAttribute("href", "/admin/claims");
  });

  it("is a missing page for everyone else", async () => {
    mockApi({ "GET /api/auth/me": { status: 200, body: LIL_G } });
    renderApp("/admin");

    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });
});
