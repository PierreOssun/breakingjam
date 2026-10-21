import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useDebounced } from "./useDebounced";

/**
 * A search field kept in the URL's `?q=`, so back and shared links return to it: the field's
 * own `text`, and `q`, the search once typing pauses. The field never reads the URL while
 * typing: a router update is a transition, and a field driven by one loses the caret.
 */
export function useSearchText(): [string, (text: string) => void, string] {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);
  const settled = useDebounced(text.trim(), 250);
  const pushed = useRef(q);
  useEffect(() => {
    // A `q` changed by back or forward is the next effect's; a debounce still behind the
    // field waits. Retyping the search Back just cleared then pushes it again.
    if (q !== pushed.current || settled !== text.trim() || settled === q)
      return;
    pushed.current = settled;
    setParams(settled ? { q: settled } : {}, { replace: true });
  }, [settled, text, q, setParams]);
  // A `q` this page did not push (back, forward, the header's link) replaces what was typed.
  useEffect(() => {
    if (q !== pushed.current) {
      pushed.current = q;
      setText(q);
    }
  }, [q]);
  return [text, setText, q];
}
