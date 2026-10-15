import { InstagramLogo } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { Schemas } from "../../api/client";
import { FlagChip } from "../../components/Flag";
import { VerifiedTick } from "../../components/VerifiedTick";
import { DancerAvatar } from "./DancerAvatar";

/** The share unit (DESIGN.md §4.17): complete on its own when cropped from a screenshot. */
export function IdentityCard({
  dancer,
}: {
  dancer: Schemas["DancerResponse"];
}) {
  const { t } = useTranslation();
  const flags = [dancer.country, dancer.country2]
    .filter((c): c is string => Boolean(c))
    .slice(0, 2);

  return (
    <section className="relative flex flex-col gap-3 overflow-hidden rounded-[28px] border border-border bg-surface p-5">
      <div aria-hidden className="rings -top-24 -right-24 size-[300px]" />
      {/* `relative` keeps the content painted above the absolutely positioned rings. */}
      <div className="relative">
        <DancerAvatar name={dancer.dancer_name} avatarUrl={dancer.avatar_url} />
      </div>
      <div className="relative flex flex-wrap items-center gap-2">
        <h1 className="font-display text-display-lg break-words">
          {dancer.dancer_name}
        </h1>
        {dancer.verified_at && <VerifiedTick />}
        {flags.map((code) => (
          <FlagChip key={code} code={code} />
        ))}
      </div>
      {dancer.aliases.length > 0 && (
        <p className="relative text-body-sm font-semibold text-muted">
          {t("dancer.aka", { names: dancer.aliases.join(" · ") })}
        </p>
      )}
      {dancer.instagram_handle && (
        <a
          href={`https://instagram.com/${dancer.instagram_handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="relative inline-flex min-h-11 items-center gap-2 self-start text-body font-extrabold text-text"
        >
          <InstagramLogo size={20} weight="bold" aria-hidden />@
          {dancer.instagram_handle}
        </a>
      )}
      <p className="relative text-caption break-all text-muted">
        {window.location.host}/dancers/{dancer.id}
      </p>
    </section>
  );
}
