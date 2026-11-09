import { render, screen } from "@testing-library/react";
import type { Schemas } from "../../../src/api/client";
import { ActionBar } from "../../../src/features/jams/JamActions";

const jam = (status: Schemas["EventStatus"]) =>
  ({
    name: "Paris Cypher",
    slug: "paris-cypher-3f9a1c",
    status,
    phase: "past",
    starts_on: "2029-06-08",
    ends_on: "2029-06-08",
    timezone: "Europe/Paris",
    city: "Paris",
  }) as Schemas["EventResponse"];

describe("the action bar", () => {
  it("holds Share as an icon beside the primary action, which gets the width", () => {
    render(<ActionBar jam={jam("published")} />);
    expect(screen.getByRole("button", { name: "Share" })).toHaveClass(
      "size-12",
    );
    expect(screen.getByRole("link", { name: "See results" })).toHaveClass(
      "flex-1",
    );
  });

  it("isn't there without a primary action: Share alone would repeat the top bar's", () => {
    const { container } = render(<ActionBar jam={jam("cancelled")} />);
    expect(container).toBeEmptyDOMElement();
  });
});
