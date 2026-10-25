// Uploaded images (ARCHITECTURE §9): the API container writes them through this handler into
// R2, and the bucket's own domain serves them.

/** Where the API container sends its media writes: intercepted by the Worker, never resolved. */
export const MEDIA_STORE_HOST = "media.internal";

/**
 * `PUT` stores the object named by the path with the request's `Content-Type` and
 * `Cache-Control`, which R2 then serves; `DELETE` removes it. `GET` serves it, for
 * development, where no bucket domain exists.
 */
export async function storeMedia(
  request: Request,
  bucket: R2Bucket,
): Promise<Response> {
  const key = new URL(request.url).pathname.slice(1);
  if (!key) return new Response(null, { status: 404 });
  switch (request.method) {
    case "PUT":
      // Buffered: R2 needs a known length, and an image is at most 2 MB.
      await bucket.put(key, await request.arrayBuffer(), {
        httpMetadata: request.headers,
      });
      return new Response(null, { status: 204 });
    case "DELETE":
      await bucket.delete(key);
      return new Response(null, { status: 204 });
    case "GET": {
      const object = await bucket.get(key);
      if (!object) return new Response(null, { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      return new Response(object.body, { headers });
    }
    default:
      return new Response(null, {
        status: 405,
        headers: { allow: "GET, PUT, DELETE" },
      });
  }
}
