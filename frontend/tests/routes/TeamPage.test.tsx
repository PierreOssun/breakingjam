import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LOGGED_OUT, mockApi, renderApp } from "../support/app";

const INTRO = "Two people behind every jam on the map.";
const IKI_ID = "01920000-0000-7000-8000-0000000000a1";

// Iki's page was imported here; Simba's wasn't (production has no curated data yet).
const visit = (path = "/team") => {
  mockApi({
    "GET /api/auth/me": LOGGED_OUT,
    "GET /api/dancers/by-key/iki": {
      status: 200,
      body: {
        id: IKI_ID,
        dancer_name: "Iki",
        avatar_url: "https://media.breakingjam.com/avatars/iki.jpg",
        avatar_parts: null,
      },
    },
    "GET /api/dancers/by-key/simba": {
      status: 404,
      body: { error: { code: "not_found", message: "not found" } },
    },
  });
  return renderApp(path);
};

afterEach(() => {
  document.head.querySelector('meta[name="description"]')?.remove();
});

describe("TeamPage", () => {
  it("shows each person with their role, Instagram and page, then the call to join", async () => {
    const tag = document.createElement("meta");
    tag.name = "description";
    document.head.append(tag);
    visit();

    expect(
      await screen.findByRole("heading", { level: 1, name: "The crew" }),
    ).toBeInTheDocument();
    expect(screen.getByText(INTRO)).toBeInTheDocument();
    expect(document.title).toBe("Team · BreakingJam");
    expect(tag.content).toBe(INTRO);

    const ikiCard = within(screen.getByRole("article", { name: "Iki" }));
    expect(ikiCard.getByRole("heading", { name: "Iki" })).toBeInTheDocument();
    expect(ikiCard.getByText("Developer & comms")).toBeInTheDocument();
    const instagram = ikiCard.getByRole("link", { name: "@pierreossun" });
    expect(instagram).toHaveAttribute(
      "href",
      "https://instagram.com/pierreossun",
    );
    expect(instagram).toHaveAttribute("target", "_blank");
    expect(instagram).toHaveAttribute("rel", "noopener noreferrer");
    // Found by key: their page's avatar and a link to it.
    expect(await ikiCard.findByRole("link", { name: "Page" })).toHaveAttribute(
      "href",
      `/dancers/${IKI_ID}`,
    );
    expect(ikiCard.getByRole("img", { name: "Iki" })).toHaveAttribute(
      "src",
      "https://media.breakingjam.com/avatars/iki.jpg",
    );

    const simbaCard = within(screen.getByRole("article", { name: "Simba" }));
    expect(
      simbaCard.getByRole("heading", { name: "Simba" }),
    ).toBeInTheDocument();
    expect(simbaCard.getByText("Marketing & comms")).toBeInTheDocument();
    // No page here: the generated avatar and no "Page" link.
    expect(simbaCard.getByRole("img", { name: "Simba" })).not.toHaveAttribute(
      "src",
    );
    expect(simbaCard.queryByRole("link", { name: "Page" })).toBeNull();
    expect(
      simbaCard.getByRole("link", { name: "@simba_ossun" }),
    ).toHaveAttribute("href", "https://instagram.com/simba_ossun");

    // The last card: organisers wanted, and the way to the contact page.
    expect(screen.getByText("Organisers")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Get in touch" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Get in touch" }),
    ).toBeInTheDocument();
  });

  it("is linked from the footer and from the bottom of the contact page", async () => {
    visit("/contact");

    await userEvent.click(
      await screen.findByRole("link", { name: "Who's behind BreakingJam?" }),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "The crew" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("contentinfo")).getByRole("link", {
        name: "Team",
      }),
    ).toHaveAttribute("href", "/team");
  });
});
