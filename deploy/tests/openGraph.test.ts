import { escapeHtml, jamDates, openGraphTags } from "../src/openGraph";

const JAM = {
  id: "01920000-0000-7000-8000-00000000e001",
  name: 'Concrete "Cypher" <Vol. 4>',
  slug: "concrete-cypher-vol-4-1a030c",
  city: "Zurich",
  starts_on: "2030-06-08",
  ends_on: "2030-06-08",
};

describe("Open Graph tags", () => {
  it("names the jam with its date and city, lists its battles and shows the share image", () => {
    const tags = openGraphTags(
      JAM,
      ["1v1 Bboy", "2v2"],
      "https://breakingjam.com",
    );
    expect(tags).toMatch(
      /<meta property="og:title" content="Concrete &quot;Cypher&quot; &lt;Vol. 4&gt; · Sat,? 8 Jun · Zurich">/,
    );
    expect(tags).toContain(
      '<meta property="og:description" content="1v1 Bboy · 2v2 on BreakingJam">',
    );
    expect(tags).toContain(
      '<meta property="og:image" content="https://breakingjam.com/api/events/concrete-cypher-vol-4-1a030c/og.png">',
    );
    expect(tags).toContain('<meta property="og:image:width" content="1200">');
    expect(tags).toContain(
      '<meta name="twitter:card" content="summary_large_image">',
    );
    expect(tags).toContain(
      '<link rel="canonical" href="https://breakingjam.com/jams/concrete-cypher-vol-4-1a030c">',
    );
  });

  it("shows the organiser's flyer when there is one, and says what a jam is without battles", () => {
    const card = "https://media.breakingjam.com/flyers/e001/f-card.jpg";
    const tags = openGraphTags(
      { ...JAM, flyer_card_url: card },
      [],
      "https://breakingjam.com",
    );
    expect(tags).toContain(`<meta property="og:image" content="${card}">`);
    expect(tags).toContain('<meta property="og:image:height" content="675">');
    expect(tags).toContain(
      '<meta property="og:description" content="A breaking jam on BreakingJam">',
    );
  });

  it("never lets user text out of an attribute", () => {
    expect(escapeHtml(`"><script>alert('x')</script>`)).toBe(
      "&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;",
    );
    expect(
      openGraphTags({ ...JAM, city: `"><img src=x>` }, [], "https://b.com"),
    ).not.toContain("<img");
  });

  it("reads jam dates as calendar dates, ranges included", () => {
    expect(jamDates("2030-06-08", "2030-06-08")).toMatch(/^Sat,? 8 Jun$/);
    expect(jamDates("2030-06-08", "2030-06-09")).toMatch(
      /^Sat,? 8.+Sun,? 9 Jun$/,
    );
  });
});
