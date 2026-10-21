import type {
  InfiniteData,
  UseInfiniteQueryResult,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

type MoreListProps<T> = {
  query: UseInfiniteQueryResult<InfiniteData<{ items: T[] }>>;
  /** Shown once the first page is in and has nothing. */
  empty: ReactNode;
  /** The button's text. */
  more: string;
  className?: string;
  /** Names the list for screen readers. */
  label?: string;
  children: (item: T) => ReactNode;
};

/** A paged list: its rows, an empty state, the load error, and a full-width "Show more" (§4). */
export function MoreList<T extends { id: string }>({
  query,
  empty,
  more,
  className,
  label,
  children,
}: MoreListProps<T>) {
  const { t } = useTranslation();
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      {query.isError && <p className="text-danger">{t("errors.generic")}</p>}
      {query.isSuccess && items.length === 0 && empty}
      <ul aria-label={label} className={className}>
        {items.map((item) => (
          <li key={item.id}>{children(item)}</li>
        ))}
      </ul>
      {query.hasNextPage && (
        <Button
          variant="secondary"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {more}
        </Button>
      )}
    </>
  );
}
