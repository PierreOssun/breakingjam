import { MapPin } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "../../components/Button";
import { buttonClasses } from "../../components/buttonClasses";

/**
 * No jams in view (DESIGN.md §4.7): zoom out, clear the filters, or register one.
 * `onClear` is set only while filters or a search narrow the map.
 */
export function MapEmpty({ onClear }: { onClear: (() => void) | null }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 px-6 py-12 text-center">
      {/* Record grooves: an inner ring 10px inside the outer one. */}
      <span
        aria-hidden
        className="relative grid size-[72px] place-items-center rounded-full border border-border-strong"
      >
        <span className="absolute inset-2.5 rounded-full border border-border-strong" />
        <MapPin size={28} weight="bold" className="text-muted" />
      </span>
      <h2 className="font-display text-display-sm">{t("map.emptyTitle")}</h2>
      <p className="text-body-sm text-muted">{t("map.emptyBody")}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {onClear && (
          <Button variant="secondary" size="sm" onClick={onClear}>
            {t("map.clearFilters")}
          </Button>
        )}
        <Link to="/org/jams/new" className={buttonClasses("ghost", "sm")}>
          {t("nav.registerJam")}
        </Link>
      </div>
    </div>
  );
}
