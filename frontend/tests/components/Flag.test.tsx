import { render, screen } from "@testing-library/react";
import { Flag, FlagChip } from "../../src/components/Flag";

describe("Flag", () => {
  it("shows a country's flag named after it", () => {
    render(<Flag code="FR" />);

    expect(screen.getByRole("img", { name: "France" }).tagName).toBe("IMG");
  });

  it("shows a globe, and no code, for an unknown country", () => {
    render(<FlagChip code="ZZ" />);

    expect(screen.getByRole("img", { name: "Unknown Region" }).tagName).toBe(
      "svg",
    );
    expect(screen.queryByText("ZZ")).not.toBeInTheDocument();
  });
});
