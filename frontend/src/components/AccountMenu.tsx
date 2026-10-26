import {
  CaretDown,
  CaretRight,
  MagnifyingGlass,
  MapPin,
  Monitor,
  Moon,
  Plus,
  ShieldCheck,
  SignOut,
  Sun,
  Ticket,
  User,
  type Icon,
} from "@phosphor-icons/react";
import { useEffect, useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Schemas } from "../api/client";
import { useAdminStats } from "../features/admin/queries";
import { useLogout } from "../features/auth/useLogout";
import { DancerAvatar } from "../features/dancers/DancerAvatar";
import { useMyDraftCount } from "../features/jams/queries";
import { setTheme, THEMES, useTheme, type Theme } from "../lib/theme";
import { buttonClasses } from "./buttonClasses";
import { useMenu } from "./useMenu";
import { VerifiedTick } from "./VerifiedTick";

type Me = Schemas["UserResponse"];

/** Roving focus: the menu's arrows move between the elements that take these. */
type Roving = { ref: (element: HTMLElement | null) => void; tabIndex: number };

const ITEM =
  "flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left font-bold transition-colors duration-fast hover:bg-surface focus:bg-surface";

const THEME_ICONS: Record<Theme, Icon> = {
  light: Sun,
  dark: Moon,
  auto: Monitor,
};

/**
 * The logged-in account's menu (DESIGN.md §4.6, §4.34): from xl a pill opening a dropdown; below,
 * an avatar button opening a sheet under the header that also holds the nav and "Register a jam".
 */
export function AccountMenu({
  me,
  layout,
}: {
  me: Me;
  layout: "dropdown" | "sheet";
}) {
  const { t } = useTranslation();
  const sheet = layout === "sheet";
  // A plain user has no jam: registering the first one makes the account an organiser.
  const organises = me.role !== "user";
  const admin = me.role === "admin";
  // The arrows' order, top to bottom.
  const keys = [
    "profile",
    ...(sheet ? ["map", "jams", "dancers"] : []),
    ...(organises ? ["myJams"] : []),
    ...(admin ? ["admin"] : []),
    ...THEMES,
    "logOut",
    ...(sheet ? ["register"] : []),
  ];
  // Every item is a real link or button: picking one clicks it.
  const menu = useMenu(keys.length, (index) =>
    menu.itemRefs.current[index]?.click(),
  );
  // The menu goes away with the session: focus moves to the page, not to <body>.
  const logout = useLogout(() => document.getElementById("main")?.focus());
  const item = (key: string): Roving => {
    const index = keys.indexOf(key);
    return {
      ref: (element) => {
        menu.itemRefs.current[index] = element;
      },
      tabIndex: index === menu.active ? 0 : -1,
    };
  };

  const locked = sheet && menu.open;
  useEffect(() => {
    if (!locked) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [locked]);

  const name =
    me.dancer?.dancer_name ||
    me.display_name ||
    (me.email.split("@")[0] ?? me.email);
  return (
    // The sheet spans the header, so only the dropdown anchors to its trigger.
    <div ref={menu.rootRef} className={sheet ? "" : "relative"}>
      <button
        ref={menu.buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menu.id : undefined}
        // The pill's visible name starts its accessible one, for voice control (WCAG 2.5.3).
        aria-label={
          sheet ? t("nav.accountMenu") : t("nav.accountMenuOf", { name })
        }
        onClick={() => menu.toggle(0)}
        className={
          sheet
            ? "grid size-11 shrink-0 place-items-center rounded-[14px]"
            : "flex h-11 items-center gap-2 rounded-full border border-border bg-surface pr-3 pl-1 transition-colors duration-fast hover:bg-surface-raised"
        }
      >
        <Avatar me={me} size={sheet ? "button" : "pill"} />
        {!sheet && (
          <>
            <span className="max-w-[14ch] truncate font-extrabold">{name}</span>
            <CaretDown size={16} weight="bold" aria-hidden />
          </>
        )}
      </button>
      {menu.open && sheet && (
        <div
          aria-hidden
          onClick={() => menu.setOpen(false)}
          className="absolute inset-x-0 top-full h-dvh bg-scrim"
        />
      )}
      {menu.open && (
        <ul
          id={menu.id}
          role="menu"
          aria-label={t("nav.account")}
          onKeyDown={menu.onKeyDown}
          onKeyUp={menu.onKeyUp}
          onClick={() => menu.setOpen(false)}
          className={
            sheet
              ? "absolute inset-x-0 top-full z-50 flex max-h-[calc(100dvh-var(--height-header))] flex-col gap-1 overflow-y-auto rounded-b-[28px] bg-surface-raised p-4 shadow-lg"
              : "absolute top-full right-0 z-50 mt-2 flex w-80 flex-col gap-0.5 rounded-[20px] border border-border-strong bg-surface-raised p-2 shadow-lg"
          }
        >
          <li role="none" className="pb-1">
            {me.dancer ? (
              <Profile dancer={me.dancer} roving={item("profile")} />
            ) : (
              <Unclaimed name={me.display_name} roving={item("profile")} />
            )}
          </li>
          {sheet && (
            <>
              <MenuLink to="/map" icon={MapPin} roving={item("map")}>
                {t("nav.jamMap")}
              </MenuLink>
              <MenuLink to="/jams" icon={MagnifyingGlass} roving={item("jams")}>
                {t("nav.findJam")}
              </MenuLink>
              <MenuLink to="/dancers" icon={User} roving={item("dancers")}>
                {t("nav.findSomeone")}
              </MenuLink>
            </>
          )}
          {organises && (
            <>
              {sheet && <Separator />}
              <MenuLink to="/org/jams" icon={Ticket} roving={item("myJams")}>
                {t("nav.myJams")}
                <DraftsBadge />
              </MenuLink>
              {admin && (
                <MenuLink to="/admin" icon={ShieldCheck} roving={item("admin")}>
                  {t("nav.admin")}
                  <ReviewBadge />
                </MenuLink>
              )}
            </>
          )}
          <Separator />
          <ThemeChoice item={item} />
          <Separator />
          <li role="none">
            <button
              type="button"
              role="menuitem"
              {...item("logOut")}
              onClick={() => logout.mutate()}
              className={`${ITEM} text-muted`}
            >
              <SignOut size={20} weight="bold" aria-hidden />
              {t("nav.logOut")}
            </button>
          </li>
          {sheet && (
            <li role="none" className="pt-2">
              <Link
                to="/org/jams/new"
                role="menuitem"
                {...item("register")}
                className={`${buttonClasses("primary", "lg")} w-full`}
              >
                <Plus size={20} weight="bold" aria-hidden />
                {t("nav.registerJam")}
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** The trigger's picture: the dancer page's avatar, else a generic user. */
function Avatar({ me, size }: { me: Me; size: "pill" | "button" }) {
  if (me.dancer) return <DancerAvatar dancer={me.dancer} size={size} />;
  // DancerAvatar's `pill` and `button` shapes.
  const shape =
    size === "pill" ? "size-9 rounded-[11px]" : "size-10 rounded-[12px]";
  return (
    <span
      className={`${shape} grid shrink-0 place-items-center border border-border bg-surface-raised text-muted`}
    >
      <User size={20} weight="bold" aria-hidden />
    </span>
  );
}

/** The first item: my dancer page. */
function Profile({
  dancer,
  roving,
}: {
  dancer: NonNullable<Me["dancer"]>;
  roving: Roving;
}) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/dancers/${dancer.id}`}
      role="menuitem"
      {...roving}
      className="flex items-center gap-3 rounded-[14px] p-3 transition-colors duration-fast hover:bg-surface focus:bg-surface"
    >
      {/* The name follows: the avatar's own label would repeat it. */}
      <span aria-hidden>
        <DancerAvatar dancer={dancer} size="row" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-display text-display-sm">
            {dancer.dancer_name}
          </span>
          {/* Only an approved claim links a page to an account. */}
          <VerifiedTick />
        </span>
        <span className="text-body-sm text-primary-text">
          {t("account.viewPage")}
        </span>
      </span>
      <CaretRight
        size={20}
        weight="bold"
        aria-hidden
        className="shrink-0 text-muted"
      />
    </Link>
  );
}

/** In place of the dancer page, until one is claimed: the search for it, by the account's name. */
function Unclaimed({ name, roving }: { name: string; roving: Roving }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border-2 border-dashed border-border-strong p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-[14px] border border-border bg-surface text-muted">
          <User size={22} weight="bold" aria-hidden />
        </span>
        <span className="flex flex-col">
          <span id={`${id}-title`} className="font-extrabold">
            {t("account.unclaimedTitle")}
          </span>
          <span id={`${id}-body`} className="text-body-sm text-muted">
            {t("account.unclaimedBody")}
          </span>
        </span>
      </div>
      <Link
        to={`/dancers?q=${encodeURIComponent(name)}`}
        role="menuitem"
        aria-describedby={`${id}-title ${id}-body`}
        {...roving}
        className={`${buttonClasses("secondary", "sm")} w-full`}
      >
        <MagnifyingGlass size={16} weight="bold" aria-hidden />
        {t("account.findPage")}
      </Link>
    </div>
  );
}

function MenuLink({
  to,
  icon: Glyph,
  roving,
  children,
}: {
  to: string;
  icon: Icon;
  roving: Roving;
  children: ReactNode;
}) {
  return (
    <li role="none">
      <Link to={to} role="menuitem" {...roving} className={ITEM}>
        <Glyph size={20} weight="bold" aria-hidden className="shrink-0" />
        {children}
      </Link>
    </li>
  );
}

function Separator() {
  return <li role="separator" className="mx-3 my-1 h-px bg-border" />;
}

/** Light / Dark / Auto as one row of radio items, inside the menu's arrow order. */
function ThemeChoice({ item }: { item: (key: string) => Roving }) {
  const { t } = useTranslation();
  const current = useTheme();
  const id = useId();
  return (
    <li role="none" className="flex flex-col gap-2 py-1">
      <span id={id} className="px-3 text-label text-muted uppercase">
        {t("account.theme")}
      </span>
      {/* A radiogroup can't sit in a menu: a group of menuitemradio reads the same. */}
      <div
        role="group"
        aria-labelledby={id}
        className="flex rounded-full border border-border bg-surface p-1"
      >
        {THEMES.map((theme) => {
          const Glyph = THEME_ICONS[theme];
          const chosen = theme === current;
          return (
            <button
              key={theme}
              type="button"
              role="menuitemradio"
              aria-checked={chosen}
              {...item(theme)}
              onClick={() => setTheme(theme)}
              className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-full border text-body-sm font-bold transition-colors duration-fast ${
                chosen
                  ? "border-border-strong bg-surface-raised text-text"
                  : "border-transparent text-muted hover:text-text"
              }`}
            >
              <Glyph size={16} weight="bold" aria-hidden />
              {t(`account.${theme}`)}
            </button>
          );
        })}
      </div>
    </li>
  );
}

/** "N drafts", muted; nothing at 0. Mounted with the menu, so each opening refreshes it. */
function DraftsBadge() {
  const { t } = useTranslation();
  const drafts = useMyDraftCount().data;
  if (!drafts) return null;
  return <Badge tone="muted">{t("account.drafts", { count: drafts })}</Badge>;
}

/** "N to review" (jams and claims), primary; nothing at 0. */
function ReviewBadge() {
  const { t } = useTranslation();
  const stats = useAdminStats().data;
  const count =
    stats &&
    stats.jams_in_review +
      stats.dancer_claims_pending +
      stats.organizer_claims_pending;
  if (!count) return null;
  return <Badge tone="primary">{t("account.toReview", { count })}</Badge>;
}

function Badge({
  tone,
  children,
}: {
  tone: "muted" | "primary";
  children: ReactNode;
}) {
  const colours =
    tone === "primary"
      ? "bg-primary text-on-primary"
      : "border border-border bg-surface text-muted";
  return (
    <span
      className={`ml-auto inline-flex h-6 shrink-0 items-center rounded-full px-2 text-caption font-extrabold ${colours}`}
    >
      {/* A space keeps the name "My jams 1 draft", not "My jams1 draft". */}{" "}
      {children}
    </span>
  );
}
