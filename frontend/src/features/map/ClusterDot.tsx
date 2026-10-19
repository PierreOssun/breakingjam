import { clusterLabel } from "./jams";

/** A cluster as §7 draws it, decorative: 36px for 2–9, 44px for 10–99, 56px from 100. */
export function ClusterDot({ count }: { count: number }) {
  const size = count >= 100 ? "size-14" : count >= 10 ? "size-11" : "size-9";
  return (
    <span
      aria-hidden
      className={`grid place-items-center rounded-full border-2 border-primary-text bg-bg text-[14px] leading-none font-extrabold text-primary-text shadow-sm ${size}`}
    >
      {clusterLabel(count)}
    </span>
  );
}
