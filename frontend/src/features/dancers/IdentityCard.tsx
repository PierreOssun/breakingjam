import { InstagramLogo } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FlagChip } from "../../components/Flag";
import { VerifiedTick } from "../../components/VerifiedTick";

type IdentityCardProps = {
  name: string;
  verified: boolean;
  /** Country codes; at most two chips show (§4.10). */
  flags: (string | null | undefined)[];
  aliases?: string[];
  instagram?: string | null;
  /** The page's own path, printed as its canonical URL. */
  path: string;
  avatar: ReactNode;
};

/**
 * The share unit (DESIGN.md §4.17), for dancers and organisers: complete on its own when
 * cropped from a screenshot.
 */
export function IdentityCard(props: IdentityCardProps) {
  const { name, verified, aliases = [], instagram, path, avatar } = props;
  const { t } = useTranslation();
  const flags = props.flags.filter((c): c is string => Boolean(c)).slice(0, 2);

  return (
    <section className="relative flex flex-col gap-3 overflow-hidden rounded-[28px] border border-border bg-surface p-5">
      <div aria-hidden className="rings -top-24 -right-24 size-[300px]" />
      {/* `relative` keeps the content painted above the absolutely positioned rings. */}
      <div className="relative">{avatar}</div>
      <div className="relative flex flex-wrap items-center gap-2">
        <h1 className="font-display text-display-lg break-words">{name}</h1>
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
      <p className="relative text-caption break-all text-muted">
        {window.location.host}
        {path}
      </p>
    </section>
  );
}
