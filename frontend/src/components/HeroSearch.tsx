import { MagnifyingGlass } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { buttonClasses } from "./buttonClasses";

type HeroSearchProps = {
  /** The field's accessible name. */
  label: string;
  placeholder: string;
  /** The submit button: inline from lg, full width under the field below. */
  submit: string;
  /** Where the search goes, as `<to>?q=…`; a blank search goes there without `q`. */
  to: string;
};

/** The big landing-page search: a pill field that hands its words to another page (§4.26). */
export function HeroSearch({
  label,
  placeholder,
  submit,
  to,
}: HeroSearchProps) {
  const navigate = useNavigate();
  const [text, setText] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = text.trim();
    navigate(q ? `${to}?q=${encodeURIComponent(q)}` : to);
  }

  return (
    <form role="search" onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex h-14 items-center gap-2.5 rounded-full border border-border-strong bg-surface pr-1.5 pl-5 shadow-lg has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus has-focus-visible:outline-solid lg:h-[60px]">
        <MagnifyingGlass
          size={20}
          weight="bold"
          aria-hidden
          className="shrink-0 text-muted"
        />
        <input
          type="search"
          aria-label={label}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-body text-text placeholder:text-muted focus-visible:outline-none"
        />
        {/* Wrappers hide the buttons, because a button's own `inline-flex` would win. */}
        <div className="hidden lg:block">
          <button type="submit" className={buttonClasses("primary", "sm")}>
            {submit}
          </button>
        </div>
      </div>
      <div className="lg:hidden">
        <button
          type="submit"
          className={`${buttonClasses("primary", "lg")} w-full`}
        >
          {submit}
        </button>
      </div>
    </form>
  );
}
