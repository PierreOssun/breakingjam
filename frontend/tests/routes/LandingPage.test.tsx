import { screen, within } from "@testing-library/react";
import { LOGGED_OUT, calls, mockApi, renderApp } from "../support/app";

describe("LandingPage", () => {
  it("pitches the map with two actions and fetches no jam data", async () => {
    const fetch = mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/");
    const main = within(await screen.findByRole("main"));

    expect(
      main.getByRole("heading", { level: 1, name: "Every jam. One map." }),
    ).toBeInTheDocument();
    expect(main.getByRole("link", { name: "Find a jam" })).toHaveAttribute(
      "href",
      "/map",
    );
    for (const link of main.getAllByRole("link", { name: "Register a jam" })) {
      expect(link).toHaveAttribute("href", "/org/jams/new");
    }
    expect(main.getByRole("link", { name: "Open the map" })).toHaveAttribute(
      "href",
      "/map",
    );
    expect(
      main.getByRole("heading", { name: "Create your jam" }),
    ).toBeInTheDocument();
    expect(
      main.getByRole("heading", { name: "Publish it" }),
    ).toBeInTheDocument();
    expect(document.title).toBe("BreakingJam");

    // §6: no data fetching on this page; only the header asks who is logged in.
    expect(new Set(calls(fetch))).toEqual(new Set(["GET /api/auth/me"]));
  });
});
