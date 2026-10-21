import { unwrap } from "../../src/api/client";

describe("unwrap", () => {
  it("throws the envelope's message", () => {
    const reply = {
      error: { error: { code: "not_found", message: "no such jam" } },
      response: new Response(null, { status: 404 }),
    };

    expect(() => unwrap(reply, "event")).toThrow("no such jam");
  });

  it("names the call when the body is a proxy's page, not the envelope", () => {
    const reply = {
      error: "<html>Bad gateway</html>" as never,
      response: new Response(null, { status: 502 }),
    };

    expect(() => unwrap(reply, "event")).toThrow("event: 502");
  });
});
