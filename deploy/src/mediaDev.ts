// `just media`: the media bucket in development, on http://localhost:8788. The API writes to
// it as it writes to the Worker's handler in production, and the browser reads from it as it
// reads from the bucket's domain. It also takes the API's emails on `/mail` and prints them,
// so the codes show in the `just dev` output. Never deployed.
import { type Mail, sendMail } from "./mail";
import { storeMedia } from "./media";

const print = async ({ to, subject, text }: Mail) =>
  console.log(`\n✉ To: ${to}\n  Subject: ${subject}\n\n${text}`);

export default {
  fetch: (request, env) =>
    new URL(request.url).pathname === "/mail"
      ? sendMail(request, print)
      : storeMedia(request, env.MEDIA),
} satisfies ExportedHandler<{ MEDIA: R2Bucket }>;
