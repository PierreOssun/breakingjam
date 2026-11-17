import type { ReactNode } from "react";
import { Link } from "react-router";
import type { OrganiserContact } from "./jamDetail";

/** A link to the organiser (`organiserContact`): our Contact page in the app, an email, or an
 * Instagram DM in a new tab, so the jam page stays where it was. */
export function ContactAnchor({
  contact,
  className,
  children,
}: {
  contact: OrganiserContact;
  className: string;
  children: ReactNode;
}) {
  if (contact.kind === "team")
    return (
      <Link to={contact.href} className={className}>
        {children}
      </Link>
    );
  return (
    <a
      href={contact.href}
      {...(contact.kind === "instagram" && {
        target: "_blank",
        rel: "noopener noreferrer",
      })}
      className={className}
    >
      {children}
    </a>
  );
}
