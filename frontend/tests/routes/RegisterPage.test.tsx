import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  LIL_G,
  LOGGED_OUT,
  bodyOf,
  calls,
  mockApi,
  renderApp,
} from "../support/app";

const CODE_SENT = { status: 202, body: { email: "lilg@example.com" } };

/** The code page that follows sign-up: the code typed and confirmed. */
async function confirmCode() {
  const main = within(await screen.findByRole("main"));
  expect(
    await main.findByText(/We sent a 6-digit code to lilg@example.com/),
  ).toBeInTheDocument();
  await userEvent.type(main.getByLabelText("Code"), "123456");
  await userEvent.click(main.getByRole("button", { name: "Confirm" }));
}

async function fillAndSubmit() {
  const main = within(await screen.findByRole("main"));
  await userEvent.type(main.getByLabelText("Display name"), "Lil G");
  await userEvent.type(main.getByLabelText("Email"), "lilg@example.com");
  await userEvent.type(main.getByLabelText("Password"), "correct horse");
  await userEvent.click(main.getByRole("button", { name: "Create account" }));
  return main;
}

describe("RegisterPage", () => {
  it("checks the password length like the API does", async () => {
    const fetch = mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/register");
    const main = within(await screen.findByRole("main"));

    await userEvent.type(main.getByLabelText("Password"), "short");
    await userEvent.tab();

    expect(
      await main.findByText("Use 8 to 128 characters."),
    ).toBeInTheDocument();
    expect(calls(fetch)).not.toContain("POST /api/auth/register");
  });

  it("asks for the mailed code, then welcomes the account and goes on to the jam form", async () => {
    const fetch = mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/register": CODE_SENT,
      "POST /api/auth/email/verify": { status: 200, body: LIL_G },
      "GET /api/dancers": {
        status: 200,
        body: { items: [], next_cursor: null },
      },
    });
    const router = renderApp("/register?next=%2Forg%2Fjams%2Fnew");

    await fillAndSubmit();
    // Not logged in yet: register only mails the code (M27).
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/verify-email"),
    );
    expect(await bodyOf(fetch, "POST /api/auth/register")).toMatchObject({
      email: "lilg@example.com",
      language: "en",
    });
    await confirmCode();

    expect(await bodyOf(fetch, "POST /api/auth/email/verify")).toEqual({
      email: "lilg@example.com",
      code: "123456",
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/welcome"),
    );
    expect(router.state.location.search).toBe("?next=%2Forg%2Fjams%2Fnew");
    await userEvent.click(await screen.findByRole("button", { name: /^Skip/ }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/org/jams/new"),
    );
  });

  it("brings a new account back to any other page it came from", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/register": CODE_SENT,
      "POST /api/auth/email/verify": { status: 200, body: LIL_G },
      "GET /api/dancers": {
        status: 200,
        body: { items: [], next_cursor: null },
      },
    });
    const router = renderApp("/register?next=%2Fjams%2Fparis-cypher-3f9a1c");

    const main = await fillAndSubmit();
    // The code just went out: a new one waits the API's minute.
    expect(
      await main.findByRole("button", { name: /^Send a new code in \d+ s$/ }),
    ).toBeDisabled();
    // Back to log in skips the welcome step: logging in is no sign-up.
    expect(main.getByRole("link", { name: "Back to log in" })).toHaveAttribute(
      "href",
      "/login?next=%2Fjams%2Fparis-cypher-3f9a1c",
    );
    await confirmCode();

    await waitFor(() =>
      expect(router.state.location.search).toBe(
        "?next=%2Fjams%2Fparis-cypher-3f9a1c",
      ),
    );
    expect(router.state.location.pathname).toBe("/welcome");
  });

  it("points a taken email at the login page", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/register": {
        status: 409,
        body: { error: { code: "conflict", message: "already exists" } },
      },
    });
    renderApp("/register");

    const main = await fillAndSubmit();

    expect(
      await main.findByText(
        "This email already has an account. Log in instead.",
      ),
    ).toBeInTheDocument();
  });

  it("shows server-side field errors under their field", async () => {
    const body = {
      error: {
        code: "validation",
        message: "validation failed",
        fields: [{ field: "email", message: "must be a valid email address" }],
      },
    };
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/register": { status: 422, body },
    });
    renderApp("/register");

    const main = await fillAndSubmit();

    expect(
      await main.findByText("must be a valid email address"),
    ).toBeInTheDocument();
  });
});
