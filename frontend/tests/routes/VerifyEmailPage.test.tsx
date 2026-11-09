import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LOGGED_OUT, bodyOf, calls, mockApi, renderApp } from "../support/app";

describe("VerifyEmailPage", () => {
  afterEach(() => vi.useRealTimers());

  it("says a wrong or expired code in the site's words", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/email/verify": {
        status: 422,
        body: {
          error: {
            code: "validation",
            message: "validation failed",
            fields: [{ field: "code", message: "wrong or expired code" }],
          },
        },
      },
    });
    renderApp("/verify-email");
    const main = within(await screen.findByRole("main"));

    // Opened without the sign-up's state, the page asks for the address too.
    expect(
      main.getByText("Enter your email and the 6-digit code we sent to it."),
    ).toBeInTheDocument();
    await userEvent.type(main.getByLabelText("Email"), "lilg@example.com");
    await userEvent.type(main.getByLabelText("Code"), "000000");
    await userEvent.click(main.getByRole("button", { name: "Confirm" }));

    expect(
      await main.findByText(
        "This code is wrong or has expired. Check it, or send a new one.",
      ),
    ).toBeInTheDocument();
  });

  it("checks the code is 6 digits before asking the API", async () => {
    const fetch = mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/verify-email");
    const main = within(await screen.findByRole("main"));

    await userEvent.type(main.getByLabelText("Email"), "lilg@example.com");
    await userEvent.type(main.getByLabelText("Code"), "12a4");
    await userEvent.click(main.getByRole("button", { name: "Confirm" }));

    expect(
      await main.findByText("Enter the 6 digits from the email."),
    ).toBeInTheDocument();
    expect(calls(fetch)).not.toContain("POST /api/auth/email/verify");
  });

  it("sends a new code at once when none just went out, then waits the API's minute", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetch = mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/email/resend": { status: 204 },
    });
    // Opened directly (a bookmark, a new tab): the last code may be long expired.
    renderApp("/verify-email");
    const main = within(await screen.findByRole("main"));
    await userEvent.type(main.getByLabelText("Email"), "lilg@example.com");

    await userEvent.click(
      main.getByRole("button", { name: "Send a new code" }),
    );

    expect(
      await main.findByText("A new code is on its way."),
    ).toBeInTheDocument();
    expect(await bodyOf(fetch, "POST /api/auth/email/resend")).toEqual({
      email: "lilg@example.com",
      language: "en",
    });
    // The next one waits a minute.
    expect(
      main.getByRole("button", { name: /^Send a new code in \d+ s$/ }),
    ).toBeDisabled();
    act(() => vi.advanceTimersByTime(60_000));
    expect(
      await main.findByRole("button", { name: "Send a new code" }),
    ).toBeEnabled();
  });

  it("drops a failed resend's error once a resend goes through", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/email/resend": (n) =>
        n === 0 ? { status: 500 } : { status: 204 },
    });
    renderApp("/verify-email");
    const main = within(await screen.findByRole("main"));
    await userEvent.type(main.getByLabelText("Email"), "lilg@example.com");
    act(() => vi.advanceTimersByTime(60_000));
    const resend = await main.findByRole("button", { name: "Send a new code" });

    await userEvent.click(resend);
    expect(await main.findByRole("alert")).toHaveTextContent(
      "Something went wrong",
    );
    await userEvent.click(resend);

    expect(
      await main.findByText("A new code is on its way."),
    ).toBeInTheDocument();
    expect(main.queryByRole("alert")).not.toBeInTheDocument();
  });
});
