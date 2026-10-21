import { MagnifyingGlass } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { buttonClasses } from "./buttonClasses";

type HeroSearchProps = {
  /** The field's accessible name. */
  label: string;
  placeholder: string;
  /** The submit button's text; on the landing size, the J logo's accessible name. */
  submit: string;
  /** Where the search goes, as `<to>?q=…`; a blank search goes there without `q`. */
  to: string;
  /** The words already searched for; the field follows them when they change. */
  initial?: string;
  /** `landing`: bigger, alone in the hero, with the round J logo as the button (§4.26). */
  size?: "standard" | "landing";
};

/** The big pill search that hands its words to another page (§4.26). */
export function HeroSearch({
  label,
  placeholder,
  submit,
  to,
  initial = "",
  size = "standard",
}: HeroSearchProps) {
  const navigate = useNavigate();
  const [text, setText] = useState(initial);
  // Back and forward change `initial`: refill the field without remounting it, so it keeps focus.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setText(initial);
  }
  const landing = size === "landing";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = text.trim();
    navigate(q ? `${to}?q=${encodeURIComponent(q)}` : to);
  }

  // The pill rings when its field has focus; a focused button keeps its own ring.
  const pill = landing
    ? "h-16 gap-3 pr-1.5 pl-5 lg:h-20 lg:gap-3.5 lg:pr-2 lg:pl-[30px]"
    : "h-14 gap-2.5 pr-1.5 pl-5 lg:h-[60px]";
  return (
    <form
      role="search"
      onSubmit={onSubmit}
      className={`flex w-full flex-col gap-3 ${landing ? "lg:max-w-[760px]" : ""}`}
    >
      <div
        className={`flex items-center rounded-full border border-border-strong bg-surface shadow-lg has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus has-[input:focus-visible]:outline-solid ${pill}`}
      >
        <MagnifyingGlass
          weight="bold"
          aria-hidden
          className={`shrink-0 text-muted ${landing ? "size-5 lg:size-6" : "size-5"}`}
        />
        <input
          type="search"
          aria-label={label}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`h-full min-w-0 flex-1 bg-transparent text-text placeholder:text-muted focus-visible:outline-none ${landing ? "text-body lg:text-[20px]" : "text-body"}`}
        />
        {landing ? (
          <button
            type="submit"
            aria-label={submit}
            className="shrink-0 rounded-full transition-transform duration-fast hover:scale-[1.04] motion-reduce:hover:scale-100"
          >
            <img src="/favicon.svg" alt="" className="size-[52px] lg:size-16" />
          </button>
        ) : (
          // A wrapper hides the button, because its own `inline-flex` would win.
          <div className="hidden lg:block">
            <button type="submit" className={buttonClasses("primary", "sm")}>
              {submit}
            </button>
          </div>
        )}
      </div>
      {!landing && (
        <div className="lg:hidden">
          <button
            type="submit"
            className={`${buttonClasses("primary", "lg")} w-full`}
          >
            {submit}
          </button>
        </div>
      )}
    </form>
  );
}
