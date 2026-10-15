import { escapeHtml, jamDates, openGraphTags } from "../src/openGraph";

const JAM = {
  name: 'Concrete "Cypher" <Vol. 4>',
  slug: "concrete-cypher-vol-4-1a030c",
  city: "Zurich",
  starts_on: "2030-06-08",
  ends_on: "2030-06-08",
};

describe("Open Graph tags", () => {
  it("names the jam, its dates and city, and points at its share image", () => {
    const tags = openGraphTags(JAM, "https://breakingjam.com");
    expect(tags).toContain(
      '<meta property="og:title" content="Concrete &quot;Cypher&quot; &lt;Vol. 4&gt;">',
    );
    expect(tags).toMatch(
      /<meta property="og:description" content="Sat,? 8 June 2030 · Zurich">/,
    );
    expect(tags).toContain(
      '<meta property="og:image" content="https://breakingjam.com/api/events/concrete-cypher-vol-4-1a030c/og.png">',
    );
    expect(tags).toContain(
      '<meta name="twitter:card" content="summary_large_image">',
    );
    expect(tags).toContain(
      '<link rel="canonical" href="https://breakingjam.com/jams/concrete-cypher-vol-4-1a030c">',
    );
  });

  it("never lets user text out of an attribute", () => {
    expect(escapeHtml(`"><script>alert('x')</script>`)).toBe(
      "&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;",
    );
    expect(
      openGraphTags({ ...JAM, city: `"><img src=x>` }, "https://b.com"),
    ).not.toContain("<img");
  });

  it("reads jam dates as calendar dates, ranges included", () => {
    expect(jamDates("2030-06-08", "2030-06-08")).toMatch(/^Sat,? 8 June 2030$/);
    expect(jamDates("2030-06-08", "2030-06-09")).toMatch(
      /^Sat,? 8.+Sun,? 9 June 2030$/,
    );
  });
});
