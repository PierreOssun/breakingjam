import { embedUrl, youtubeId } from "../../src/lib/youtube";

describe("youtube", () => {
  it("reads ids from the stored link and from short links", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://vimeo.com/123")).toBeNull();
    expect(youtubeId("not a url")).toBeNull();
  });

  it("embeds without cookies and with the offset", () => {
    expect(embedUrl("dQw4w9WgXcQ", 90)).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=90",
    );
    expect(embedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
    );
  });
});
