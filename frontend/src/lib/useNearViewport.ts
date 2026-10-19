import { type RefObject, useEffect, useState } from "react";

/** Whether the element is within 200px of the viewport; always true unless `lazy`. */
export function useNearViewport(
  ref: RefObject<HTMLElement | null>,
  lazy: boolean,
): boolean {
  // Without IntersectionObserver (old browsers, jsdom) everything loads at once.
  const [near, setNear] = useState(
    !lazy || typeof IntersectionObserver === "undefined",
  );
  useEffect(() => {
    const element = ref.current;
    if (near || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, near]);
  return near;
}
