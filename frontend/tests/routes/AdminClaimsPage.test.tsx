import { screen } from "@testing-library/react";
import { LIL_G, mockApi, renderApp } from "../support/app";

const ADMIN = { status: 200, body: { ...LIL_G, role: "admin" } };

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
      "GET /api/admin/organizer-claims": {
        status: 200,
        body: { items: [], next_cursor: null },
      },
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
});
