import {
  bannerClosed,
  CLOSE_PATH,
  closeBanner,
  TEST_BANNER,
  withoutRevalidation,
} from "../src/testSite";

const UAT = "https://uat.breakingjam.com";

describe("the test-site banner", () => {
  it("closes with a link, not a script", () => {
    expect(TEST_BANNER).toContain(`href="${CLOSE_PATH}"`);
    expect(TEST_BANNER).not.toContain("<script");
  });

  it("is remembered as closed for a year, then goes back to the page", () => {
    const reply = closeBanner(
      new Request(`${UAT}${CLOSE_PATH}`, {
        headers: { referer: `${UAT}/jams/zurich-jam?ref=x` },
      }),
    );

    expect(reply.status).toBe(303);
    expect(reply.headers.get("location")).toBe("/jams/zurich-jam?ref=x");
    expect(reply.headers.get("set-cookie")).toBe(
      "bj_test_banner=closed; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly; Secure",
    );
  });

  it("never sends anyone off-site", () => {
    const reply = closeBanner(
      new Request(`${UAT}${CLOSE_PATH}`, {
        headers: { referer: "https://evil.example/phish" },
      }),
    );
    expect(reply.headers.get("location")).toBe("/");
    expect(
      closeBanner(new Request(`${UAT}${CLOSE_PATH}`)).headers.get("location"),
    ).toBe("/");
  });

  it("reads the cookie among others", () => {
    const withCookie = (cookie: string) =>
      new Request(UAT, { headers: { cookie } });
    expect(
      bannerClosed(withCookie("bj_session=abc; bj_test_banner=closed")),
    ).toBe(true);
    expect(bannerClosed(withCookie("bj_session=abc"))).toBe(false);
    expect(bannerClosed(new Request(UAT))).toBe(false);
  });

  it("asks for pages in full, so a closed banner can't come back from the cache", () => {
    const conditional = {
      "if-none-match": '"abc"',
      "if-modified-since": "Tue, 20 Oct 2026 10:00:00 GMT",
    };
    const page = withoutRevalidation(
      new Request(UAT, { headers: { accept: "text/html", ...conditional } }),
    );
    expect(page.headers.get("if-none-match")).toBeNull();
    expect(page.headers.get("if-modified-since")).toBeNull();
    // Scripts and styles still revalidate.
    const script = withoutRevalidation(
      new Request(`${UAT}/assets/index.js`, { headers: conditional }),
    );
    expect(script.headers.get("if-none-match")).toBe('"abc"');
  });
});
