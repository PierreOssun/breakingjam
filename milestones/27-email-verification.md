# Email verification and password reset (M27)

Until M27, `POST /auth/register` logged in straight away and nothing checked `app_users.email_verified_at`. The only check was in `link_google`, which drops the password of an unverified account to stop someone pre-registering another person's address. There was also no way back from a forgotten password. M27 fixes both with one mechanism: a 6-digit code sent by email. Agreed with the author on 2026-11-05.

## Decisions

- **Hard gate.**
  - Register sends a code and does not log in. The session starts when the code is confirmed (`POST /auth/email/verify`).
  - Logging in to an unconfirmed account with the right password answers 403 `email_unverified` and sends a new code. The frontend then shows the code screen.
  - Google sign-in needs no code: Google already vouches for the address.
- **"Forgot password" uses the same codes.**
  - `forgot` always answers 204. It sends a code to any account, so a Google-only account can add a password this way.
  - `reset` sets the password and marks the email verified, since the code proves who reads the inbox. It also ends every session.
- **Code rules:**
  - 6 digits from the OS's secure generator (through `Uuid::new_v4`, so no new crate);
  - valid for 15 minutes;
  - 5 tries, each counted in the same statement that compares, so parallel guesses can't get around the count;
  - one new code a minute per account and purpose, and at most 10 a day. That is 50 guesses a day at someone's reset code instead of 7,200, and no email flood; a confirmed code resets the count;
  - a new code replaces the previous one.
- **Codes are stored as plain text.** Hashing a million possible values protects nothing.
- **Emails go out in the background**, so a slow mail service never holds a request.
- **Emails are plain text in the site's language** (en, fr, de; French uses *vous* and German *du*, like the site). The code leads the subject so phones can offer to fill it in.
- **Cloudflare Email Service sends them.**
  - The API POSTs `{to, subject, text}` to `mail.internal`. The Worker intercepts it, as it does `media.internal`, and calls the `send_email` binding.
  - The API holds no mail key.
  - Both targets send as `noreply@breakingjam.com`, so only one domain has to be onboarded.
  - The service is in beta and needs Workers Paid, which the site already has.
- **Password pepper.**
  - Argon2id is keyed with `PASSWORD_PEPPER`, a Worker secret, so a database dump alone can't be cracked.
  - The browser still sends the plain password over HTTPS. Hashing in the browser would only make the hash the password.
  - **Hashes made before M27 no longer match**, and there is no fallback. Only UAT has any: its people use "Forgot password", and the seed sets its own accounts' passwords again.
- **A code that confirms an email unlinks an unproved Google account.** If the account was linked to Google before anyone proved the address, `verify` and `reset` drop that link and `verify` ends its sessions: the reverse of `link_google`, so two people never share an account.
- **No grandfathering migration.** Every pre-M27 password needs a reset anyway, and a reset confirms the email.
- **Dev mail.** The `just media` dev worker also takes `/mail` and prints each email, so the code shows in the `just dev` output.

## Steps

1. Schema, API, Worker — done 2026-11-05:
   - migration `20261105000000_email_codes`;
   - `mail.rs` and `db/email_codes.rs`;
   - `api/codes.rs` (`verify`, `resend`, `forgot`, `reset`) and the register and login changes;
   - the pepper in `auth/password.rs` and the seed;
   - `deploy/src/mail.ts` and the wrangler bindings;
   - `openapi.json`, tests, deploy README.
2. Frontend:
   - `/verify-email` (one numeric `one-time-code` field, Resend with a 60 s countdown);
   - `/forgot-password` (email, then code and new password on the same page);
   - register and login lead there, plus "Forgot password?" under the login password;
   - the router, i18n in en/fr/de, DESIGN.md §4.37 "Code entry";
   - the regenerated `schema.d.ts`, and tests.

## Before deploying

- `wrangler secret put PASSWORD_PEPPER` on both targets, and the same UAT value as a GitHub `uat` secret for the seed.
- Onboard `breakingjam.com` in Email Service (deploy/README.md step 13).
- Ship step 2 together with step 1: the current frontend expects register to log in.
