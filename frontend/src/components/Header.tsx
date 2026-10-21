import { List, Plus, X } from "@phosphor-icons/react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router";
import { withNext } from "../features/auth/safeNext";
import { useLogout } from "../features/auth/useLogout";
import { useMe } from "../features/auth/useMe";
import { AccountMenu } from "./AccountMenu";
import { buttonClasses } from "./buttonClasses";
import { IconButton } from "./IconButton";
import { LanguageSwitch } from "./LanguageSwitch";
import { Wordmark } from "./Wordmark";

// Active nav link: a 2px primary-text underline inset at the bottom (DESIGN.md §4.6).
// The full bar needs xl: from lg, French and German labels or a long name overflow it.
const navLink = `${buttonClasses("ghost", "sm")} relative aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-[18px] aria-[current=page]:after:bottom-1 aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-primary-text`;

const sheetLink =
  "flex h-14 items-center rounded-md px-3 text-title transition-colors duration-fast hover:bg-surface-raised aria-[current=page]:text-primary-text";

/** Site header: wordmark, the three nav links, language, account, and "Register a jam". */
export function Header({ sticky = true }: { sticky?: boolean }) {
  const { t } = useTranslation();
  const me = useMe();
  const menuRef = useRef<HTMLDialogElement>(null);
  const closeMenu = () => menuRef.current?.close();

  return (
    <header
      className={`${sticky ? "sticky top-0" : ""} z-40 h-header border-b border-border bg-bg lg:h-header-lg`}
    >
      <div className="mx-auto flex h-full max-w-content items-center gap-2 px-4 md:px-6 lg:px-8">
        <Wordmark logo="mark" />
        <nav aria-label={t("nav.menu")} className="ml-4 hidden gap-1 xl:flex">
          <NavLinks className={navLink} />
        </nav>
        <div className="flex-1" />
        <LanguageSwitch />
        <div className="hidden items-center gap-2 xl:flex">
          {me.data ? (
            <AccountMenu me={me.data} />
          ) : (
            !me.isPending && (
              <LogIn
                className={`${buttonClasses("ghost", "sm")} text-muted!`}
              />
            )
          )}
          <Link to="/org/jams/new" className={buttonClasses("primary", "sm")}>
            <Plus size={16} weight="bold" aria-hidden />
            {t("nav.registerJam")}
          </Link>
        </div>
        <IconButton
          label={t("nav.openMenu")}
          className="xl:hidden"
          onClick={() => menuRef.current?.showModal()}
        >
          <List size={22} weight="bold" aria-hidden />
        </IconButton>
      </div>

      {/* Below lg: a full-height sheet; the native dialog traps focus and closes on Esc. */}
      <dialog
        ref={menuRef}
        aria-label={t("nav.menu")}
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-sm border-l border-border-strong bg-bg p-4 text-text shadow-lg backdrop:bg-scrim"
      >
        <div className="flex h-full flex-col gap-2">
          <div className="flex justify-end">
            <IconButton label={t("nav.closeMenu")} onClick={closeMenu}>
              <X size={22} weight="bold" aria-hidden />
            </IconButton>
          </div>
          <nav className="flex flex-col">
            <NavLinks className={sheetLink} onClick={closeMenu} />
            <SheetAccount onDone={closeMenu} />
          </nav>
          <div className="flex-1" />
          <Link
            to="/org/jams/new"
            className={`${buttonClasses("primary", "lg")} w-full`}
            onClick={closeMenu}
          >
            <Plus size={20} weight="bold" aria-hidden />
            {t("nav.registerJam")}
          </Link>
        </div>
      </dialog>
    </header>
  );
}

/** Jam map, Find a jam, Find someone. */
function NavLinks({
  className,
  onClick,
}: {
  className: string;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <NavLink to="/map" className={className} onClick={onClick}>
        {t("nav.jamMap")}
      </NavLink>
      <NavLink to="/jams" end className={className} onClick={onClick}>
        {t("nav.findJam")}
      </NavLink>
      <NavLink to="/dancers" end className={className} onClick={onClick}>
        {t("nav.findSomeone")}
      </NavLink>
    </>
  );
}

/** "Log in", back to this page afterwards. */
function LogIn({
  className,
  onClick,
}: {
  className: string;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const here = location.pathname + location.search;
  return (
    <Link to={withNext("/login", here)} className={className} onClick={onClick}>
      {t("nav.logIn")}
    </Link>
  );
}

/** The menu sheet's account part: My jams, Admin, Log out, or Log in once the session is known. */
function SheetAccount({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const me = useMe();
  const logout = useLogout(onDone);
  if (me.isPending) return null;
  if (!me.data) return <LogIn className={sheetLink} onClick={onDone} />;
  return (
    <>
      <NavLink to="/org/jams" end className={sheetLink} onClick={onDone}>
        {t("nav.myJams")}
      </NavLink>
      {me.data.role === "admin" && (
        <NavLink to="/admin" className={sheetLink} onClick={onDone}>
          {t("nav.admin")}
        </NavLink>
      )}
      <button
        type="button"
        className={sheetLink}
        onClick={() => logout.mutate()}
      >
        {t("nav.logOut")}
      </button>
    </>
  );
}
