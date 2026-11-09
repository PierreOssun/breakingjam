import { screen, within } from "@testing-library/react";
import { LIL_G, mockApi, renderApp } from "../support/app";

const ADMIN = { status: 200, body: { ...LIL_G, role: "admin" } };
const EMPTY = { status: 200, body: { items: [], next_cursor: null } };

const claim = (n: number, name: string, deleted: boolean) => ({
  id: `0193000${n}-0000-7000-8000-000000000000`,
  dancer_id: `0192000${n}-0000-7000-8000-000000000000`,
  user_id: "01910000-0000-7000-8000-000000000000",
  code: `BJ-${n}`,
  status: "pending",
  reviewed_at: null,
  created_at: "2026-10-30T10:00:00Z",
  dancer: {
    id: `0192000${n}-0000-7000-8000-000000000000`,
    dancer_name: name,
    country: "FR",
    country2: null,
    instagram_handle: null,
    avatar_url: null,
    avatar_parts: null,
    deleted,
  },
  user: {
    id: "01910000-0000-7000-8000-000000000000",
    email: "claimer@example.com",
    display_name: "Claimer",
  },
});

describe("AdminClaimsPage", () => {
  it("links each claimed page, but not one that was deleted", async () => {
    mockApi({
      "GET /api/auth/me": ADMIN,
      "GET /api/admin/claims": {
        status: 200,
        body: {
          items: [claim(1, "Nova", false), claim(2, "Gone", true)],
          next_cursor: null,
        },
      },
      "GET /api/admin/organizer-claims": EMPTY,
      "GET /api/admin/claims/history": EMPTY,
    });
    renderApp("/admin/claims");

    expect(await screen.findByRole("link", { name: "Nova" })).toHaveAttribute(
      "href",
      "/dancers/01920001-0000-7000-8000-000000000000",
    );
    expect(screen.getByText("Gone")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Gone" }),
    ).not.toBeInTheDocument();
  });

  it("lists past decisions, and the ones the site withdrew", async () => {
    const { dancer, user } = claim(1, "Nova", false);
    mockApi({
      "GET /api/auth/me": ADMIN,
      "GET /api/admin/claims": EMPTY,
      "GET /api/admin/organizer-claims": EMPTY,
      "GET /api/admin/claims/history": {
        status: 200,
        body: {
          items: [
            {
              id: "01930001-0000-7000-8000-0000000000e1",
              status: "approved",
              decided_at: "2026-11-08T18:30:00Z",
              admin_email: "admin@breakingjam.com",
              user,
              instagram_handle: "nova",
              dancer,
            },
            {
              id: "01930001-0000-7000-8000-0000000000e2",
              status: "rejected",
              decided_at: "2026-11-07T18:30:00Z",
              admin_email: null,
              user,
              instagram_handle: "floor.lords",
              dancer: null,
            },
          ],
          next_cursor: null,
        },
      },
    });
    renderApp("/admin/claims");

    const rows = await screen.findAllByRole("listitem");
    const [approved, withdrawn] = rows.slice(-2).map((row) => within(row));
    expect(approved!.getByRole("link", { name: "Nova" })).toHaveAttribute(
      "href",
      `/dancers/${dancer.id}`,
    );
    expect(approved!.getByText("Approved")).toBeInTheDocument();
    expect(
      approved!.getByText(/by admin@breakingjam\.com/),
    ).toBeInTheDocument();
    // An organiser's claim is about their own page.
    expect(withdrawn!.getByRole("link", { name: "Claimer" })).toHaveAttribute(
      "href",
      `/organizers/${user.id}`,
    );
    expect(
      withdrawn!.getByText(/withdrawn: the handle changed/),
    ).toBeInTheDocument();
  });
});
