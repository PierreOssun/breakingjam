import {
  CalendarBlank,
  Clock,
  InstagramLogo,
  UsersThree,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Schemas } from "../../api/client";
import { Dialog } from "../../components/Dialog";
import { Flag } from "../../components/Flag";
import { InlineNotice } from "../../components/InlineNotice";
import { TextField } from "../../components/TextField";
import { VerifiedTick } from "../../components/VerifiedTick";
import { formatBattleStart, formatShortDateRange } from "../../lib/dates";
import { useMe } from "../auth/useMe";
import { DancerAvatar } from "../dancers/DancerAvatar";
import { DancerPicker } from "../dancers/DancerPicker";
import { useDancer } from "../dancers/queries";
import { entrySize } from "./battleFields";
import {
  activeEntries,
  codeOf,
  doneAlready,
  filledUp,
  useAsking,
  useEntering,
} from "./entering";

type Jam = Schemas["EventResponse"];
type Battle = Schemas["BattleDetail"];
type SheetProps = { jam: Jam; battle: Battle; onClose: () => void };

/** Open battles: confirms who enters, when, and how full the battle is (§4.46). */
export function EnterSheet({ jam, battle, onClose }: SheetProps) {
  const { t } = useTranslation();
  const { enter } = useEntering(jam, battle);
  const filled = enter.error !== null && filledUp(enter.error);
  return (
    <Dialog
      title={t("jam.entry.title", { name: battle.name })}
      onClose={onClose}
      action={{
        label: t("jam.entry.enter"),
        loading: enter.isPending,
        disabled: filled,
        onClick: () =>
          enter.mutate(undefined, {
            onSuccess: onClose,
            // In from another tab: the card says so, the sheet has done its job.
            onError: (error) => doneAlready(error) && onClose(),
          }),
      }}
    >
      <AsDancer label={t("jam.entry.as")} />
      <BattleFacts jam={jam} battle={battle} />
      <InlineNotice>{t("jam.entry.note")}</InlineNotice>
      {enter.error && !doneAlready(enter.error) && (
        <Refusal>
          {filled ? t("jam.entry.filled") : t("errors.generic")}
        </Refusal>
      )}
    </Dialog>
  );
}

/**
 * Battles "with approval": the request, and for a team battle its name and teammates (pages
 * found, or made for those not on BreakingJam yet). Says what the organiser will see.
 */
export function AskSheet({ jam, battle, onClose }: SheetProps) {
  const { t } = useTranslation();
  const me = useMe().data;
  const { ask } = useAsking(jam, battle);
  const size = entrySize(battle) ?? 1;
  const [teamName, setTeamName] = useState("");
  const [teammates, setTeammates] = useState<Schemas["DancerRef"][]>([]);
  const missing = size - 1 - teammates.length;
  // Done already only when it is the asker's own request or place: a teammate in the battle
  // already is a refusal to show.
  const done = (error: Error) =>
    codeOf(error) === "already_requested" || (size === 1 && doneAlready(error));
  return (
    <Dialog
      title={t("jam.ask.title", { name: battle.name })}
      onClose={onClose}
      size={size > 1 ? "form" : "short"}
      action={{
        label: t("jam.ask.send"),
        loading: ask.isPending,
        disabled: missing > 0 || (ask.error !== null && filledUp(ask.error)),
        onClick: () =>
          ask.mutate(
            {
              team_name: size > 1 ? teamName : null,
              teammates: teammates.map((d) => d.id),
            },
            {
              onSuccess: onClose,
              onError: (error) => done(error) && onClose(),
            },
          ),
      }}
    >
      <p className="text-body-sm text-muted">{t("jam.ask.intro")}</p>
      <AsDancer label={t("jam.ask.as")} />
      <BattleFacts jam={jam} battle={battle} />
      {size > 1 && (
        <>
          <TextField
            label={t("jam.ask.teamName")}
            value={teamName}
            maxLength={100}
            onChange={(e) => setTeamName(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            {/* The search carries the label while it shows; a full team hides it. */}
            {missing === 0 && (
              <p className="text-label text-text uppercase">
                {t("jam.ask.teammates")}
              </p>
            )}
            <DancerPicker
              label={t("jam.ask.teammates")}
              selected={teammates}
              onChange={setTeammates}
              max={size - 1}
              exclude={me?.dancer ? [me.dancer.id] : []}
            />
            {missing > 0 && (
              <p className="text-caption text-muted">
                {t("jam.ask.missing", { count: missing })}
              </p>
            )}
          </div>
        </>
      )}
      <InstagramNote />
      {ask.error && !done(ask.error) && (
        <Refusal>{t(askRefusal(ask.error))}</Refusal>
      )}
      <p className="text-center text-caption text-muted">
        {t("jam.ask.cancelAnyTime")}
      </p>
    </Dialog>
  );
}

/** "Entering as" or "Asking as": the viewer's verified page. */
function AsDancer({ label }: { label: string }) {
  const me = useMe().data;
  if (!me?.dancer) return null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
      <DancerAvatar dancer={me.dancer} size="row" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-label text-muted uppercase">{label}</span>
        <span className="flex items-center gap-1.5 text-body font-extrabold">
          <span className="truncate">{me.dancer.dancer_name}</span>
          <VerifiedTick />
          <Flag code={me.dancer.country} />
        </span>
      </div>
    </div>
  );
}

/** The battle's day (the jam's while it has no start) and the jam, its start, its places. */
function BattleFacts({ jam, battle }: { jam: Jam; battle: Battle }) {
  const { t, i18n } = useTranslation();
  const battleDay = battle.starts_at?.slice(0, 10);
  const day = battleDay
    ? formatShortDateRange(battleDay, battleDay, i18n.language)
    : formatShortDateRange(jam.starts_on, jam.ends_on, i18n.language);
  const icon = {
    size: 18,
    weight: "bold" as const,
    "aria-hidden": true,
    className: "shrink-0 text-primary-text",
  };
  return (
    <ul className="flex flex-col gap-2 text-body-sm">
      <li className="flex items-center gap-2">
        <CalendarBlank {...icon} />
        {`${day} · ${jam.name}`}
      </li>
      {battle.starts_at && (
        <li className="flex items-center gap-2">
          <Clock {...icon} />
          {t("jam.entry.starts", {
            name: battle.name,
            time: formatBattleStart(battle.starts_at, true, i18n.language),
          })}
        </li>
      )}
      {battle.max_entries != null && (
        <li className="flex items-center gap-2">
          <UsersThree {...icon} />
          {t("jam.entry.taken", {
            count: activeEntries(battle).length,
            max: battle.max_entries,
          })}
        </li>
      )}
    </ul>
  );
}

/** What the organiser will see of the asker's Instagram, hidden on their page or not. */
function InstagramNote() {
  const { t } = useTranslation();
  const me = useMe().data;
  const page = useDancer(me?.dancer?.id ?? "").data;
  // A merged page answers with where it went: the viewer's own page never does.
  if (!page || "merged_into" in page) return null;
  const handle = page.instagram_handle;
  return (
    <p className="flex items-start gap-2.5 rounded-md bg-accent/[.10] px-3.5 py-3 text-[13px] leading-[18px] text-text">
      <InstagramLogo
        size={18}
        weight="bold"
        aria-hidden
        className="shrink-0 text-accent-text"
      />
      <span>
        {!handle ? (
          <>
            {t("jam.ask.igNone")}{" "}
            <Link
              to={`/dancers/${page.id}`}
              className="font-bold text-primary-text underline underline-offset-2"
            >
              {t("jam.ask.addIg")}
            </Link>
          </>
        ) : (
          t(page.instagram_hidden ? "jam.ask.igHidden" : "jam.ask.igPublic", {
            handle,
          })
        )}
      </span>
    </p>
  );
}

/** What a refused request says: full, a teammate in already, or something else. */
function askRefusal(error: Error) {
  if (filledUp(error)) return "jam.entry.filled" as const;
  if (codeOf(error) === "already_entered") return "jam.ask.teammateIn" as const;
  return "errors.generic" as const;
}

function Refusal({ children }: { children: string }) {
  return (
    <p role="alert" className="text-body-sm font-bold text-danger">
      {children}
    </p>
  );
}
