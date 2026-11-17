// The jam page with one battle, for the tests of entering and asking (M32).
import { screen, within } from "@testing-library/react";
import { LIL_G, mockApi, renderApp } from "./app";

export const at = "2026-10-01T10:00:00Z";
export const ID = "01920000-0000-7000-8000-00000000e001";
export const SLUG = "winter-cypher-00e001";
export const NOVA = "01920000-0000-7000-8000-0000000000d1";
export const JAM = {
  id: ID,
  organizer_id: "01920000-0000-7000-8000-0000000000a1",
  name: "Winter Cypher",
  slug: SLUG,
  description: null,
  status: "published",
  phase: "upcoming",
  starts_on: "2030-12-14",
  ends_on: "2030-12-14",
  timezone: "Europe/Zurich",
  venue_name: null,
  address: null,
  city: "Zürich",
  country: "CH",
  lat: null,
  lng: null,
  registration_url: null,
  instagram_url: null,
  website_url: null,
  contact_email: "crew@example.com",
  created_at: at,
  updated_at: at,
  can_edit: false,
  can_edit_battles: false,
  actions: [],
  organizer: {
    id: "01920000-0000-7000-8000-0000000000a1",
    display_name: "Floor Lords",
    jams: 3,
    instagram_handle: null,
    verified: false,
  },
  going_count: 0,
  going: false,
  takes_attendees: true,
  takes_entries: true,
};
export const dancer = (id: string, name: string) => ({
  id,
  dancer_name: name,
  country: "CH",
  country2: null,
  instagram_handle: null,
  avatar_url: null,
  avatar: null,
  deleted: false,
});
export const entry = (id: string, member: ReturnType<typeof dancer>) => ({
  id,
  battle_id: "b1",
  status: "confirmed",
  reached: "na",
  members: [member],
  created_at: at,
  updated_at: at,
});
export const battle = (entries: object[], extra: object = {}) => ({
  id: "b1",
  event_id: ID,
  name: "1v1 Bboy",
  format: "team",
  team_size: 1,
  gender: "bboy",
  age: "adult",
  age_min: 18,
  max_entries: 3,
  position: 0,
  starts_at: "2030-12-14T14:00:00",
  registration: "open",
  created_at: at,
  updated_at: at,
  entries,
  matches: [],
  ...extra,
});
export const HALO = entry(
  "e1",
  dancer("01920000-0000-7000-8000-0000000000d2", "Halo"),
);
export const MINE = entry("e2", dancer(NOVA, "Nova"));
const page = (verified: boolean) => ({
  ...dancer(NOVA, "Nova"),
  verified,
});
export const signedIn = (verified = true) => ({
  status: 200,
  body: { ...LIL_G, dancer: page(verified) },
});
export const ENTER = "/api/battles/b1/enter";

export type Replies = Parameters<typeof mockApi>[0];

export function jamPage(
  me: Replies[string],
  battles: Replies[string],
  replies: Replies = {},
  jam: object = {},
) {
  const fetch = mockApi({
    "GET /api/auth/me": me,
    [`GET /api/events/${SLUG}`]: { status: 200, body: { ...JAM, ...jam } },
    [`GET /api/events/${ID}/battles`]: battles,
    [`GET /api/events/${ID}/staff`]: { status: 200, body: [] },
    "GET /api/events": { status: 200, body: { items: [], next_cursor: null } },
    ...replies,
  });
  renderApp(`/jams/${SLUG}`);
  return fetch;
}

export const card = async () =>
  within(
    (await screen.findByRole("heading", { name: "1v1 Bboy" })).closest("li")!,
  );
