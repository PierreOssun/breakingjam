/** The BreakingJam team's address: the Contact page and "You're the organiser?" write to it. */
export const CONTACT_EMAIL = "breakingjamtv@gmail.com";

/** A mailto: link to us, its subject prefilled so the writer carries on after it. */
export const mailtoUs = (subject?: string) =>
  subject
    ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${subject} `)}`
    : `mailto:${CONTACT_EMAIL}`;
