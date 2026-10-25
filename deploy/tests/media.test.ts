import { MEDIA_STORE_HOST, storeMedia } from "../src/media";

/** An in-memory stand-in for the R2 binding, for what `storeMedia` uses. */
function bucket() {
  const objects = new Map<string, { body: ArrayBuffer; headers: Headers }>();
  const binding = {
    put: async (
      key: string,
      body: ArrayBuffer,
      options: { httpMetadata: Headers },
    ) => {
      objects.set(key, { body, headers: new Headers(options.httpMetadata) });
    },
    delete: async (key: string) => {
      objects.delete(key);
    },
    get: async (key: string) => {
      const object = objects.get(key);
      return object
        ? {
            body: object.body,
            writeHttpMetadata: (headers: Headers) =>
              object.headers.forEach((value, name) => headers.set(name, value)),
          }
        : null;
    },
  };
  return { objects, binding: binding as unknown as R2Bucket };
}

const KEY = "flyers/0192-jam/0193-upload.jpg";
const url = (key: string) => `http://${MEDIA_STORE_HOST}/${key}`;

describe("the media store", () => {
  it("keeps what the API puts, with its type and cache policy", async () => {
    const { objects, binding } = bucket();
    const put = new Request(url(KEY), {
      method: "PUT",
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
      },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });
    expect((await storeMedia(put, binding)).status).toBe(204);
    expect([...objects.keys()]).toEqual([KEY]);

    const served = await storeMedia(new Request(url(KEY)), binding);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect(served.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    );
  });

  it("deletes, and answers 404 once gone", async () => {
    const { objects, binding } = bucket();
    const put = new Request(url(KEY), { method: "PUT", body: "x" });
    await storeMedia(put, binding);
    const removed = new Request(url(KEY), { method: "DELETE" });
    expect((await storeMedia(removed, binding)).status).toBe(204);
    expect(objects.size).toBe(0);
    expect((await storeMedia(new Request(url(KEY)), binding)).status).toBe(404);
  });

  it("refuses other methods and the bare host", async () => {
    const { binding } = bucket();
    const post = new Request(url(KEY), { method: "POST", body: "x" });
    expect((await storeMedia(post, binding)).status).toBe(405);
    expect((await storeMedia(new Request(url("")), binding)).status).toBe(404);
  });
});
