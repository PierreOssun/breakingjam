import { ArrowSquareOut, CalendarPlus, Trophy } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { API_ORIGIN, type Schemas } from "../../api/client";
import { buttonClasses } from "../../components/buttonClasses";
import { ShareButton } from "../../components/ShareButton";
import { actionCaption, primaryAction, shareTitle } from "./jamDetail";

type Jam = Schemas["EventResponse"];

/** The state's primary action (DESIGN.md §4.32): register on the organiser's site, add the jam
 * to a calendar (the API's .ics), or jump to the results. */
function PrimaryButton({ jam, className }: { jam: Jam; className: string }) {
  const { t } = useTranslation();
  const classes = `${buttonClasses("primary", "md")} ${className}`;
  switch (primaryAction(jam)) {
    case "register":
      return (
        <a
          href={jam.registration_url ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className={classes}
        >
          {t("jam.register")}
          <ArrowSquareOut size={20} weight="bold" aria-hidden />
        </a>
      );
    case "calendar":
      return (
        <a
          href={`${API_ORIGIN}/api/events/${encodeURIComponent(jam.slug)}/calendar.ics`}
          className={classes}
        >
          <CalendarPlus size={20} weight="bold" aria-hidden />
          {t("jam.calendar")}
        </a>
      );
    case "results":
      return (
        <a href="#battles" className={classes}>
          <Trophy size={20} weight="bold" aria-hidden />
          {t("jam.results")}
        </a>
      );
    case null:
      return null;
  }
}

/** Phones: Share and the primary action, along the bottom while the jam is on screen (§4.32). */
export function ActionBar({ jam }: { jam: Jam }) {
  const { i18n } = useTranslation();
  return (
    // Sticky, not fixed: it rides along while the jam is on screen and stops before the footer.
    <div className="sticky bottom-0 z-30 mt-10 flex gap-3 border-t border-border bg-bg px-4 pt-3 pb-[max(28px,env(safe-area-inset-bottom))] shadow-lg lg:hidden">
      <ShareButton
        title={shareTitle(jam, i18n.language)}
        look="secondary"
        className="flex-1"
      />
      <PrimaryButton jam={jam} className="flex-[2]" />
    </div>
  );
}

/** Desktop: the same actions under the flyer, with a caption on who can come (§4.32). */
export function ActionCard({ jam }: { jam: Jam }) {
  const { t, i18n } = useTranslation();
  const caption = actionCaption(jam);
  return (
    <div className="hidden flex-col gap-3 rounded-lg border border-border bg-surface p-5 lg:flex">
      <PrimaryButton jam={jam} className="w-full" />
      <ShareButton
        title={shareTitle(jam, i18n.language)}
        look="secondary"
        label={t("jam.shareJam")}
        className="w-full"
      />
      {caption && (
        <p className="text-center text-caption text-muted">
          {t(`jam.caption.${caption}`)}
        </p>
      )}
    </div>
  );
}
