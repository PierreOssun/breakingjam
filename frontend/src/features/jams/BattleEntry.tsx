import {
  ArrowSquareOut,
  Bell,
  CaretRight,
  Check,
  Clock,
  EnvelopeSimple,
  InstagramLogo,
  Lock,
  SealCheck,
  X,
} from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { buttonClasses } from "../../components/buttonClasses";
import { Dialog } from "../../components/Dialog";
import { withNext } from "../auth/safeNext";
import { useMe } from "../auth/useMe";
import { membersPerEntry } from "./battleFields";
import { ContactAnchor } from "./ContactAnchor";
import {
  type EntryState,
  entryState,
  myEntry,
  placesLeft,
  useAsking,
  useEntering,
  useJamRequests,
  useMyRequests,
} from "./entering";
import { AskSheet, EnterSheet } from "./EntrySheets";
import { organiserContact } from "./jamDetail";
import { RequestsSheet } from "./RequestsSheet";

type Jam = Schemas["EventResponse"];
type Battle = Schemas["BattleDetail"];
type EntryProps = { jam: Jam; battle: Battle };
type Sheet = "enter" | "ask" | "requests";

// A state that is no button: "Registration closed", "Battle is full", "Request declined".
const GREY_PILL =
  "flex h-11 w-full items-center justify-center gap-2 rounded-full bg-border/60 text-body-sm font-bold text-muted";
// "Request sent", "3 requests waiting": the accent colour, as role tags.
const ACCENT_PILL =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-accent-text bg-accent/[.14] px-3 text-body-sm font-bold whitespace-nowrap text-accent-text";
const LINE = "text-caption text-muted";

/**
 * The bottom of a battle card (M32, DESIGN.md §4.46): how this viewer can enter, if at all, or
 * for the jam's editors how dancers enter and who waits, with Change asking the card for its
 * battle sheet. Changes are read out politely.
 */
export function BattleEntry({
  jam,
  battle,
  onChange,
}: EntryProps & { onChange: () => void }) {
  const me = useMe().data;
  const request = useMyRequests(jam).get(battle.id);
  // Here, not under the button: a sheet stays open when the card turns to "Battle is full".
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const state = entryState(jam, battle, me, request);
  if (!state) return null;
  const close = () => setSheet(null);
  return (
    <div
      aria-live="polite"
      className="flex flex-col gap-2 border-t border-border pt-4"
    >
      <EntryAction
        jam={jam}
        battle={battle}
        state={state}
        request={request}
        open={(next) => (next === "change" ? onChange() : setSheet(next))}
      />
      {sheet === "enter" && (
        <EnterSheet jam={jam} battle={battle} onClose={close} />
      )}
      {sheet === "ask" && (
        <AskSheet jam={jam} battle={battle} onClose={close} />
      )}
      {sheet === "requests" && (
        <RequestsSheet jam={jam} battle={battle} onClose={close} />
      )}
    </div>
  );
}

function EntryAction({
  jam,
  battle,
  state,
  request,
  open,
}: EntryProps & {
  state: EntryState;
  request: Schemas["MyRequest"] | undefined;
  open: (sheet: Sheet | "change") => void;
}) {
  const { t } = useTranslation();
  const me = useMe().data;
  const unit = membersPerEntry(battle) === 1 ? "dancers" : "teams";
  const left = placesLeft(battle);
  switch (state) {
    case "organiser":
      return <Setting jam={jam} battle={battle} open={open} />;
    case "closed":
      return (
        <p className={GREY_PILL}>
          <Lock size={16} weight="bold" aria-hidden />
          {t("jam.entry.closed")}
        </p>
      );
    case "site":
      return (
        <WithLine line={t("jam.entry.siteLine")}>
          <a
            href={jam.registration_url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonClasses("secondary")} w-full`}
          >
            <span className="min-w-0 truncate">{t("jam.entry.site")}</span>
            <ArrowSquareOut size={18} weight="bold" aria-hidden />
          </a>
        </WithLine>
      );
    case "contact":
      return (
        <WithLine line={t(`jam.entry.contactLine.${unit}`)}>
          <ContactButton jam={jam} />
        </WithLine>
      );
    case "in":
      // A team leaves through its organiser: one member can't take the others out.
      return (myEntry(battle, me)?.members.length ?? 1) > 1 ? (
        <WithLine
          line={
            <>
              {t("jam.entry.inTeamLine")} <ContactLink jam={jam} />
            </>
          }
        >
          <InPill />
        </WithLine>
      ) : (
        <YoureIn battle={battle} jam={jam} />
      );
    case "pending":
      return <Waiting jam={jam} battle={battle} request={request} />;
    case "declined":
      return (
        <WithLine
          line={
            <>
              {t("jam.entry.declinedLine")} <ContactLink jam={jam} />
            </>
          }
        >
          <p className={GREY_PILL}>
            <X size={16} weight="bold" aria-hidden />
            {t("jam.entry.declined")}
          </p>
        </WithLine>
      );
    case "full":
      return (
        <WithLine
          line={
            <>
              {t("jam.entry.fullLine", { count: battle.max_entries ?? 0 })}{" "}
              <ContactLink jam={jam} />
            </>
          }
        >
          <p className={GREY_PILL}>{t("jam.entry.full")}</p>
        </WithLine>
      );
    case "login":
      return (
        <WithLine line={t("jam.entry.loginLine")}>
          <Link
            to={withNext("/login", `/jams/${jam.slug}`)}
            className={`${buttonClasses("primary")} w-full`}
          >
            {t("jam.entry.login")}
          </Link>
        </WithLine>
      );
    case "verify":
      return (
        <WithLine line={t("jam.entry.verifyLine")}>
          {/* Their page, where "This is me" starts the check; else the welcome step finds it. */}
          <Link
            to={
              me?.dancer
                ? `/dancers/${me.dancer.id}`
                : withNext("/welcome", `/jams/${jam.slug}`)
            }
            className={`${buttonClasses("secondary")} w-full`}
          >
            <SealCheck
              size={18}
              weight="fill"
              aria-hidden
              className="text-primary-text"
            />
            <span className="min-w-0 truncate">{t("jam.entry.verify")}</span>
          </Link>
        </WithLine>
      );
    case "ask":
      return (
        <WithLine line={t("jam.entry.askLine")}>
          <Button className="w-full" onClick={() => open("ask")}>
            {t("jam.entry.ask")}
          </Button>
        </WithLine>
      );
    case "enter":
      return (
        <WithLine
          line={`${t("jam.entry.enterLine")}${left === null ? "" : ` ${t("jam.entry.placesLeft", { count: left })}`}`}
        >
          <Button className="w-full" onClick={() => open("enter")}>
            {t("jam.entry.enter")}
          </Button>
        </WithLine>
      );
  }
}

/** A control and the small line under it. */
function WithLine({
  line,
  children,
}: {
  line: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <p className={LINE}>{line}</p>
    </>
  );
}

/** For the jam's editors: requests waiting, with Review; else how dancers enter, with Change. */
function Setting({
  jam,
  battle,
  open,
}: EntryProps & { open: (sheet: Sheet | "change") => void }) {
  const { t } = useTranslation();
  const waiting = (useJamRequests(jam).data ?? []).filter(
    (r) => r.battle_id === battle.id,
  ).length;
  const unit = membersPerEntry(battle) === 1 ? "dancers" : "teams";
  if (waiting > 0)
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className={ACCENT_PILL}>
          <Bell size={16} weight="bold" aria-hidden />
          {t("jam.entry.waiting", { count: waiting })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => open("requests")}
        >
          {t("jam.entry.review")}
          <CaretRight size={16} weight="bold" aria-hidden />
        </Button>
      </div>
    );
  const setting =
    battle.registration === "organizer"
      ? t(`jam.entry.setting.organizer.${unit}`)
      : t(`jam.entry.setting.${battle.registration}`);
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-body-sm text-muted">{setting}</p>
      <Button variant="ghost" size="sm" onClick={() => open("change")}>
        {t("jam.entry.change")}
      </Button>
    </div>
  );
}

/** "Contact the organiser" as a full button: their email, an Instagram DM, or our Contact page. */
function ContactButton({ jam }: { jam: Jam }) {
  const { t } = useTranslation();
  const contact = organiserContact(jam);
  if (!contact) return null;
  const Icon = contact.kind === "instagram" ? InstagramLogo : EnvelopeSimple;
  return (
    <ContactAnchor
      contact={contact}
      className={`${buttonClasses("secondary")} w-full`}
    >
      <Icon size={18} weight="bold" aria-hidden />
      <span className="min-w-0 truncate">{t("jam.entry.contact")}</span>
    </ContactAnchor>
  );
}

/** The same contact, as a link inside a line of text. */
function ContactLink({ jam }: { jam: Jam }) {
  const { t } = useTranslation();
  const contact = organiserContact(jam);
  if (!contact) return null;
  return (
    <ContactAnchor
      contact={contact}
      className="font-bold text-primary-text underline underline-offset-2"
    >
      {t("jam.entry.contact")}
    </ContactAnchor>
  );
}

/** "Request sent", and Cancel request, which acts at once. */
function Waiting({
  jam,
  battle,
  request,
}: EntryProps & { request: Schemas["MyRequest"] | undefined }) {
  const { t } = useTranslation();
  const { cancel } = useAsking(jam, battle);
  return (
    <WithLine line={t("jam.entry.pendingLine")}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className={ACCENT_PILL}>
          <Clock size={16} weight="bold" aria-hidden />
          {t("jam.entry.pending")}
        </span>
        {request && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            loading={cancel.isPending}
            onClick={() => cancel.mutate(request.id)}
          >
            {t("jam.entry.cancelRequest")}
          </Button>
        )}
      </div>
      {cancel.isError && (
        <p role="alert" className="text-body-sm font-bold text-danger">
          {t("errors.generic")}
        </p>
      )}
    </WithLine>
  );
}

/** "✓ You're in", in the success colour (as the Published badge). */
function InPill() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-success bg-success/[.12] px-3 text-body-sm font-bold whitespace-nowrap text-success">
      <Check size={16} weight="bold" aria-hidden />
      {t("jam.entry.in")}
    </span>
  );
}

/** "You're in", and Withdraw after a confirm. */
function YoureIn({ jam, battle }: EntryProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const { leave } = useEntering(jam, battle);
  return (
    <WithLine line={t("jam.entry.inLine")}>
      {/* Wraps rather than squeeze the pill: "Du bist drin" beside "Zurückziehen" at 320px. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <InPill />
        <Button
          variant="ghost"
          size="sm"
          // Right-aligned on its own line too, once the row wraps.
          className="ml-auto"
          onClick={() => setConfirming(true)}
        >
          {t("jam.entry.withdraw")}
        </Button>
      </div>
      {confirming && (
        <Dialog
          title={t("jam.entry.withdrawTitle", { name: battle.name })}
          onClose={() => setConfirming(false)}
          action={{
            label: t("jam.entry.withdraw"),
            cancel: t("jam.entry.keep"),
            loading: leave.isPending,
            onClick: () =>
              leave.mutate(undefined, {
                onSuccess: () => setConfirming(false),
              }),
          }}
        >
          <p className="text-body text-muted">{t("jam.entry.withdrawBody")}</p>
          {leave.isError && (
            <p role="alert" className="text-body-sm font-bold text-danger">
              {t("errors.generic")}
            </p>
          )}
        </Dialog>
      )}
    </WithLine>
  );
}
