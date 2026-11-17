import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { bodyOf, calls } from "../../support/app";
import {
  HALO,
  ID,
  NOVA,
  SLUG,
  at,
  battle,
  card,
  dancer,
  jamPage,
  signedIn,
} from "../../support/entering";

vi.mock("../../../src/features/map/StaticMap", () => ({
  default: () => <div>Venue map</div>,
}));

const ASK = "/api/battles/b1/requests";
const MINE = `/api/events/${ID}/requests/mine`;
const QUEUE = `/api/events/${ID}/requests`;
const approval = (extra: object = {}) =>
  battle([HALO], { registration: "approval", ...extra });
const myRequest = (status: string) => ({
  status: 200,
  body: [{ id: "r1", battle_id: "b1", status }],
});
/** The viewer's own page, as its owner reads it: the handle it hides. */
const ownPage = {
  status: 200,
  body: {
    ...dancer(NOVA, "Nova"),
    aliases: [],
    instagram_handle: "nova.breaks",
    instagram_hidden: true,
    source: "self",
    verified_at: at,
    merged_into_id: null,
    created_at: at,
    updated_at: at,
    crews: [],
    titles: [],
    can_edit: true,
    can_set_titles: true,
  },
};

describe("asking to enter", () => {
  it("sends a request, says what the organiser will see, then waits", async () => {
    // The request exists once it is sent; the page reads it more than once before.
    let sent = false;
    const fetch = jamPage(
      signedIn(),
      { status: 200, body: [approval()] },
      {
        [`GET ${MINE}`]: () =>
          sent ? myRequest("pending") : { status: 200, body: [] },
        [`GET /api/dancers/${NOVA}`]: ownPage,
        [`POST ${ASK}`]: () => {
          sent = true;
          return {
            status: 201,
            body: { id: "r1", battle_id: "b1", status: "pending" },
          };
        },
      },
    );
    const battleCard = await card();
    expect(
      battleCard.getByText("The organiser accepts or declines your request."),
    ).toBeInTheDocument();
    // "Enter a battle" leads here too.
    expect(
      screen.getByRole("link", { name: "Enter a battle" }),
    ).toBeInTheDocument();

    await userEvent.click(
      battleCard.getByRole("button", { name: "Ask to enter" }),
    );
    const sheet = within(
      await screen.findByRole("dialog", { name: "Ask to enter 1v1 Bboy" }),
    );
    expect(sheet.getByText("Asking as")).toBeInTheDocument();
    expect(
      await sheet.findByText(
        "The organiser will see your Instagram @nova.breaks, even though it is hidden on your page.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(sheet.getByRole("button", { name: "Send request" }));

    expect(await bodyOf(fetch, `POST ${ASK}`)).toEqual({
      team_name: null,
      teammates: [],
    });
    expect(await battleCard.findByText("Request sent")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Never public: the battle still lists Halo alone.
    expect(battleCard.queryByText(/Nova/)).toBeNull();
  });

  it("takes the request back at once", async () => {
    let cancelled = false;
    const fetch = jamPage(
      signedIn(),
      { status: 200, body: [approval()] },
      {
        [`GET ${MINE}`]: () =>
          cancelled ? { status: 200, body: [] } : myRequest("pending"),
        "DELETE /api/requests/r1": () => {
          cancelled = true;
          return { status: 204 };
        },
      },
    );
    const battleCard = await card();
    await userEvent.click(
      await battleCard.findByRole("button", { name: "Cancel request" }),
    );

    await waitFor(() =>
      expect(calls(fetch)).toContain("DELETE /api/requests/r1"),
    );
    expect(
      await battleCard.findByRole("button", { name: "Ask to enter" }),
    ).toBeInTheDocument();
  });

  it("says when the organiser declined, with a way to reach them", async () => {
    jamPage(
      signedIn(),
      { status: 200, body: [approval()] },
      { [`GET ${MINE}`]: myRequest("rejected") },
    );
    const battleCard = await card();

    expect(await battleCard.findByText("Request declined")).toBeInTheDocument();
    expect(
      battleCard.getByRole("link", { name: "Contact the organiser" }),
    ).toHaveAttribute("href", "mailto:crew@example.com");
    expect(screen.queryByRole("link", { name: "Enter a battle" })).toBeNull();
  });

  it("asks for a team only once it is full", async () => {
    const LUMEN = {
      ...dancer("01920000-0000-7000-8000-0000000000d9", "Lumen"),
      aliases: [],
      verified: false,
      city: null,
      crews: [],
    };
    const fetch = jamPage(
      signedIn(),
      {
        status: 200,
        body: [approval({ name: "1v1 Bboy", team_size: 2, entries: [] })],
      },
      {
        [`GET ${MINE}`]: { status: 200, body: [] },
        [`GET /api/dancers/${NOVA}`]: ownPage,
        "GET /api/dancers": {
          status: 200,
          body: { items: [LUMEN], next_cursor: null },
        },
        [`POST ${ASK}`]: {
          status: 201,
          body: { id: "r1", battle_id: "b1", status: "pending" },
        },
      },
    );
    await userEvent.click(
      (await card()).getByRole("button", { name: "Ask to enter" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Ask to enter 1v1 Bboy",
    });
    const sheet = within(dialog);
    const send = sheet.getByRole("button", { name: "Send request" });
    expect(send).toBeDisabled();
    expect(
      sheet.getByText("Add 1 more dancer to make the team."),
    ).toBeInTheDocument();

    await userEvent.type(sheet.getByLabelText("Team name"), "Duo");
    await userEvent.type(sheet.getByRole("searchbox"), "Lum");
    await userEvent.click(await sheet.findByRole("button", { name: /^Lumen/ }));
    expect(send).toBeEnabled();
    await userEvent.click(send);

    expect(await bodyOf(fetch, `POST ${ASK}`)).toEqual({
      team_name: "Duo",
      teammates: [LUMEN.id],
    });
  });
});

describe("in as a team", () => {
  it("leaves taking the team out to the organiser", async () => {
    const team = {
      id: "e9",
      battle_id: "b1",
      team_name: "Duo",
      status: "confirmed",
      reached: "na",
      members: [
        dancer(NOVA, "Nova"),
        dancer("01920000-0000-7000-8000-0000000000d9", "Lumen"),
      ],
      created_at: at,
      updated_at: at,
    };
    jamPage(
      signedIn(),
      {
        status: 200,
        body: [approval({ team_size: 2, entries: [team] })],
      },
      { [`GET ${MINE}`]: myRequest("approved") },
    );
    const battleCard = await card();

    expect(await battleCard.findByText("You’re in")).toBeInTheDocument();
    expect(battleCard.queryByRole("button", { name: "Withdraw" })).toBeNull();
    expect(
      battleCard.getByText(/Only the organiser can take it out/),
    ).toBeInTheDocument();
  });
});

describe("answering requests", () => {
  const RIOT = dancer("01920000-0000-7000-8000-0000000000d7", "Riot");
  const queue = (extra: object = {}) => ({
    status: 200,
    body: [
      {
        id: "r1",
        battle_id: "b1",
        team_name: null,
        created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        members: [
          {
            ...RIOT,
            instagram_handle: "riot.bgirl",
            instagram_hidden: true,
            verified: true,
          },
        ],
        ...extra,
      },
    ],
  });
  const organiser = { can_edit: true, can_edit_battles: true };

  it("shows how many wait, and Review opens them with their Instagram", async () => {
    const fetch = jamPage(
      signedIn(),
      { status: 200, body: [approval()] },
      {
        [`GET ${QUEUE}`]: queue(),
        "POST /api/requests/r1/accept": { status: 200, body: HALO },
      },
      organiser,
    );
    const battleCard = await card();
    expect(
      await battleCard.findByText("1 request waiting"),
    ).toBeInTheDocument();
    await userEvent.click(battleCard.getByRole("button", { name: "Review" }));

    const sheet = within(
      await screen.findByRole("dialog", { name: "Requests" }),
    );
    expect(sheet.getByText(/1v1 Bboy · 1 of 3 entered/)).toBeInTheDocument();
    expect(sheet.getByRole("link", { name: "Riot" })).toHaveAttribute(
      "href",
      `/dancers/${RIOT.id}`,
    );
    const instagram = sheet.getByRole("link", { name: "@riot.bgirl" });
    expect(instagram).toHaveAttribute(
      "href",
      "https://www.instagram.com/riot.bgirl",
    );
    expect(instagram).toHaveAttribute("target", "_blank");
    expect(sheet.getByText("hidden on their page")).toBeInTheDocument();
    expect(sheet.getByText("2 hr ago")).toBeInTheDocument();

    await userEvent.click(sheet.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(calls(fetch)).toContain("POST /api/requests/r1/accept"),
    );
  });

  it("declines, and waits to accept while the battle is full", async () => {
    const fetch = jamPage(
      signedIn(),
      { status: 200, body: [approval({ max_entries: 1 })] },
      {
        [`GET ${QUEUE}`]: queue({ team_name: "Duo" }),
        "POST /api/requests/r1/decline": { status: 204 },
      },
      organiser,
    );
    await userEvent.click(
      await (await card()).findByRole("button", { name: "Review" }),
    );
    const sheet = within(
      await screen.findByRole("dialog", { name: "Requests" }),
    );

    expect(sheet.getByText(/· full/)).toBeInTheDocument();
    expect(sheet.getByText("Duo")).toBeInTheDocument();
    expect(sheet.getByRole("button", { name: "Accept" })).toBeDisabled();
    await userEvent.click(sheet.getByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(calls(fetch)).toContain("POST /api/requests/r1/decline"),
    );
  });

  it("lists the organiser's jams with requests in the account menu", async () => {
    jamPage(
      { status: 200, body: { ...signedIn().body, role: "organizer" } },
      { status: 200, body: [approval()] },
      {
        "GET /api/requests/waiting": {
          status: 200,
          body: [{ id: ID, name: "Winter Cypher", slug: SLUG, count: 3 }],
        },
      },
    );
    await card();
    // The header has the menu twice, as a dropdown and as a sheet; either opens it.
    await userEvent.click(
      screen.getAllByRole("button", { name: /Account menu/ })[0]!,
    );

    expect(
      await screen.findByRole("menuitem", { name: "Requests 3" }),
    ).toHaveAttribute("href", `/jams/${SLUG}#battles`);
  });
});
