import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../src/i18n";
import { LOGGED_OUT, mockApi, renderApp } from "../support/app";

const EMAIL = "breakingjamtv@gmail.com";
const INTRO =
  "An idea, a bug, a wrong result, or just hello? Write to us by email or on Instagram.";

const visit = (path = "/contact") => {
  mockApi({ "GET /api/auth/me": LOGGED_OUT });
  return renderApp(path);
};

/** What a mailto: link prefills as its subject. */
const subjectOf = (link: HTMLElement) =>
  new URL(link.getAttribute("href") ?? "").searchParams.get("subject");

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
  document.head.querySelector('meta[name="description"]')?.remove();
});

describe("ContactPage", () => {
  it("shows both ways to reach us, the topics and the closing line", async () => {
    visit();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Get in touch" }),
    ).toBeInTheDocument();
    expect(screen.getByText(INTRO)).toBeInTheDocument();
    expect(document.title).toBe("Contact · BreakingJam");

    // The address stays readable: mailto: does nothing without a mail app.
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Write an email" }),
    ).toHaveAttribute("href", `mailto:${EMAIL}`);

    expect(screen.getByText("@breaking.jam")).toBeInTheDocument();
    const dm = screen.getByRole("link", { name: "Send a DM" });
    expect(dm).toHaveAttribute("href", "https://ig.me/m/breaking.jam");
    expect(dm).toHaveAttribute("target", "_blank");
    expect(dm).toHaveAttribute("rel", "noopener noreferrer");

    const topics = screen.getByRole("region", {
      name: "What you can write about",
    });
    expect(within(topics).getAllByRole("link")).toHaveLength(4);
    expect(screen.getByText("We read every message.")).toBeInTheDocument();
  });

  it("carries the right subject on each topic", async () => {
    visit();

    const subjects = {
      "An idea": "Idea: ",
      "A bug": "Bug: ",
      "Wrong info": "Fix: ",
      "Work together": "Hello: ",
    };
    for (const [title, subject] of Object.entries(subjects)) {
      const link = await screen.findByRole("link", {
        name: new RegExp(`^${title}`),
      });
      expect(link.getAttribute("href")).toMatch(
        new RegExp(`^mailto:${EMAIL}\\?subject=`),
      );
      expect(subjectOf(link)).toBe(subject);
    }
  });

  it("copies the address and says so", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    visit();

    await userEvent.click(await screen.findByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Email copied")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(EMAIL);
  });

  it("says when the browser refuses to copy, rather than doing nothing", async () => {
    visit();

    await userEvent.click(await screen.findByRole("button", { name: "Copy" }));
    expect(
      await screen.findByText("Couldn’t copy. Select the address instead."),
    ).toBeInTheDocument();
  });

  it("speaks the visitor's language, subjects included", async () => {
    await i18n.changeLanguage("fr");
    visit();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Contactez-nous" }),
    ).toBeInTheDocument();
    expect(subjectOf(screen.getByRole("link", { name: /^Une idée/ }))).toBe(
      "Idée : ",
    );
    expect(screen.getByRole("button", { name: "Copier" })).toBeInTheDocument();
  });

  it("takes over the site's description while open, without adding a second one", async () => {
    const tag = document.createElement("meta");
    tag.name = "description";
    tag.content = "The site's description";
    document.head.append(tag);
    const router = visit();

    await screen.findByRole("heading", { name: "Get in touch" });
    await waitFor(() => expect(tag.content).toBe(INTRO));
    expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(
      1,
    );

    await router.navigate("/nowhere");
    await waitFor(() => expect(tag.content).toBe("The site's description"));
  });

  it("is linked from the footer", async () => {
    visit("/nowhere");

    const footer = within(await screen.findByRole("contentinfo"));
    expect(footer.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "/contact",
    );
  });
});
