import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LOGGED_OUT, bodyOf, calls } from "../../support/app";
import {
  ENTER,
  HALO,
  JAM,
  MINE,
  NOVA,
  battle,
  card,
  jamPage,
  signedIn,
} from "../../support/entering";

vi.mock("../../../src/features/map/StaticMap", () => ({
  default: () => <div>Venue map</div>,
}));

describe("entering a battle", () => {
  it("enters an open battle from its sheet, and leads the list as you", async () => {
    const fetch = jamPage(
      signedIn(),
      (n) => ({
        status: 200,
        body: [battle(n === 0 ? [HALO] : [HALO, MINE])],
      }),
      { [`POST ${ENTER}`]: { status: 201, body: MINE } },
    );
    // "Enter a battle" beside "I'm going" leads down to the battles.
    expect(
      await screen.findByRole("link", { name: "Enter a battle" }),
    ).toHaveAttribute("href", "#battles");
    const battleCard = await card();
    expect(
      battleCard.getByText("You enter directly. 2 places left."),
    ).toBeInTheDocument();

    await userEvent.click(
      battleCard.getByRole("button", { name: "Enter battle" }),
    );
    const sheet = within(
      await screen.findByRole("dialog", { name: "Enter 1v1 Bboy" }),
    );
    expect(sheet.getByText("Entering as")).toBeInTheDocument();
    expect(sheet.getByText("Nova")).toBeInTheDocument();
    expect(sheet.getByText("Sat 14 Dec · Winter Cypher")).toBeInTheDocument();
    expect(sheet.getByText("1v1 Bboy starts 14:00")).toBeInTheDocument();
    expect(sheet.getByText("1 of 3 places taken")).toBeInTheDocument();
    await userEvent.click(sheet.getByRole("button", { name: "Enter battle" }));

    expect(calls(fetch)).toContain(`POST ${ENTER}`);
    expect(await battleCard.findByText("You’re in")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    const chips = battleCard.getAllByRole("link", { name: /Nova|Halo/ });
    expect(chips[0]).toHaveTextContent("Nova · you");
  });

  it("keeps the sheet open, and says so, when the last place went first", async () => {
    jamPage(
      signedIn(),
      (n) => ({
        status: 200,
        body: [battle(n === 0 ? [] : [HALO], { max_entries: 1 })],
      }),
      {
        [`POST ${ENTER}`]: {
          status: 409,
          body: { error: { code: "battle_full", message: "battle is full" } },
        },
      },
    );
    await userEvent.click(
      (await card()).getByRole("button", { name: "Enter battle" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Enter 1v1 Bboy",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enter battle" }),
    );

    expect(
      await within(dialog).findByText("This battle just filled up."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Enter battle" }),
    ).toBeDisabled();
    expect(
      await (await card()).findByText("Battle is full"),
    ).toBeInTheDocument();
  });

  it("withdraws after a confirm, and the place is free again", async () => {
    const fetch = jamPage(
      signedIn(),
      (n) => ({ status: 200, body: [battle(n === 0 ? [HALO, MINE] : [HALO])] }),
      { [`DELETE ${ENTER}`]: { status: 204 } },
    );
    const battleCard = await card();
    await userEvent.click(
      await battleCard.findByRole("button", { name: "Withdraw" }),
    );
    const confirm = within(
      await screen.findByRole("dialog", { name: "Withdraw from 1v1 Bboy?" }),
    );
    expect(
      confirm.getByRole("button", { name: "Keep my place" }),
    ).toBeInTheDocument();
    await userEvent.click(confirm.getByRole("button", { name: "Withdraw" }));

    expect(calls(fetch)).toContain(`DELETE ${ENTER}`);
    expect(
      await battleCard.findByRole("button", { name: "Enter battle" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["a visitor", LOGGED_OUT, "Log in to enter", "/login"],
    [
      "an unverified page",
      signedIn(false),
      "Get verified to enter",
      `/dancers/${NOVA}`,
    ],
  ])("asks %s to log in or get verified first", async (_who, me, label, to) => {
    jamPage(me, { status: 200, body: [battle([HALO])] });
    const link = (await card()).getByRole("link", { name: label });
    expect(link.getAttribute("href")).toMatch(new RegExp(`^${to}`));
  });

  it("leaves a battle the organiser fills to the organiser", async () => {
    jamPage(LOGGED_OUT, {
      status: 200,
      body: [battle([], { registration: "organizer" })],
    });
    const battleCard = await card();

    expect(
      battleCard.getByRole("link", { name: "Contact the organiser" }),
    ).toHaveAttribute("href", "mailto:crew@example.com");
    expect(
      battleCard.getByText("The organiser adds the dancers."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Enter a battle" })).toBeNull();
  });

  it("says registration is closed once the jam is live", async () => {
    jamPage(
      signedIn(),
      { status: 200, body: [battle([HALO])] },
      {},
      { phase: "live", takes_entries: false },
    );
    expect(
      await (await card()).findByText("Registration closed"),
    ).toBeInTheDocument();
  });

  it("shows its organiser the setting, with Change to the battle sheet", async () => {
    jamPage(
      signedIn(),
      { status: 200, body: [battle([HALO])] },
      {},
      { can_edit_battles: true },
    );
    const battleCard = await card();
    expect(
      battleCard.getByText("Open · dancers enter directly"),
    ).toBeInTheDocument();
    await userEvent.click(battleCard.getByRole("button", { name: "Change" }));

    const sheet = within(
      await screen.findByRole("dialog", { name: "Edit battle" }),
    );
    expect(sheet.getByRole("radio", { name: /^Open/ })).toBeChecked();
    await waitFor(() =>
      expect(sheet.getByRole("group", { name: "Who can enter" })).toBeVisible(),
    );
  });
});

describe("what the battle card says", () => {
  it("dates the enter sheet by the battle's own day on a longer jam", async () => {
    jamPage(
      signedIn(),
      {
        status: 200,
        body: [battle([HALO], { starts_at: "2030-12-15T14:00:00" })],
      },
      {},
      { ends_on: "2030-12-15" },
    );
    await userEvent.click(
      (await card()).getByRole("button", { name: "Enter battle" }),
    );
    const sheet = within(
      await screen.findByRole("dialog", { name: "Enter 1v1 Bboy" }),
    );

    expect(sheet.getByText("Sun 15 Dec · Winter Cypher")).toBeInTheDocument();
  });

  it("opens the organiser's Instagram in a new tab when the battle is full", async () => {
    jamPage(
      LOGGED_OUT,
      { status: 200, body: [battle([HALO], { max_entries: 1 })] },
      {},
      {
        contact_email: null,
        organizer: { ...JAM.organizer, instagram_handle: "floor.lords" },
      },
    );
    const link = (await card()).getByRole("link", {
      name: "Contact the organiser",
    });

    expect(link).toHaveAttribute("href", "https://ig.me/m/floor.lords");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("entering, when things move under the sheet", () => {
  const enterFrom = async () => {
    await userEvent.click(
      (await card()).getByRole("button", { name: "Enter battle" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Enter 1v1 Bboy",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enter battle" }),
    );
    return dialog;
  };

  it("treats a second tap, or another tab, as the entry it is", async () => {
    jamPage(
      signedIn(),
      (n) => ({ status: 200, body: [battle(n === 0 ? [HALO] : [HALO, MINE])] }),
      {
        [`POST ${ENTER}`]: {
          status: 409,
          body: {
            error: {
              code: "already_entered",
              message: "a dancer is already entered in this battle",
            },
          },
        },
      },
    );
    await enterFrom();

    expect(await (await card()).findByText("You’re in")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says inside the sheet when entering fails, where a toast would be hidden", async () => {
    jamPage(
      signedIn(),
      { status: 200, body: [battle([HALO])] },
      {
        [`POST ${ENTER}`]: {
          status: 500,
          body: { error: { code: "internal", message: "internal" } },
        },
      },
    );
    const dialog = await enterFrom();

    expect(
      await within(dialog).findByText(
        "Something went wrong. Reload the page to try again.",
      ),
    ).toBeInTheDocument();
    // A try again is still possible.
    expect(
      within(dialog).getByRole("button", { name: "Enter battle" }),
    ).toBeEnabled();
  });

  it("offers Enter a battle only while one is left to enter", async () => {
    jamPage(signedIn(), {
      status: 200,
      body: [
        battle([HALO, MINE]),
        battle([HALO], { id: "b2", name: "1v1 Bgirl", max_entries: 1 }),
      ],
    });
    await card();

    expect(screen.queryByRole("link", { name: "Enter a battle" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "I’m going" }),
    ).toBeInTheDocument();
  });
});

describe("who can enter, in the battle sheet", () => {
  async function sheetFor(registration: string, extra: object = {}) {
    const fetch = jamPage(
      signedIn(),
      { status: 200, body: [battle([HALO], { registration, ...extra })] },
      { "PUT /api/battles/b1": { status: 200, body: battle([]) } },
      { can_edit_battles: true },
    );
    await userEvent.click(
      (await card()).getByRole("button", { name: "Change" }),
    );
    const sheet = within(
      await screen.findByRole("dialog", { name: "Edit battle" }),
    );
    return { fetch, sheet };
  }

  it("opens a solo battle to verified dancers", async () => {
    const { fetch, sheet } = await sheetFor("organizer");
    const group = within(sheet.getByRole("group", { name: "Who can enter" }));
    expect(
      group.getByRole("radio", { name: /By the organiser/ }),
    ).toBeChecked();
    expect(group.getByRole("radio", { name: /With approval/ })).toBeEnabled();

    await userEvent.click(group.getByRole("radio", { name: /^Open/ }));
    await userEvent.click(sheet.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls(fetch)).toContain("PUT /api/battles/b1"));
    expect(await bodyOf(fetch, "PUT /api/battles/b1")).toMatchObject({
      registration: "open",
    });
  });

  it("keeps a team battle closed to direct entries, and says why", async () => {
    const { sheet } = await sheetFor("organizer", { team_size: 2 });
    const open = sheet.getByRole("radio", { name: /^Open/ });
    expect(open).toBeDisabled();
    expect(open.closest("label")).toHaveTextContent(
      "For solo battles only. A team needs your approval.",
    );
    expect(
      sheet.getByText(
        "You add the teams yourself. Dancers reach you through Contact.",
      ),
    ).toBeInTheDocument();
  });

  it("says so too when the team size makes it a team", async () => {
    const { fetch, sheet } = await sheetFor("open");
    await userEvent.click(sheet.getByRole("button", { name: /More options/ }));
    await userEvent.selectOptions(sheet.getByLabelText("Size"), "3");

    expect(
      sheet.getByText(
        "A team can’t enter by itself: who can enter is back to By the organiser.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(sheet.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls(fetch)).toContain("PUT /api/battles/b1"));
    expect(await bodyOf(fetch, "PUT /api/battles/b1")).toMatchObject({
      team_size: 3,
      registration: "organizer",
    });
  });

  it("goes back to the organiser when an open battle becomes a team", async () => {
    const { fetch, sheet } = await sheetFor("open");
    await userEvent.click(sheet.getByRole("button", { name: "2v2" }));

    expect(
      await screen.findByText(
        "A team can’t enter by itself: who can enter is back to By the organiser.",
      ),
    ).toBeInTheDocument();
    expect(
      sheet.getByRole("radio", { name: /By the organiser/ }),
    ).toBeChecked();
    await userEvent.click(sheet.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls(fetch)).toContain("PUT /api/battles/b1"));
    expect(await bodyOf(fetch, "PUT /api/battles/b1")).toMatchObject({
      team_size: 2,
      registration: "organizer",
    });
  });
});
