import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIL_G, LOGGED_OUT, calls, mockApi, renderApp } from "../support/app";

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

  it("sends a new account home rather than to the jam form", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/register": { status: 201, body: LIL_G },
    });
    const router = renderApp("/register?next=%2Forg%2Fjams%2Fnew");

    await fillAndSubmit();

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(
      screen.queryByRole("heading", { name: "Register a jam" }),
    ).not.toBeInTheDocument();
  });

  it("brings a new account back to any other page it came from", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/register": { status: 201, body: LIL_G },
    });
    const router = renderApp("/register?next=%2Fjams%2Fparis-cypher-3f9a1c");

    await fillAndSubmit();

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/jams/paris-cypher-3f9a1c"),
    );
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
