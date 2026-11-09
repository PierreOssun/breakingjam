# Reaching organisers (M30)

Decided with the author on 2026-11-09, before the first production release.

- **The publish checklist wants a way to reach the organiser:** an Instagram link or a contact email, the jam's existing fields, shown on its page. `submit` and `publish` refuse without one (422 `contact`), so the team can reach whoever registered a jam before approving it. In review, a save may swap it but not drop it (422 `contact`), as approval checks it again; a live jam may drop it later, and the team's own jams never had one. A refused approval says what is missing ("Not ready to publish: Instagram or contact email.").
- **The review queue shows the organiser's login email** (`organizer_email`), confirmed since M27, for the team only and never on a public page.
- **"You’re the organiser? Contact us"** on every jam the team added (owned by a `seed_admin` or `admin` account, the imported past editions among them), in place of the organiser card: an email to the team with the jam's name in the subject. Handing a jam over stays a manual change of `organizer_id` for now.

Docs: ARCHITECTURE.md (jam editor, transitions, `GET /admin/events`), DESIGN.md (publish checklist; jam page §6 item 12).
