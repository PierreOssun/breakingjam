import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIL_G, LOGGED_OUT, calls, mockApi, renderApp } from "../test/app";

async function fillAndSubmit(email: string, password: string) {
  const main = within(await screen.findByRole("main"));
  await userEvent.type(main.getByLabelText("Email"), email);
  await userEvent.type(main.getByLabelText("Password"), password);
  await userEvent.click(main.getByRole("button", { name: "Log in" }));
}

describe("LoginPage", () => {
  it("validates before calling the API", async () => {
    const fetch = mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/login");
    const main = within(await screen.findByRole("main"));

    await userEvent.click(main.getByRole("button", { name: "Log in" }));

    expect(
      await main.findByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(main.getByText("Required.")).toBeInTheDocument();
    expect(main.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(calls(fetch)).not.toContain("POST /api/auth/login");
  });

  it("logs in and goes to the page that asked for it", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/login": { status: 200, body: LIL_G },
    });
    renderApp("/login?next=%2Forg%2Fjams");

    await fillAndSubmit("lilg@example.com", "correct horse");

    expect(
      await screen.findByRole("heading", { name: "Your jams" }),
    ).toBeInTheDocument();
  });

  it("says when the email or password is wrong", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/login": LOGGED_OUT,
    });
    renderApp("/login");

    await fillAndSubmit("lilg@example.com", "wrong password");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wrong email or password.",
    );
  });

  it("never sends people off-site after login", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/login": { status: 200, body: LIL_G },
    });
    renderApp("/login?next=%2F%2Fevil.com");

    const google = await screen.findByRole("link", {
      name: "Continue with Google",
    });
    expect(google.getAttribute("href")).toMatch(
      /\/api\/auth\/google\?next=%2F$/,
    );

    await fillAndSubmit("lilg@example.com", "correct horse");
    expect(
      await screen.findByRole("heading", { name: "BreakingJam" }),
    ).toBeInTheDocument();
  });

  it("explains a failed Google sign-in", async () => {
    mockApi({ "GET /api/auth/me": LOGGED_OUT });
    renderApp("/login?error=google");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google sign-in didn’t work.",
    );
  });
});
