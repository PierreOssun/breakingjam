// `just media`: the media bucket in development, on http://localhost:8788. The API writes to
// it as it writes to the Worker's handler in production, and the browser reads from it as it
// reads from the bucket's domain. Never deployed.
import { storeMedia } from "./media";

export default {
  fetch: (request, env) => storeMedia(request, env.MEDIA),
} satisfies ExportedHandler<{ MEDIA: R2Bucket }>;
