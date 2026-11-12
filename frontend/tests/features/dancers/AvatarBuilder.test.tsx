import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import presets from "../../../../milestones/avatar-rework/fighter-presets.json";
import {
  AVATAR_OPTIONS,
  avatarSpec,
} from "../../../src/features/dancers/avatar";
import { seededAvatar } from "../../../src/features/dancers/avatarSeed";
import { FIGHTERS } from "../../../src/features/dancers/fighters";
import { LIL_G, bodyOf, calls, mockApi, renderApp } from "../../support/app";

const at = "2026-10-01T10:00:00Z";
const ID = "01920000-0000-7000-8000-0000000000d1";
const DANCER = {
  id: ID,
  dancer_name: "Ventus",
  aliases: ["Vent"],
  country: "FR",
  country2: null,
  city: "Paris",
  bio: null,
  instagram_handle: "ventus_bj",
  instagram_hidden: false,
  source: "organizer",
  verified_at: at,
  avatar_url: null,
  avatar: null,
  merged_into_id: null,
  created_at: at,
  updated_at: at,
  crews: [{ id: "01920000-0000-7000-8000-0000000000c1", name: "Dynamo" }],
  titles: ["bboy"],
  can_edit: true,
  can_set_titles: true,
};
const PUT = `PUT /api/dancers/${ID}/avatar`;
const PUT_PROFILE = `PUT /api/dancers/${ID}`;
const SEED = seededAvatar(ID);
const VOLT = FIGHTERS[1]!.avatar;

/** The dancer page with the builder open, as someone who may edit it. */
async function openBuilder(put: object = { status: 200, body: DANCER }) {
  const fetch = mockApi({
    "GET /api/auth/me": { status: 200, body: LIL_G },
    [`GET /api/dancers/${ID}`]: { status: 200, body: DANCER },
    [`GET /api/dancers/${ID}/events`]: {
      status: 200,
      body: { live: [], upcoming: [], past: [] },
    },
    [PUT]: put as never,
    [PUT_PROFILE]: { status: 200, body: DANCER },
  });
  renderApp(`/dancers/${ID}`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Edit profile" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Change avatar" }),
  );
  // The seed never draws a headband, so the name tells the two dialogs apart.
  const builder = within(screen.getByRole("dialog", { name: "Avatar" }));
  return { fetch, builder };
}

const tab = (builder: ReturnType<typeof within>, name: string) =>
  userEvent.click(builder.getByRole("tab", { name }));
const done = (builder: ReturnType<typeof within>) =>
  userEvent.click(builder.getByRole("button", { name: "Done" }));

describe("the starter fighters", () => {
  it("are the twelve of the brief, slot for slot", () => {
    expect(FIGHTERS).toEqual(
      presets.map(({ name, avatar }) => ({
        name,
        avatar: avatarSpec(avatar as object),
      })),
    );
  });
});

describe("the avatar builder", () => {
  it("shows a picked option on the preview and as selected", async () => {
    const { builder } = await openBuilder();
    expect(
      builder.getByRole("img", { name: /^Pixel avatar: / }),
    ).toBeInTheDocument();
    // The fighter-select plate: the name, what they do and their first crew.
    expect(builder.getByText("Ventus")).toBeInTheDocument();
    expect(builder.getByText("Bboy · Dynamo")).toBeInTheDocument();

    await tab(builder, "Hair");
    await userEvent.click(builder.getByRole("radio", { name: "Mohawk" }));
    await userEvent.click(builder.getByRole("radio", { name: "Pink" }));
    await tab(builder, "Outfit");
    await userEvent.click(builder.getByRole("radio", { name: "Tank top" }));

    expect(builder.getByRole("radio", { name: "Tank top" })).toBeChecked();
    expect(builder.getByRole("radio", { name: "Hoodie" })).not.toBeChecked();
    expect(
      builder.getByRole("img", {
        name: /^Pixel avatar: mohawk, pink, (.+, )?tank top$/,
      }),
    ).toBeInTheDocument();
  });

  it("moves between its tabs with the arrow keys", async () => {
    const { builder } = await openBuilder();
    const fighters = builder.getByRole("tab", { name: "Fighters" });
    expect(fighters).toHaveAttribute("aria-selected", "true");
    fighters.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    const head = builder.getByRole("tab", { name: "Head" });
    expect(head).toHaveFocus();
    expect(head).toHaveAttribute("aria-selected", "true");
    expect(
      builder.getByRole("radiogroup", { name: "Headgear" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    expect(builder.getByRole("tab", { name: "Stage" })).toHaveFocus();
  });

  it("applies every slot of a fighter, saves it by itself and shows it on the page", async () => {
    const { fetch, builder } = await openBuilder({
      status: 200,
      body: { ...DANCER, avatar: VOLT },
    });
    await userEvent.click(builder.getByRole("radio", { name: "Volt" }));
    await done(builder);

    expect(await screen.findByText("Avatar saved.")).toBeInTheDocument();
    // The avatar alone: the profile is not sent back around it.
    expect(await bodyOf(fetch, PUT)).toEqual({ avatar: VOLT });
    // Edit profile is still open behind, with the new avatar; so is the account menu's.
    expect(screen.queryByRole("dialog", { name: "Avatar" })).toBeNull();
    expect(
      screen.getByRole("dialog", { name: "Edit profile" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(calls(fetch).filter((c) => c === "GET /api/auth/me")).toHaveLength(
        2,
      ),
    );
    // Saving the profile afterwards names no avatar: the API keeps the stored one.
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () =>
      expect(await bodyOf(fetch, PUT_PROFILE)).not.toHaveProperty("avatar"),
    );
  });

  it("undoes one step at a time, up to twenty", async () => {
    const { fetch, builder } = await openBuilder();
    const undo = builder.getByRole("button", { name: "Undo" });
    expect(undo).toBeDisabled();

    await userEvent.click(builder.getByRole("radio", { name: "Volt" }));
    await tab(builder, "Face");
    await userEvent.click(builder.getByRole("radio", { name: "Mask" }));
    await userEvent.click(undo);
    expect(builder.getByRole("radio", { name: "Plaster" })).toBeChecked();
    // Back before the fighter: the avatar the dancer came in with.
    await userEvent.click(undo);
    expect(undo).toBeDisabled();

    // Twenty-two changes, then Undo as far as it goes: the first two are out of reach.
    const lashes = builder.getByRole("checkbox", { name: "Lash flicks" });
    await userEvent.click(builder.getByRole("radio", { name: "Scar" }));
    await userEvent.click(builder.getByRole("radio", { name: "Grin" }));
    for (let i = 0; i < 20; i++) await userEvent.click(lashes);
    for (let i = 0; i < 20; i++) await userEvent.click(undo);
    expect(undo).toBeDisabled();
    await done(builder);
    await waitFor(async () =>
      expect((await bodyOf(fetch, PUT)).avatar).toEqual({
        ...SEED,
        face: "scar",
        mouth: "grin",
      }),
    );
  });

  it("surprises with a valid avatar every time", async () => {
    const { fetch } = await openBuilder();
    const options: Record<string, readonly string[]> = AVATAR_OPTIONS;
    for (let n = 1; n <= 12; n++) {
      const builder = within(screen.getByRole("dialog", { name: "Avatar" }));
      await userEvent.click(
        builder.getByRole("button", { name: "Surprise me" }),
      );
      await done(builder);
      await waitFor(() =>
        expect(calls(fetch).filter((c) => c === PUT)).toHaveLength(n),
      );
      const { avatar } = await bodyOf(fetch, PUT);
      expect(Object.keys(avatar).sort()).toEqual(Object.keys(SEED).sort());
      for (const [slot, value] of Object.entries(avatar)) {
        if (slot in options) expect(options[slot]).toContain(value);
        else expect(typeof value).toBe("boolean");
      }
      await userEvent.click(
        await screen.findByRole("button", { name: "Change avatar" }),
      );
    }
  });

  it("asks before discarding unsaved changes, in the dialog itself", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const { fetch, builder } = await openBuilder();
    // Nothing changed: it just closes.
    await userEvent.click(builder.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Avatar" })).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "Change avatar" }),
    );
    const again = within(screen.getByRole("dialog", { name: "Avatar" }));
    await userEvent.click(again.getByRole("radio", { name: "Rook" }));
    await userEvent.click(again.getByRole("button", { name: "Close" }));
    expect(again.getByRole("alert")).toHaveTextContent("Discard your changes?");
    await userEvent.click(again.getByRole("button", { name: "Keep editing" }));
    expect(again.queryByRole("alert")).toBeNull();
    expect(again.getByRole("radio", { name: "Rook" })).toBeChecked();

    await userEvent.click(again.getByRole("button", { name: "Close" }));
    await userEvent.click(again.getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("dialog", { name: "Avatar" })).toBeNull();
    expect(calls(fetch)).not.toContain(PUT);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("shares one accent between the Head and Outfit tabs", async () => {
    const { builder } = await openBuilder();
    await tab(builder, "Head");
    const colour = (group: string, name: string) =>
      within(builder.getByRole("radiogroup", { name: group })).getByRole(
        "radio",
        { name },
      );
    await userEvent.click(colour("Colour", "Violet"));
    await tab(builder, "Outfit");
    expect(colour("Trim colour", "Violet")).toBeChecked();
    await userEvent.click(colour("Trim colour", "Red"));
    await tab(builder, "Head");
    expect(colour("Colour", "Red")).toBeChecked();
  });

  it("stays open and says so when the save fails", async () => {
    const { builder } = await openBuilder({ status: 500, body: {} });
    await userEvent.click(builder.getByRole("radio", { name: "Koko" }));
    await done(builder);
    expect(await builder.findByRole("alert")).toHaveTextContent(
      "The avatar wasn’t saved. Try again.",
    );
    expect(builder.getByRole("radio", { name: "Koko" })).toBeChecked();
  });
});
