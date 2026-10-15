import { useTranslation } from "react-i18next";
import { CATEGORIES, type Category, type Filters, type When } from "./jams";

const WHEN: When[] = ["weekend", "month"];

type FilterChipsProps = {
  filters: Filters;
  onChange: (filters: Filters) => void;
  /**
   * `panel`: wrapped, in the side panel · `map`: one scrolling row over the map ·
   * `sheet`: wrapped under visible group titles, in the filter sheet.
   */
  variant: "panel" | "map" | "sheet";
};

/** The time and category chips (DESIGN.md §5): one time filter at most, any categories. */
export function FilterChips({ filters, onChange, variant }: FilterChipsProps) {
  const { t } = useTranslation();
  const toggleWhen = (when: When) =>
    onChange({ ...filters, when: filters.when === when ? null : when });
  const toggleCategory = (category: Category) =>
    onChange({
      ...filters,
      categories: filters.categories.includes(category)
        ? filters.categories.filter((c) => c !== category)
        : CATEGORIES.filter(
            (c) => c === category || filters.categories.includes(c),
          ),
    });

  const groups = [
    {
      title: t("map.when"),
      chips: WHEN.map((when) => (
        <Chip
          key={when}
          on={filters.when === when}
          onMap={variant === "map"}
          onClick={() => toggleWhen(when)}
        >
          {t(`map.${when}`)}
        </Chip>
      )),
    },
    {
      title: t("map.battles"),
      chips: CATEGORIES.map((category) => (
        <Chip
          key={category}
          on={filters.categories.includes(category)}
          onMap={variant === "map"}
          onClick={() => toggleCategory(category)}
        >
          {t(`map.categories.${category}`)}
        </Chip>
      )),
    },
  ];

  if (variant === "sheet") {
    return (
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.title} className="flex flex-col gap-2">
            <h3 className="text-label text-text uppercase">{group.title}</h3>
            <div className="flex flex-wrap gap-2">{group.chips}</div>
          </section>
        ))}
      </div>
    );
  }
  return (
    <div
      className={
        variant === "map"
          ? "flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
          : "flex flex-col gap-2"
      }
    >
      {groups.map((group) => (
        <div
          key={group.title}
          role="group"
          aria-label={group.title}
          className={
            variant === "map" ? "flex shrink-0 gap-2" : "flex flex-wrap gap-2"
          }
        >
          {group.chips}
        </div>
      ))}
    </div>
  );
}

function Chip({
  on,
  onMap,
  onClick,
  children,
}: {
  on: boolean;
  onMap: boolean;
  onClick: () => void;
  children: string;
}) {
  const off = onMap
    ? "border-border-strong bg-surface text-text shadow-sm hover:bg-surface-raised"
    : "border-border-strong text-text hover:bg-surface-raised";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-11 shrink-0 cursor-pointer rounded-full border px-3.5 text-body-sm font-semibold whitespace-nowrap transition-colors duration-fast ${on ? "border-text bg-text text-bg" : off}`}
    >
      {children}
    </button>
  );
}
