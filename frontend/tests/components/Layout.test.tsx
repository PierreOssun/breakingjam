import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LOGGED_OUT, mockApi, renderApp } from "../support/app";

describe("PageLayout", () => {
  it("opens a page reached by a link at its top, and names the log-in page in the tab", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    const scrollTo = vi.spyOn(window, "scrollTo");
    renderApp("/privacy");
    await screen.findByRole("heading", { level: 1, name: "Privacy" });
    // Arriving is not a link followed: the browser keeps its own position.
    expect(scrollTo).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("link", { name: "Team" }));

    await screen.findByRole("heading", { level: 1, name: "The crew" });
    expect(scrollTo).toHaveBeenCalledWith(0, 0);

    await userEvent.click(screen.getAllByRole("link", { name: "Log in" })[0]!);
    await screen.findByRole("heading", { level: 1, name: "Log in" });
    expect(document.title).toBe("Log in · BreakingJam");
  });
});
