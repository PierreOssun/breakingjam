import { screen } from "@testing-library/react";
import i18n from "../../src/i18n";
import { LOGGED_OUT, mockApi, renderApp } from "../support/app";

const visit = () => {
  mockApi({ "GET /api/auth/me": LOGGED_OUT });
  return renderApp("/privacy");
};

afterEach(() => {
  document.head.querySelector('meta[name="description"]')?.remove();
});

describe("PrivacyPage", () => {
  it("says what is kept, about whom, and how to have it removed", async () => {
    visit();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Privacy" }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Privacy · BreakingJam");
    for (const name of [
      "Who runs the site",
      "Your account",
      "Dancer pages and results",
      "Services we rely on",
      "How long, and your rights",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    // A page about someone who never signed up: they must find how to get it changed.
    expect(
      screen.getByText(/a page about you that you did not make/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "breakingjamtv@gmail.com" }),
    ).toHaveAttribute("href", "mailto:breakingjamtv@gmail.com");
    // The footer links here from every content page.
    expect(screen.getAllByRole("link", { name: "Privacy" })[0]).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  it("is written in the site's language", async () => {
    await i18n.changeLanguage("de");
    visit();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Datenschutz" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Dein Konto" }),
    ).toBeVisible();
  });
});
