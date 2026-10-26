import { CaretDown, Check, Globe } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage } from "../i18n";
import { buttonClasses } from "./buttonClasses";
import { useMenu } from "./useMenu";

/**
 * Globe + code button opening a listbox of languages, each named in its own language
 * (DESIGN.md §4.6). Arrows move, Enter or Space picks, Esc closes.
 */
export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const current =
    LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) ?? LANGUAGES[0];
  const menu = useMenu(LANGUAGES.length, (index) =>
    setLanguage(LANGUAGES[index]?.code ?? current.code),
  );

  return (
    <div ref={menu.rootRef} className="relative">
      <button
        ref={menu.buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menu.id : undefined}
        aria-label={t("nav.language", { name: current.name })}
        onClick={() =>
          menu.toggle(LANGUAGES.findIndex((l) => l.code === current.code))
        }
        className={buttonClasses("ghost", "sm")}
      >
        <Globe size={16} weight="bold" aria-hidden />
        <span>{current.code.toUpperCase()}</span>
        <CaretDown
          size={16}
          weight="bold"
          className="hidden lg:block"
          aria-hidden
        />
      </button>
      {menu.open && (
        <ul
          id={menu.id}
          role="listbox"
          aria-label={t("nav.language", { name: current.name })}
          onKeyDown={menu.onKeyDown}
          onKeyUp={menu.onKeyUp}
          className="absolute top-full right-0 z-50 mt-2 w-[200px] rounded-lg border border-border-strong bg-surface-raised p-1 shadow-lg"
        >
          {LANGUAGES.map((language, index) => {
            const selected = language.code === current.code;
            return (
              <li
                key={language.code}
                ref={(element) => {
                  menu.itemRefs.current[index] = element;
                }}
                role="option"
                lang={language.code}
                aria-selected={selected}
                tabIndex={index === menu.active ? 0 : -1}
                onClick={() => menu.pick(index)}
                className={`flex h-11 cursor-pointer items-center justify-between rounded-md px-3 text-body transition-colors duration-fast ${
                  selected ? "bg-surface font-bold" : "hover:bg-surface"
                }`}
              >
                {language.name}
                {selected && (
                  <Check
                    size={20}
                    weight="bold"
                    className="text-primary-text"
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
