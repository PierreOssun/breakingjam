import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

/**
 * A button's popup of `count` items (DESIGN.md §4.6): arrows, Home and End move, Enter or
 * Space picks, Esc and a click outside close, Tab leaves. Space picks on key up: picking
 * moves focus to the button, and Firefox would turn a Space released there into a click.
 */
export function useMenu(count: number, onPick: (index: number) => void) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const id = useId();

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
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

  function pick(index: number) {
    onPick(index);
    close();
  }

  function onKeyDown(event: KeyboardEvent) {
    const last = count - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((i) => (i === last ? 0 : i + 1)),
      ArrowUp: () => setActive((i) => (i === 0 ? last : i - 1)),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => pick(active),
      " ": () => {},
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

  function onKeyUp(event: KeyboardEvent) {
    if (event.key !== " ") return;
    event.preventDefault();
    pick(active);
  }

  /** Opens with `index` focused, or closes when open. */
  function toggle(index: number) {
    if (open) return setOpen(false);
    setActive(index);
    setOpen(true);
  }

  return {
    open,
    setOpen,
    toggle,
    active,
    rootRef,
    buttonRef,
    itemRefs,
    id,
    onKeyDown,
    onKeyUp,
    pick,
  };
}
