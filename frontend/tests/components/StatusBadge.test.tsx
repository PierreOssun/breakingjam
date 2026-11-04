import { render, screen } from "@testing-library/react";
import { CardStatus, StatusBadge } from "../../src/components/StatusBadge";

describe("the status on a card", () => {
  it("says Live now while the jam runs", () => {
    render(<CardStatus jam={{ status: "published", phase: "live" }} />);
    expect(screen.getByText("Live now")).toBeInTheDocument();
  });

  it("shows registration closed only before the jam", () => {
    const { rerender } = render(
      <CardStatus jam={{ status: "registration_closed", phase: "upcoming" }} />,
    );
    expect(screen.getByText("Registration closed")).toBeInTheDocument();
    rerender(
      <CardStatus jam={{ status: "registration_closed", phase: "past" }} />,
    );
    expect(screen.queryByText("Registration closed")).toBeNull();
  });

  it("always shows a cancelled jam, and nothing for an announced one", () => {
    const { container, rerender } = render(
      <CardStatus jam={{ status: "cancelled", phase: "past" }} />,
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    rerender(<CardStatus jam={{ status: "published", phase: "upcoming" }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the status badge", () => {
  it("calls a public jam whose days are over Past, whatever its status", () => {
    for (const status of ["published", "registration_closed"] as const) {
      const { unmount } = render(
        <StatusBadge jam={{ status, phase: "past" }} />,
      );
      expect(screen.getByText("Past")).toBeInTheDocument();
      unmount();
    }
    render(<StatusBadge jam={{ status: "draft", phase: "past" }} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });
});
