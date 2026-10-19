import { Link } from "react-router";
import type { Schemas } from "../../api/client";
import { Flag } from "../../components/Flag";
import { VerifiedTick } from "../../components/VerifiedTick";
import { DancerAvatar } from "./DancerAvatar";

/** A dancer, DJ or MC as a list row (DESIGN.md §4.25): avatar, name, flags and city, crews. */
export function PersonRow({ person }: { person: Schemas["DancerSummary"] }) {
  const place = [person.city, person.crews.map((crew) => crew.name).join(", ")]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      to={`/dancers/${person.id}`}
      className="flex min-h-[76px] items-center gap-3.5 border-b border-border py-3 transition-colors duration-fast hover:bg-surface"
    >
      {/* The name says who it is; the avatar is decoration here. */}
      <span aria-hidden className="inline-flex">
        <DancerAvatar dancer={person} size="row" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-body font-extrabold">
            {person.dancer_name}
          </span>
          {person.verified && <VerifiedTick />}
        </span>
        <span className="flex items-center gap-1.5 text-[13px] leading-[18px] text-muted">
          <Flag code={person.country} size="bare" />
          {person.country2 && <Flag code={person.country2} size="bare" />}
          {place && <span className="truncate">{place}</span>}
        </span>
      </span>
    </Link>
  );
}
