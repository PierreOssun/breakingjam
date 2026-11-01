import {
  Bug,
  Copy,
  EnvelopeSimple,
  Handshake,
  type Icon,
  InstagramLogo,
  Lightbulb,
  PencilSimple,
} from "@phosphor-icons/react";
import { type ReactNode, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/Button";
import { buttonClasses } from "../components/buttonClasses";
import { useToast } from "../components/useToast";
import { copyText } from "../lib/clipboard";
import { BREAKINGJAM_INSTAGRAM } from "../lib/instagram";

const EMAIL = "breakingjamtv@gmail.com";

const TOPICS = [
  { key: "idea", icon: Lightbulb },
  { key: "bug", icon: Bug },
  { key: "fix", icon: PencilSimple },
  { key: "hello", icon: Handshake },
] as const;

/** A mailto: link to us, its subject prefilled so the writer carries on after it. */
const mailto = (subject?: string) =>
  subject
    ? `mailto:${EMAIL}?subject=${encodeURIComponent(`${subject} `)}`
    : `mailto:${EMAIL}`;

/** Gives the page its own description while it is open, in `index.html`'s tag, not a second one. */
function useMetaDescription(content: string) {
  useEffect(() => {
    const tag = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    if (!tag) return;
    const site = tag.content;
    tag.content = content;
    return () => {
      tag.content = site;
    };
  }, [content]);
}

/** `/contact`: how to reach us, by email or Instagram; no form and no backend. */
export function ContactPage() {
  const { t } = useTranslation();
  useMetaDescription(t("contact.intro"));
  return (
    <div className="mx-auto flex max-w-prose flex-col gap-8 px-4 pt-8 pb-16 md:px-6 lg:py-20">
      <title>{`${t("pages.contact")} · BreakingJam`}</title>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-display-lg lg:text-display-xl">
          {t("contact.title")}
        </h1>
        <p className="text-body text-muted">{t("contact.intro")}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <EmailCard />
        <InstagramCard />
      </div>
      <section aria-labelledby="contact-topics" className="flex flex-col gap-3">
        <h2 id="contact-topics" className="text-label text-muted uppercase">
          {t("contact.topicsTitle")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {TOPICS.map(({ key, icon: Glyph }) => (
            <li key={key}>
              <a
                href={mailto(t(`contact.topics.${key}.subject`))}
                className="flex h-full gap-3 rounded-lg border border-border bg-surface p-4 transition-colors duration-fast hover:border-border-strong"
              >
                <Glyph
                  size={20}
                  weight="bold"
                  aria-hidden
                  className="mt-0.5 shrink-0 text-primary-text"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-body font-bold">
                    {t(`contact.topics.${key}.title`)}
                  </span>
                  <span className="text-body-sm text-muted">
                    {t(`contact.topics.${key}.body`)}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-caption text-muted">{t("contact.caption")}</p>
    </div>
  );
}

/** The address stays on screen as text: a mailto: link does nothing without a mail app. */
function EmailCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const copy = async () =>
    toast(
      (await copyText(EMAIL))
        ? { kind: "success", message: t("contact.copied") }
        : { kind: "error", message: t("contact.copyFailed") },
    );
  return (
    <ContactCard icon={EnvelopeSimple} label={t("contact.email")}>
      <p className="text-body font-bold break-all select-all">{EMAIL}</p>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void copy()}>
          <Copy size={16} weight="bold" aria-hidden />
          {t("contact.copy")}
        </Button>
        <a href={mailto()} className={buttonClasses("primary", "sm")}>
          {t("contact.write")}
        </a>
      </div>
    </ContactCard>
  );
}

function InstagramCard() {
  const { t } = useTranslation();
  return (
    <ContactCard icon={InstagramLogo} label={t("contact.instagram")}>
      <p className="text-body font-bold break-all select-all">
        @{BREAKINGJAM_INSTAGRAM}
      </p>
      <a
        href={`https://ig.me/m/${BREAKINGJAM_INSTAGRAM}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${buttonClasses("primary", "sm")} mt-auto self-start`}
      >
        {t("contact.dm")}
      </a>
    </ContactCard>
  );
}

function ContactCard({
  icon: Glyph,
  label,
  children,
}: {
  icon: Icon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
      <p className="flex items-center gap-2 text-label text-muted uppercase">
        <Glyph
          size={20}
          weight="bold"
          aria-hidden
          className="text-primary-text"
        />
        {label}
      </p>
      {children}
    </div>
  );
}
