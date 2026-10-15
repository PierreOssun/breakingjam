import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../router";

/** Renders the real route table at `path`, with a fresh query cache. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** A JSON `body`, or a raw `text` body (e.g. an SVG) with its content `type`. */
type Reply = { status: number; body?: unknown; text?: string; type?: string };

/** Stubs `fetch` with canned replies keyed by `"METHOD /path"`; anything else is a 404. */
export function mockApi(replies: Record<string, Reply>) {
  const fetch = vi.fn(async (request: Request) => {
    const key = `${request.method} ${new URL(request.url).pathname}`;
    const reply = replies[key] ?? {
      status: 404,
      body: { error: { code: "not_found", message: key } },
    };
    if (reply.text !== undefined) {
      return new Response(reply.text, {
        status: reply.status,
        headers: { "content-type": reply.type ?? "text/plain" },
      });
    }
    const body = reply.body === undefined ? null : JSON.stringify(reply.body);
    return new Response(body, {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** The calls `fetch` received, as `"METHOD /path"`. */
export function calls(fetch: ReturnType<typeof mockApi>) {
  return fetch.mock.calls.map(
    ([request]) => `${request.method} ${new URL(request.url).pathname}`,
  );
}

export const LOGGED_OUT = {
  status: 401,
  body: { error: { code: "unauthorized", message: "unauthorized" } },
};

export const LIL_G = {
  id: "01920000-0000-7000-8000-000000000001",
  email: "lilg@example.com",
  display_name: "Lil G",
  role: "user",
};
