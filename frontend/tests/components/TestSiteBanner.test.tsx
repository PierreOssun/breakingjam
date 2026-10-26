import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestSiteBanner } from "../../src/components/TestSiteBanner";

/** A page as UAT's Worker serves it, with the test-site marker in its head. */
function markAsTestSite() {
  const marker = document.createElement("meta");
  marker.name = "test-site";
  marker.content = "true";
  document.head.append(marker);
}

afterEach(() => {
  document.head.querySelector('meta[name="test-site"]')?.remove();
});

describe("TestSiteBanner", () => {
  it("shows nothing on production, which has no marker", () => {
    render(<TestSiteBanner />);

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("says the site is a test until closed, then stays closed in this browser", async () => {
    markAsTestSite();
    const { unmount } = render(<TestSiteBanner />);

    expect(screen.getByRole("note")).toHaveTextContent(
      "Test site — demo data, not real jams",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Close the test-site notice" }),
    );
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    unmount();
    render(<TestSiteBanner />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});
