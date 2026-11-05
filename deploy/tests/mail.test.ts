import { MAIL_HOST, type Mail, sendMail } from "../src/mail";

const MAIL: Mail = {
  to: "lilg@example.com",
  subject: "042917 is your BreakingJam code",
  text: "Welcome to BreakingJam!\n\n042917\n",
};

const post = (body: unknown) =>
  new Request(`http://${MAIL_HOST}`, {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("the mail handler", () => {
  it("sends what the API posts", async () => {
    const sent: Mail[] = [];
    const send = async (mail: Mail) => sent.push(mail);
    expect((await sendMail(post(MAIL), send)).status).toBe(204);
    expect(sent).toEqual([MAIL]);
  });

  it("answers 502 when the service refuses the email", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const refuse = async () => {
      throw new Error("E_SENDER_NOT_VERIFIED");
    };
    expect((await sendMail(post(MAIL), refuse)).status).toBe(502);
  });
});
