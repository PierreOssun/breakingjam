import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { Schemas } from "../../../src/api/client";
import { DancerChip } from "../../../src/features/dancers/DancerChip";

const dancer: Schemas["DancerRef"] = {
  id: "01900000-0000-7000-8000-000000000001",
  dancer_name: "Nova",
  country: "FR",
  country2: null,
  instagram_handle: null,
  avatar_url: null,
  avatar: null,
  deleted: false,
};

function chip(props: Partial<Schemas["DancerRef"]>) {
  render(
    <MemoryRouter>
      <DancerChip dancer={{ ...dancer, ...props }} />
    </MemoryRouter>,
  );
}

describe("DancerChip", () => {
  it("links to the dancer page", () => {
    chip({});
    expect(screen.getByRole("link", { name: "Nova" })).toHaveAttribute(
      "href",
      `/dancers/${dancer.id}`,
    );
  });

  it("names a deleted dancer without linking to the page that is gone", () => {
    chip({ deleted: true });
    expect(screen.getByText("Nova")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
