import { fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "../../src/components/Dialog";

describe("Dialog", () => {
  it("ignores a close event that arrives once it is open again", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Edit" onClose={onClose}>
        body
      </Dialog>,
    );

    // StrictMode closes and reopens on mount; the queued event comes after.
    fireEvent(screen.getByRole("dialog"), new Event("close"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes from its close button", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Edit" onClose={onClose}>
        body
      </Dialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
