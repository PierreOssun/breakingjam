import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LIL_G, LOGGED_OUT, bodyOf, mockApi, renderApp } from "../support/app";

describe("ForgotPasswordPage", () => {
  it("words it as a change for an account that is logged in", async () => {
    mockApi({ "GET /api/auth/me": { status: 200, body: LIL_G } });
    renderApp("/forgot-password?next=%2Faccount");
    const main = within(await screen.findByRole("main"));
    expect(
      await main.findByRole("heading", { name: "Change your password" }),
    ).toBeInTheDocument();
    expect(main.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(main.queryByRole("link", { name: "Back to log in" })).toBeNull();
  });

  it("sends a code, then sets the new password with it and logs in", async () => {
    const fetch = mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/password/forgot": { status: 204 },
      "POST /api/auth/password/reset": { status: 200, body: LIL_G },
    });
    const router = renderApp("/forgot-password?next=%2Forg%2Fjams");
    const main = within(await screen.findByRole("main"));

    await userEvent.type(main.getByLabelText("Email"), "lilg@example.com");
    await userEvent.click(main.getByRole("button", { name: "Send the code" }));

    expect(
      await main.findByText(/If lilg@example.com has an account/),
    ).toBeInTheDocument();
    expect(await bodyOf(fetch, "POST /api/auth/password/forgot")).toEqual({
      email: "lilg@example.com",
      language: "en",
    });
    await userEvent.type(main.getByLabelText("Code"), "123456");
    await userEvent.type(main.getByLabelText("New password"), "new horse 2");
    await userEvent.click(
      main.getByRole("button", { name: "Set password and log in" }),
    );

    expect(await bodyOf(fetch, "POST /api/auth/password/reset")).toEqual({
      email: "lilg@example.com",
      code: "123456",
      password: "new horse 2",
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/org/jams"),
    );
  });

  it("puts a refused password under its field", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/password/forgot": { status: 204 },
      "POST /api/auth/password/reset": {
        status: 422,
        body: {
          error: {
            code: "validation",
            message: "validation failed",
            fields: [{ field: "password", message: "too common" }],
          },
        },
      },
    });
    renderApp("/forgot-password");
    const main = within(await screen.findByRole("main"));

    await userEvent.type(main.getByLabelText("Email"), "lilg@example.com");
    await userEvent.click(main.getByRole("button", { name: "Send the code" }));
    await userEvent.type(await main.findByLabelText("Code"), "123456");
    await userEvent.type(main.getByLabelText("New password"), "password");
    await userEvent.click(
      main.getByRole("button", { name: "Set password and log in" }),
    );

    expect(await main.findByText("too common")).toBeInTheDocument();
  });

  it("drops an earlier failure's banner when the next try fails on the code", async () => {
    mockApi({
      "GET /api/auth/me": LOGGED_OUT,
      "POST /api/auth/password/forgot": { status: 204 },
      "POST /api/auth/password/reset": (n) =>
        n === 0
          ? {
              status: 500,
              body: { error: { code: "internal", message: "boom" } },
            }
          : {
              status: 422,
              body: {
                error: {
                  code: "validation",
                  message: "validation failed",
                  fields: [{ field: "code", message: "wrong code" }],
                },
              },
            },
    });
    renderApp("/forgot-password");
    const main = within(await screen.findByRole("main"));
    const submit = () =>
      userEvent.click(
        main.getByRole("button", { name: "Set password and log in" }),
      );

    await userEvent.type(main.getByLabelText("Email"), "lilg@example.com");
    await userEvent.click(main.getByRole("button", { name: "Send the code" }));
    await userEvent.type(await main.findByLabelText("Code"), "123456");
    await userEvent.type(main.getByLabelText("New password"), "new horse 2");
    await submit();
    expect(await main.findByRole("alert")).toHaveTextContent(
      "Something went wrong",
    );
    await submit();

    expect(
      await main.findByText(/This code is wrong or has expired/),
    ).toBeInTheDocument();
    expect(main.queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });
});
