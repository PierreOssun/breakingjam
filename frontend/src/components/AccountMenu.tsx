import { CaretDown } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
import type { Schemas } from "../api/client";
import { useLogout } from "../features/auth/useLogout";
import { buttonClasses } from "./buttonClasses";
import { useMenu } from "./useMenu";

const item =
  "flex h-11 w-full items-center rounded-md px-3 text-left text-body transition-colors duration-fast hover:bg-surface aria-[current=page]:font-bold aria-[current=page]:text-primary-text";

/** The logged-in user's name opening My jams, Admin (admins) and Log out (DESIGN.md §4.6). */
export function AccountMenu({ me }: { me: Schemas["UserResponse"] }) {
  const { t } = useTranslation();
  // The menu goes away with the session: focus moves to the page, not to <body>.
  const logout = useLogout(() => document.getElementById("main")?.focus());
  const links = [
    { to: "/org/jams", label: t("nav.myJams") },
    ...(me.role === "admin" ? [{ to: "/admin", label: t("nav.admin") }] : []),
  ];
  // Every item is a real link or button: picking one clicks it.
  const menu = useMenu(links.length + 1, (index) =>
    menu.itemRefs.current[index]?.click(),
  );

  return (
    <div ref={menu.rootRef} className="relative">
      <button
        ref={menu.buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menu.id : undefined}
        onClick={() => menu.toggle(0)}
        className={`${buttonClasses("ghost", "sm")} max-w-[200px]`}
      >
        <span className="truncate">{me.display_name}</span>
        <CaretDown size={16} weight="bold" aria-hidden />
      </button>
      {menu.open && (
        <ul
          id={menu.id}
          role="menu"
          aria-label={t("nav.account")}
          onKeyDown={menu.onKeyDown}
          onKeyUp={menu.onKeyUp}
          onClick={() => menu.setOpen(false)}
          className="absolute top-full right-0 z-50 mt-2 w-[200px] rounded-lg border border-border-strong bg-surface-raised p-1 shadow-lg"
        >
          {links.map((link, index) => (
            <li key={link.to} role="none">
              <NavLink
                ref={(element) => {
                  menu.itemRefs.current[index] = element;
                }}
                to={link.to}
                end
                role="menuitem"
                tabIndex={index === menu.active ? 0 : -1}
                className={item}
              >
                {link.label}
              </NavLink>
            </li>
          ))}
          <li role="none">
            <button
              ref={(element) => {
                menu.itemRefs.current[links.length] = element;
              }}
              type="button"
              role="menuitem"
              tabIndex={links.length === menu.active ? 0 : -1}
              onClick={() => logout.mutate()}
              className={item}
            >
              {t("nav.logOut")}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
