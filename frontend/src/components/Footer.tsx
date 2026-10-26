import { InstagramLogo } from "@phosphor-icons/react";
import { BREAKINGJAM_INSTAGRAM } from "../lib/instagram";
import { Wordmark } from "./Wordmark";

/** Content-page footer: the round logo and Instagram; the header holds the links and language (§6). */
export function Footer() {
  return (
    <footer className="border-t border-border">
      {/* One row from about 360px; narrower, Instagram goes under the logo. */}
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-10 md:px-6 lg:px-8">
        <Wordmark logo="round" />
        <a
          href={`https://instagram.com/${BREAKINGJAM_INSTAGRAM}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-body-sm font-bold underline-offset-2 hover:underline"
        >
          <InstagramLogo size={16} weight="bold" aria-hidden />
          Instagram
        </a>
      </div>
    </footer>
  );
}
