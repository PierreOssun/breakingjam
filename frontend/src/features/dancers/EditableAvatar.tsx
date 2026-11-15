import { CircleNotch, PencilSimple } from "@phosphor-icons/react";
import { lazy, Suspense, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import type { Schemas } from "../../api/client";
import { useMe } from "../auth/useMe";
import { DancerAvatar } from "./DancerAvatar";

// The builder's code loads when someone opens it: visitors, who never do, don't download it.
const AvatarBuilder = lazy(() =>
  import("./AvatarBuilder").then((m) => ({ default: m.AvatarBuilder })),
);

/**
 * The dancer page's avatar (DESIGN.md §4.17): for whoever may edit the page, a button that
 * opens the avatar builder; for everyone else, the avatar alone.
 */
export function EditableAvatar({
  dancer,
}: {
  dancer: Schemas["DancerResponse"];
}) {
  const { t } = useTranslation();
  const me = useMe().data;
  const [building, setBuilding] = useState(false);
  // A transition, so the avatar stays as it is until the builder's code has come.
  const [opening, open] = useTransition();
  const avatar = <DancerAvatar dancer={dancer} />;

  // The same gate as "Edit profile" (DancerActions): a session, and the API's word on this page.
  if (!me || !dancer.can_edit) return avatar;
  return (
    <>
      <button
        type="button"
        aria-label={t("avatar.edit")}
        aria-busy={opening}
        // The page avatar's corners (DancerAvatar): the focus ring follows them, the overlay inherits them.
        className={`group relative block w-fit rounded-[28px] lg:rounded-[32px] ${opening ? "cursor-progress" : "cursor-pointer"}`}
        onClick={() => open(() => setBuilding(true))}
      >
        {avatar}
        {/* `hover:` only matches where a pointer can hover, so touch screens keep the badge alone. */}
        <span
          aria-hidden
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-[inherit] bg-[rgb(11_13_20/0.62)] px-1 text-center text-[13px] leading-4 font-extrabold text-on-primary opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <PencilSimple size={20} weight="bold" />
          {t("avatar.edit")}
        </span>
        <span
          aria-hidden
          className="absolute -right-2 -bottom-2 flex size-9 items-center justify-center rounded-full border-[3px] border-surface bg-primary text-on-primary shadow-sm"
        >
          {/* Touch screens have no cursor to show the wait: the badge spins instead. */}
          {opening ? (
            <CircleNotch
              size={16}
              weight="bold"
              className="motion-safe:animate-spin"
            />
          ) : (
            <PencilSimple size={16} weight="bold" />
          )}
        </span>
      </button>
      <Suspense fallback={null}>
        {building && (
          <AvatarBuilder dancer={dancer} onClose={() => setBuilding(false)} />
        )}
      </Suspense>
    </>
  );
}
