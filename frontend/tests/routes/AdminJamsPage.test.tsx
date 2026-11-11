import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIL_G, bodyOf, calls, mockApi, renderApp } from "../support/app";

const at = "2026-10-01T10:00:00Z";
const ID = "01920000-0000-7000-8000-00000000e001";
const JAM = {
  id: ID,
  organizer_id: "01920000-0000-7000-8000-0000000000a1",
  name: "Geneva Lakeside Battle",
  slug: "geneva-lakeside-battle-00e001",
  status: "in_review",
  starts_on: "2030-06-01",
  ends_on: "2030-06-01",
  timezone: "Europe/Zurich",
  city: "Geneva",
  country: "CH",
  instagram_url: "https://www.instagram.com/geneva.battle",
  created_at: at,
  updated_at: at,
  can_edit: true,
  organizer: {
    id: "01920000-0000-7000-8000-0000000000a1",
    display_name: "Cypher Collective",
    instagram_handle: "cypher.collective",
    verified: false,
  },
  organizer_email: "crew@cypher.ch",
};

/** The queue holds the jam until the first decision, then is empty. */
function api(replies: Parameters<typeof mockApi>[0]) {
  return mockApi({
    "GET /api/auth/me": { status: 200, body: { ...LIL_G, role: "admin" } },
    "GET /api/admin/events": (n) => ({
      status: 200,
      body: { items: n === 0 ? [JAM] : [], next_cursor: null },
    }),
    "GET /api/admin/events/history": {
      status: 200,
      body: { items: [], next_cursor: null },
    },
    ...replies,
  });
}

describe("AdminJamsPage", () => {
  it("shows who runs each jam and approves it", async () => {
    const fetch = api({
      [`POST /api/admin/events/${ID}/approve`]: {
        status: 200,
        body: { ...JAM, status: "published" },
      },
    });
    renderApp("/admin/jams");

    const jam = await screen.findByRole("link", {
      name: "Geneva Lakeside Battle",
    });
    expect(jam).toHaveAttribute("href", `/jams/${JAM.slug}`);
    expect(
      screen.getByRole("link", { name: "Cypher Collective" }),
    ).toHaveAttribute("href", `/organizers/${JAM.organizer.id}`);
    expect(
      screen.getByRole("link", { name: "@cypher.collective" }),
    ).toHaveAttribute("href", "https://instagram.com/cypher.collective");
    // How the team reaches whoever registered it (M30).
    expect(
      screen.getByRole("link", { name: "crew@cypher.ch" }),
    ).toHaveAttribute("href", "mailto:crew@cypher.ch");

    // Approve asks first: it sits right beside the next jam's.
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    const ask = await screen.findByRole("dialog", {
      name: "Approve Geneva Lakeside Battle?",
    });
    expect(calls(fetch)).not.toContain(`POST /api/admin/events/${ID}/approve`);
    await userEvent.click(within(ask).getByRole("button", { name: "Approve" }));
    expect(
      await screen.findByText("Geneva Lakeside Battle is on the map."),
    ).toBeInTheDocument();
    expect(await screen.findByText("No jams waiting.")).toBeInTheDocument();
    expect(calls(fetch)).toContain(`POST /api/admin/events/${ID}/approve`);
  });

  it("sends a jam back only with a note for its organiser", async () => {
    const fetch = api({
      [`POST /api/admin/events/${ID}/reject`]: {
        status: 200,
        body: { ...JAM, status: "draft", review_note: "Add the venue." },
      },
    });
    renderApp("/admin/jams");

    await userEvent.click(
      await screen.findByRole("button", { name: "Send back" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Send Geneva Lakeside Battle back?",
    });
    const confirm = within(dialog).getByRole("button", { name: "Send back" });
    expect(confirm).toBeDisabled();
    await userEvent.type(
      within(dialog).getByLabelText(/What should the organiser change/),
      "Add the venue.",
    );
    await userEvent.click(confirm);

    expect(
      await screen.findByText(
        "Geneva Lakeside Battle went back to its organiser.",
      ),
    ).toBeInTheDocument();
    expect(await bodyOf(fetch, `POST /api/admin/events/${ID}/reject`)).toEqual({
      note: "Add the venue.",
    });
  });

  it("lists past decisions under the queue, with who decided", async () => {
    api({
      "GET /api/admin/events/history": {
        status: 200,
        body: {
          items: [
            {
              id: "01930000-0000-7000-8000-0000000000d1",
              action: "jam_rejected",
              note: "Add the venue.",
              decided_at: "2026-11-08T18:30:00Z",
              admin_email: "admin@breakingjam.com",
              organizer_email: "crew@cypher.ch",
              jam: { ...JAM, phase: "upcoming" },
            },
          ],
          next_cursor: null,
        },
      },
    });
    renderApp("/admin/jams");

    const history = within(
      await screen.findByRole("region", { name: "History" }),
    );
    expect(
      await history.findByRole("link", { name: "Geneva Lakeside Battle" }),
    ).toHaveAttribute("href", `/jams/${JAM.slug}`);
    expect(history.getByText("Sent back")).toBeInTheDocument();
    expect(history.getByText("Note: Add the venue.")).toBeInTheDocument();
    expect(
      history.getByText(
        /by admin@breakingjam\.com · organiser crew@cypher\.ch/,
      ),
    ).toBeInTheDocument();
  });

  it("says what keeps a jam from going public when approving is refused", async () => {
    api({
      [`POST /api/admin/events/${ID}/approve`]: {
        status: 422,
        body: {
          error: {
            code: "validation",
            message: "validation failed",
            fields: [
              {
                field: "contact",
                message: "add an Instagram link or a contact email",
              },
            ],
          },
        },
      },
    });
    renderApp("/admin/jams");

    await userEvent.click(
      await screen.findByRole("button", { name: "Approve" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Approve",
      }),
    );

    expect(
      await screen.findByText(
        "Not ready to publish: Instagram or contact email.",
      ),
    ).toBeInTheDocument();
  });
});
