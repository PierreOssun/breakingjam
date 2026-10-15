import { MagnifyingGlass } from "@phosphor-icons/react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

type SearchFormProps = {
  value: string;
  onChange: (value: string) => void;
  /** Enter or the keyboard's search key. */
  onSubmit: () => void;
  /** Over the map, with a shadow, rather than in the side panel. */
  floating?: boolean;
};

/** The map's search: the one pill-shaped field (DESIGN.md §4.2). */
export function SearchForm({
  value,
  onChange,
  onSubmit,
  floating = false,
}: SearchFormProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <form
      role="search"
      className="relative min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {t("map.search")}
      </label>
      <MagnifyingGlass
        size={20}
        weight="bold"
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
      />
      <input
        id={id}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("map.searchPlaceholder")}
        className={`h-12 w-full rounded-full border border-border-strong bg-surface pr-4 pl-11 text-body text-text placeholder:text-muted focus-visible:border-text ${floating ? "shadow-sm" : ""}`}
      />
    </form>
  );
}
