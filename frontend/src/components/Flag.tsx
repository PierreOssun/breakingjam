import { useTranslation } from "react-i18next";
import { countryName } from "../lib/countries";

// One file per flag, fetched only when shown; vite.config.ts keeps them out of the bundle.
const FLAGS = import.meta.glob<string>(
  "../../node_modules/flag-icons/flags/4x3/*.svg",
  {
    query: "?url",
    import: "default",
    eager: true,
  },
);

function flagUrl(code: string): string | undefined {
  return FLAGS[
    `../../node_modules/flag-icons/flags/4x3/${code.toLowerCase()}.svg`
  ];
}

/** A 4:3 flag image named after its country (DESIGN.md §4.10); `bare` is the list-row size. */
export function Flag({
  code,
  size = "chip",
}: {
  code: string;
  size?: "chip" | "bare";
}) {
  const { i18n } = useTranslation();
  const url = flagUrl(code);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={countryName(code, i18n.language)}
      // §4.10: a 1px ring of black at 20%, so white flags keep an edge.
      className={`${size === "chip" ? "h-[14px] w-5" : "h-[11px] w-4"} shrink-0 rounded-[3px] object-cover ring-1 ring-[rgb(0_0_0/0.2)]`}
    />
  );
}

/** Flag plus ISO code in a pill, next to a dancer's name. Not interactive. */
export function FlagChip({ code }: { code: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-bg pr-2.5 pl-[7px] text-caption font-extrabold tracking-[0.04em]">
      <Flag code={code} />
      {code}
    </span>
  );
}
