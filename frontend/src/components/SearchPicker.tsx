import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebounced } from "../lib/useDebounced";
import { Button } from "./Button";

type SearchPickerProps<T> = {
  label: string;
  /** Query-cache namespace, e.g. `dancers`. */
  kind: string;
  search: (query: string) => Promise<T[]>;
  idOf: (item: T) => string;
  /** One result line: enough to tell two namesakes apart (§4 "Dancer identity"). */
  renderItem: (item: T) => ReactNode;
  onPick: (item: T) => void;
  /** Already chosen; left out of the results. */
  exclude?: string[];
  /** Creating is offered when set: the label and the inline form, seeded with the search. */
  create?: {
    label: string;
    render: (query: string, done: () => void) => ReactNode;
  };
};

/**
 * Search-before-create (§6): results appear as the user types, and creating a new one is
 * possible only once a search has run. Generic over the item so dancers and crews share it.
 * Lives inside other forms, so it is not a `<form>` and Enter never submits the outer one.
 */
export function SearchPicker<T>(props: SearchPickerProps<T>) {
  const { label, kind, search, idOf, renderItem, onPick } = props;
  const { t } = useTranslation();
  const id = useId();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const q = useDebounced(query.trim(), 300);
  const results = useQuery({
    queryKey: [kind, "search", q],
    queryFn: () => search(q),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
  const searched = q.length >= 2 && results.isSuccess;
  const shown = (results.data ?? []).filter(
    (item) => !props.exclude?.includes(idOf(item)),
  );

  if (creating && props.create)
    return props.create.render(query.trim(), () => setCreating(false));
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label text-text uppercase">
        {label}
      </label>
      <div className="relative">
        <MagnifyingGlass
          size={20}
          weight="bold"
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
        />
        <input
          id={id}
          type="search"
          autoComplete="off"
          value={query}
          placeholder={t("picker.placeholder")}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          className="h-12 w-full rounded-md border border-border-strong bg-surface pr-3.5 pl-11 text-body text-text placeholder:text-muted focus-visible:border-text"
        />
      </div>
      {searched && (
        <ul aria-label={t("picker.results")} className="flex flex-col">
          {shown.length === 0 && (
            <li className="py-2 text-body-sm text-muted">
              {t("picker.none", { query: q })}
            </li>
          )}
          {shown.map((item) => (
            <li key={idOf(item)}>
              <button
                type="button"
                onClick={() => {
                  onPick(item);
                  setQuery("");
                }}
                className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-body-sm transition-colors duration-fast hover:bg-surface-raised"
              >
                {renderItem(item)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {props.create && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={!searched}
            onClick={() => setCreating(true)}
          >
            <Plus size={16} weight="bold" aria-hidden />
            {props.create.label}
          </Button>
          {!searched && (
            <p className="text-caption text-muted">{t("picker.searchFirst")}</p>
          )}
        </>
      )}
    </div>
  );
}
