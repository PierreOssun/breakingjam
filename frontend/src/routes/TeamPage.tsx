import {
  Code,
  type Icon,
  InstagramLogo,
  Megaphone,
} from "@phosphor-icons/react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { buttonClasses } from "../components/buttonClasses";
import { TEAM, type TeamMember, type TeamRole } from "../content/team";
import { DancerAvatar } from "../features/dancers/DancerAvatar";
import { useDancerByKey } from "../features/dancers/queries";
import { useMetaDescription } from "../lib/useMetaDescription";

// DESIGN.md §6 Team page: each role's chip colour and icon.
const ROLES: Record<TeamRole, { look: string; icon: Icon }> = {
  developer: { look: "bg-primary/12 text-primary-text", icon: Code },
  marketing: { look: "bg-accent/12 text-accent-text", icon: Megaphone },
};

const PILL =
  "inline-flex h-10 items-center gap-2 rounded-full border border-border-strong px-4 text-body-sm font-bold transition-colors duration-fast hover:bg-surface-raised";

/** `/team`: who runs BreakingJam, and an invitation to help (DESIGN.md §6 Team page). */
export function TeamPage() {
  const { t } = useTranslation();
  useMetaDescription(t("team.intro"));
  return (
    <div className="mx-auto flex max-w-content flex-col gap-8 px-4 pt-8 pb-16 md:px-6 lg:px-8 lg:py-20">
      <title>{`${t("pages.team")} · BreakingJam`}</title>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-display-lg lg:text-display-xl">
          {t("team.title")}
        </h1>
        <p className="text-body text-muted">{t("team.intro")}</p>
      </header>
      <ul className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        {TEAM.map((member) => (
          <li key={member.key}>
            <MemberCard member={member} />
          </li>
        ))}
        <li>
          <JoinCard />
        </li>
      </ul>
    </div>
  );
}

/** A person as the dancer identity card draws one (§4.17), with their role and links. */
function MemberCard({ member }: { member: TeamMember }) {
  const { t } = useTranslation();
  const { look, icon: RoleIcon } = ROLES[member.role];
  const nameId = useId();
  const page = useDancerByKey(member.dancerKey).data;
  // A merged page leads to the one it became; its avatar stays the generated one.
  const dancer = page && "id" in page ? page : null;
  const pageId =
    dancer?.id ?? (page && "merged_into" in page ? page.merged_into : null);
  return (
    <article
      aria-labelledby={nameId}
      className="relative flex h-full flex-col gap-3 overflow-hidden rounded-[28px] border border-border bg-surface p-5"
    >
      <div aria-hidden className="rings -top-24 -right-24 size-[300px]" />
      {/* `relative` keeps the content painted above the absolutely positioned rings. */}
      <div className="relative">
        <DancerAvatar
          // Without a page, the pixel bust seeded by their key, the same on every visit.
          dancer={
            dancer ?? { id: `team-${member.key}`, dancer_name: member.name }
          }
          size="card"
        />
      </div>
      <h2
        id={nameId}
        className="relative font-display text-[30px] leading-9 font-extrabold tracking-[-0.02em]"
      >
        {member.name}
      </h2>
      <p
        className={`relative inline-flex h-7 items-center gap-1.5 self-start rounded-full px-3 text-[12px] font-extrabold uppercase ${look}`}
      >
        <RoleIcon size={14} weight="bold" aria-hidden />
        {t(`team.roles.${member.role}`)}
      </p>
      <div className="relative mt-auto flex flex-wrap gap-2 pt-1">
        <a
          href={`https://instagram.com/${member.instagram}`}
          target="_blank"
          rel="noopener noreferrer"
          className={PILL}
        >
          <InstagramLogo size={18} weight="bold" aria-hidden />@
          {member.instagram}
        </a>
        {pageId && (
          <Link to={`/dancers/${pageId}`} className={PILL}>
            {/* §10: the "J" alone at small sizes. */}
            <img src="/favicon.svg" alt="" className="size-[18px]" />
            {t("team.page")}
          </Link>
        )}
      </div>
    </article>
  );
}

/** The last card: we are looking for organisers, and the way to the contact page. */
function JoinCard() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-wrap content-start items-center gap-3 rounded-[28px] border border-dashed border-border-strong p-5">
      <span className="inline-flex h-8 items-center rounded-full border border-border px-3 text-body-sm font-bold">
        {t("team.join.organisers")}
      </span>
      <Link to="/contact" className={buttonClasses("primary", "sm")}>
        {t("team.join.cta")}
      </Link>
    </div>
  );
}
