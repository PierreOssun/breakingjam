import { InstagramLogo } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FlagChip } from "../../components/Flag";
import { Loading, RowSkeleton, Skeleton } from "../../components/Skeleton";
import { VerifiedTick } from "../../components/VerifiedTick";

type IdentityCardProps = {
  name: string;
  verified: boolean;
  /** Country codes; at most two chips show (§4.10). */
  flags: (string | null | undefined)[];
  aliases?: string[];
  instagram?: string | null;
  avatar: ReactNode;
  /** The name's heading: the page title on the dancer's own page, a sub-head elsewhere. */
  heading?: "h1" | "h3";
};

/**
 * The share unit (DESIGN.md §4.17), for dancers and organisers: complete on its own when
 * cropped from a screenshot.
 */
export function IdentityCard(props: IdentityCardProps) {
  const { name, verified, aliases = [], instagram, avatar } = props;
  const Heading = props.heading ?? "h1";
  const { t } = useTranslation();
  const flags = props.flags.filter((c): c is string => Boolean(c)).slice(0, 2);

  return (
    <section className="relative flex flex-col gap-3 overflow-hidden rounded-[28px] border border-border bg-surface p-5">
      <div aria-hidden className="rings -top-24 -right-24 size-[300px]" />
      {/* `relative` keeps the content painted above the absolutely positioned rings. */}
      <div className="relative">{avatar}</div>
      <div className="relative flex flex-wrap items-center gap-2">
        <Heading className="font-display text-display-lg break-words">
          {name}
        </Heading>
        {verified && <VerifiedTick />}
        {flags.map((code) => (
          <FlagChip key={code} code={code} />
        ))}
      </div>
      {aliases.length > 0 && (
        <p className="relative text-body-sm font-semibold text-muted">
          {t("dancer.aka", { names: aliases.join(" · ") })}
        </p>
      )}
      {instagram && (
        <a
          href={`https://instagram.com/${instagram}`}
          target="_blank"
          rel="noopener noreferrer"
          className="relative inline-flex min-h-11 items-center gap-2 self-start text-body font-extrabold text-text"
        >
          <InstagramLogo size={20} weight="bold" aria-hidden />@{instagram}
        </a>
      )}
    </section>
  );
}

/** A dancer or organiser page while it loads (DESIGN.md §4.29): the card, then jam rows. */
export function ProfileSkeleton() {
  return (
    <Loading className="mx-auto max-w-content px-4 md:px-6 lg:px-8">
      <div className="flex justify-end py-2">
        <Skeleton className="size-11 rounded-full" />
      </div>
      <div className="flex flex-col gap-8 pb-10 lg:grid lg:grid-cols-[340px_1fr] lg:items-start lg:gap-12 lg:pb-20">
        <div className="flex flex-col gap-3 rounded-[28px] border border-border bg-surface p-5">
          <Skeleton className="size-24 rounded-[28px]" />
          <Skeleton className="rounded-md h-9 w-2/3" />
          <Skeleton className="rounded-md h-5 w-1/3" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="rounded-md mb-2 h-7 w-40" />
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      </div>
    </Loading>
  );
}
