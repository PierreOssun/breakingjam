import { screen } from "@testing-library/react";
import { LOGGED_OUT, mockApi, renderApp } from "../support/app";

describe("NotFoundPage", () => {
  it("asks search engines to leave an unknown path out", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/no-such-page");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Page not found · BreakingJam");
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex",
    );
  });
});
