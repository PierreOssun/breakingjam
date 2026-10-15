import { List, X } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { api } from "../api/client";
import { withNext } from "../features/auth/safeNext";
import { ME_KEY, useMe } from "../features/auth/useMe";
import { Button } from "./Button";
import { buttonClasses } from "./buttonClasses";
import { LanguageSwitch } from "./LanguageSwitch";
import { Wordmark } from "./Wordmark";

// Active nav link: a 2px primary-text underline inset at the bottom (DESIGN.md §4.6).
const navLink = `${buttonClasses("ghost", "sm")} relative aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-[18px] aria-[current=page]:after:bottom-1 aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-primary-text`;

const sheetLink =
  "flex h-14 items-center rounded-md px-3 text-title transition-colors duration-fast hover:bg-surface-raised aria-[current=page]:text-primary-text";

/** Site header: wordmark, nav, language, account, and the "Register a jam" call to action. */
export function Header({ sticky = true }: { sticky?: boolean }) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDialogElement>(null);
  const closeMenu = () => menuRef.current?.close();

  return (
    <header
      className={`${sticky ? "sticky top-0" : ""} z-40 h-header border-b border-border bg-bg lg:h-header-lg`}
    >
      <div className="mx-auto flex h-full max-w-content items-center gap-2 px-4 md:px-6 lg:px-8">
        <Wordmark />
        <nav aria-label={t("nav.menu")} className="ml-4 hidden gap-1 lg:flex">
          <NavLink to="/map" className={navLink}>
            {t("nav.findJam")}
          </NavLink>
          <NavLink to="/org/jams" end className={navLink}>
            {t("nav.forOrganisers")}
          </NavLink>
          <AdminLink className={navLink} />
        </nav>
        <div className="flex-1" />
        <LanguageSwitch />
        <div className="hidden items-center gap-2 lg:flex">
          <AccountAction className={buttonClasses("ghost", "sm")} />
          <Link to="/org/jams/new" className={buttonClasses("primary", "sm")}>
            {t("nav.registerJam")}
          </Link>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("nav.openMenu")}
          className="lg:hidden"
          onClick={() => menuRef.current?.showModal()}
        >
          <List size={22} weight="bold" aria-hidden />
        </Button>
      </div>

      {/* Below lg: a full-height sheet; the native dialog traps focus and closes on Esc. */}
      <dialog
        ref={menuRef}
        aria-label={t("nav.menu")}
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-sm border-l border-border-strong bg-bg p-4 text-text shadow-lg backdrop:bg-scrim"
      >
        <div className="flex h-full flex-col gap-2">
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("nav.closeMenu")}
              onClick={closeMenu}
            >
              <X size={22} weight="bold" aria-hidden />
            </Button>
          </div>
          <nav className="flex flex-col">
            <NavLink to="/map" className={sheetLink} onClick={closeMenu}>
              {t("nav.findJam")}
            </NavLink>
            <NavLink
              to="/org/jams"
              end
              className={sheetLink}
              onClick={closeMenu}
            >
              {t("nav.forOrganisers")}
            </NavLink>
            <AdminLink className={sheetLink} onClick={closeMenu} />
            <AccountAction className={sheetLink} onDone={closeMenu} />
          </nav>
          <div className="flex-1" />
          <Link
            to="/org/jams/new"
            className={`${buttonClasses("primary", "lg")} w-full`}
            onClick={closeMenu}
          >
            {t("nav.registerJam")}
          </Link>
        </div>
      </dialog>
    </header>
  );
}

/** The claims queue, for admins only. */
function AdminLink({
  className,
  onClick,
}: {
  className: string;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  if (useMe().data?.role !== "admin") return null;
  return (
    <NavLink to="/admin/claims" className={className} onClick={onClick}>
      {t("nav.claims")}
    </NavLink>
  );
}

/** "Log in" (back to this page afterwards) or "Log out", once the session is known. */
function AccountAction({
  className,
  onDone,
}: {
  className: string;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: async () => {
      // openapi-fetch resolves on 4xx/5xx; only a 2xx means the session is gone.
      const { response } = await api.POST("/api/auth/logout");
      if (!response.ok)
        throw new Error(`POST /api/auth/logout: ${response.status}`);
    },
    onSuccess: () => {
      queryClient.setQueryData(ME_KEY, null);
      onDone?.();
      navigate("/");
    },
  });

  if (me.isPending) return null;
  if (me.data) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => logout.mutate()}
      >
        {t("nav.logOut")}
      </button>
    );
  }
  const here = location.pathname + location.search;
  return (
    <Link to={withNext("/login", here)} className={className} onClick={onDone}>
      {t("nav.logIn")}
    </Link>
  );
}
