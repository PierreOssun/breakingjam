// Outgoing email (ARCHITECTURE §9, M27): the API container posts each email here and the Worker
// sends it with Cloudflare Email Service, so the API holds no mail credentials.

/** Where the API container sends its emails: intercepted by the Worker, never resolved. */
export const MAIL_HOST = "mail.internal";

/** The sender on both targets: breakingjam.com is the one domain onboarded to Email Service. */
export const FROM = { name: "BreakingJam", email: "noreply@breakingjam.com" };

/** What the API posts: one plain-text email. */
export type Mail = { to: string; subject: string; text: string };

/** Delivers one email: the Email Service binding, or the console in development. */
export type Sender = (mail: Mail) => Promise<unknown>;

/** Delivers the email the API posts; 502 when the service refuses it. */
export async function sendMail(
  request: Request,
  send: Sender,
): Promise<Response> {
  try {
    await send(await request.json<Mail>());
  } catch (error) {
    // Unverified sender, quota reached…: the API only logs that the code didn't go out.
    console.error("email not sent", error);
    return new Response(null, { status: 502 });
  }
  return new Response(null, { status: 204 });
}
