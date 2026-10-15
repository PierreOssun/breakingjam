import { CaretDown, Check, Globe } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage, type Language } from "../i18n";
import { buttonClasses } from "./buttonClasses";

/**
 * Globe + code button opening a listbox of languages, each named in its own language
 * (DESIGN.md §4.6). Arrows move, Enter or Space picks, Esc closes.
 */
export function LanguageSwitch({
  placement = "down",
}: {
  placement?: "down" | "up";
}) {
  const { t, i18n } = useTranslation();
  const current =
    LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) ?? LANGUAGES[0];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const listId = useId();

  useEffect(() => {
    if (open) optionRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function choose(language: Language) {
    setLanguage(language);
    close();
  }

  function onKeyDown(event: KeyboardEvent) {
    const last = LANGUAGES.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((i) => (i === last ? 0 : i + 1)),
      ArrowUp: () => setActive((i) => (i === 0 ? last : i - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => choose(LANGUAGES[active]?.code ?? current.code),
      " ": () => choose(LANGUAGES[active]?.code ?? current.code),
      Escape: close,
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={t("nav.language", { name: current.name })}
        onClick={() => {
          if (open) return setOpen(false);
          setActive(LANGUAGES.findIndex((l) => l.code === current.code));
          setOpen(true);
        }}
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
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("nav.language", { name: current.name })}
          onKeyDown={onKeyDown}
          className={`absolute right-0 z-50 w-[200px] rounded-lg border border-border-strong bg-surface-raised p-1 shadow-lg ${
            placement === "up" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {LANGUAGES.map((language, index) => {
            const selected = language.code === current.code;
            return (
              <li
                key={language.code}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
                lang={language.code}
                aria-selected={selected}
                tabIndex={index === active ? 0 : -1}
                onClick={() => choose(language.code)}
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
