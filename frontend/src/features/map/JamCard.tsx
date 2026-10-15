import { ArrowRight, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { buttonClasses } from "../../components/buttonClasses";
import { Flag } from "../../components/Flag";
import { ShareButton } from "../../components/ShareButton";
import { StatusBadge } from "../../components/StatusBadge";
import { formatShortDateRange, localeOf } from "../../lib/dates";
import { JamFlyer } from "../jams/JamFlyer";
import type { MapJam } from "./jams";

type JamCardProps = {
  jam: MapJam;
  onClose: () => void;
};

/** The anchored popup above the selected marker, ≥ lg (DESIGN.md §4.4). */
export function JamPopup({ jam, onClose }: JamCardProps) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section
      role="dialog"
      aria-labelledby={titleId}
      className="relative flex w-[320px] flex-col gap-3 rounded-lg border border-border-strong bg-surface-raised p-4 shadow-lg"
    >
      <CloseButton onClose={onClose} />
      <Summary jam={jam} titleId={titleId} distance={null} />
      <Link
        to={`/jams/${jam.slug}`}
        className={`${buttonClasses("primary", "sm")} w-full`}
      >
        {t("map.viewJam")}
        <ArrowRight size={16} weight="bold" aria-hidden />
      </Link>
      {/* The 10px caret: a border-coloured triangle under a fill-coloured one. */}
      <span
        aria-hidden
        className="absolute top-full left-1/2 h-2.5 w-5 -translate-x-1/2 bg-border-strong [clip-path:polygon(0_0,100%_0,50%_100%)]"
      />
      <span
        aria-hidden
        className="absolute top-full left-1/2 -mt-px h-[9px] w-[18px] -translate-x-1/2 bg-surface-raised [clip-path:polygon(0_0,100%_0,50%_100%)]"
      />
    </section>
  );
}

/** The bottom sheet for the selected jam, < lg, with its distance once known (§4.4). */
export function JamSheet({
  jam,
  onClose,
  distance,
}: JamCardProps & { distance: number | null }) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section
      role="dialog"
      aria-labelledby={titleId}
      className="relative flex max-h-[50dvh] flex-col gap-3 overflow-y-auto rounded-t-xl border-t border-border-strong bg-surface-raised px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] shadow-lg"
    >
      <span
        aria-hidden
        className="mx-auto h-1 w-9 shrink-0 rounded-full bg-border-strong"
      />
      <CloseButton onClose={onClose} />
      <Summary jam={jam} titleId={titleId} distance={distance} />
      <div className="flex items-center gap-3">
        <Link
          to={`/jams/${jam.slug}`}
          className={`${buttonClasses("primary", "md")} flex-1`}
        >
          {t("map.viewJam")}
          <ArrowRight size={20} weight="bold" aria-hidden />
        </Link>
        <ShareButton
          title={jam.name}
          url={`${window.location.origin}/jams/${jam.slug}`}
          iconOnly
        />
      </div>
    </section>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("map.close")}
      onClick={onClose}
      className="absolute top-1 right-1"
    >
      <X size={20} weight="bold" aria-hidden />
    </Button>
  );
}

function formatDistance(km: number, language: string): string {
  return new Intl.NumberFormat(localeOf(language), {
    style: "unit",
    unit: "kilometer",
    maximumFractionDigits: km < 10 ? 1 : 0,
  }).format(km);
}

/** Flyer, date, title, city, status and battles: what popup and sheet share. */
function Summary({
  jam,
  titleId,
  distance,
}: {
  jam: MapJam;
  titleId: string;
  distance: number | null;
}) {
  const { i18n } = useTranslation();
  const title = useRef<HTMLHeadingElement>(null);
  // §4.4: on open, focus moves to the title.
  useEffect(() => title.current?.focus(), [jam.id]);
  return (
    <>
      <div className="flex gap-3 pr-8">
        <JamFlyer
          jam={jam}
          compact
          className="w-[72px] shrink-0 self-start rounded-md"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-label text-primary-text uppercase">
            {formatShortDateRange(jam.starts_on, jam.ends_on, i18n.language)}
          </p>
          <h2
            id={titleId}
            ref={title}
            tabIndex={-1}
            // A focus target for screen readers, not a control: no ring (§8 rings controls).
            className="line-clamp-2 font-display text-display-sm break-words focus-visible:outline-none"
          >
            {jam.name}
          </h2>
          <p className="flex items-center gap-1.5 text-body-sm text-muted">
            <Flag code={jam.country} size="bare" />
            <span className="truncate">
              {jam.city}
              {distance !== null &&
                ` · ${formatDistance(distance, i18n.language)}`}
            </span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge status={jam.status} />
        {jam.battles.length > 0 && (
          <p className="text-caption text-muted">{jam.battles.join(" · ")}</p>
        )}
      </div>
    </>
  );
}
