import {
  ArrowDown,
  CalendarPlus,
  Check,
  UsersThree,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { api, type Schemas, unwrap } from "../../api/client";
import { Button } from "../../components/Button";
import { buttonClasses } from "../../components/buttonClasses";
import { Dialog } from "../../components/Dialog";
import { ShareButton } from "../../components/ShareButton";
import { Skeleton } from "../../components/Skeleton";
import { formatShortDateRange } from "../../lib/dates";
import { withNext } from "../auth/safeNext";
import { useMe } from "../auth/useMe";
import { DancerChip } from "../dancers/DancerChip";
import { entryState, GOING_FOR_A_PLACE, useMyRequests } from "./entering";
import { PrimaryButton } from "./JamActions";
import {
  calendarUrl,
  openingHours,
  primaryAction,
  shareTitle,
} from "./jamDetail";
import { useGoing } from "./useGoing";

type Jam = Schemas["EventResponse"];

// "You're going": the primary colour's outline on its light tint (M32).
const GOING =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border-2 border-primary bg-primary/10 px-6 text-body font-bold whitespace-nowrap text-primary-text transition-colors duration-fast hover:bg-primary/20";

// Side by side while both labels fit whole, else one full-width row each: never "Zum Ba…".
const FIT = "min-w-max flex-auto";

/**
 * "I'm going" under the jam's title (M32): beside "Enter a battle" when a battle here takes
 * dancers directly, else beside "Register to battle" when the jam has a registration link, else
 * alone; then how many are going, which opens who. Only on announced jams still to come.
 * "Add to calendar" stays in the action bar and card, and in the sheet.
 */
export function GoingActions({
  jam,
  battles,
}: {
  jam: Jam;
  battles: Schemas["BattleDetail"][];
}) {
  const { t } = useTranslation();
  const me = useMe();
  const navigate = useNavigate();
  const going = useGoing(jam);
  const requests = useMyRequests(jam);
  const [sheet, setSheet] = useState<"going" | "who" | null>(null);
  // The sheet opens with the tap; if the save fails it closes, so the error toast shows.
  const goAndSay = () => {
    going.mutate(true, { onError: () => setSheet(null) });
    setSheet("going");
  };
  useGoingAfterLogin(jam, () => {
    if (jam.going) setSheet("going");
    else goAndSay();
  });
  if (!jam.takes_attendees) return null;

  // Only when this viewer has a battle to enter (or to log in or get verified for): not one
  // they are in already, nor a full one.
  const enterable = battles.some((b) =>
    GOING_FOR_A_PLACE.includes(
      entryState(jam, b, me.data, requests.get(b.id)) ?? "closed",
    ),
  );
  const register = !enterable && primaryAction(jam) === "register";
  const join = () => {
    if (!me.data) {
      navigate(withNext("/login", `/jams/${jam.slug}?going=1`));
      return;
    }
    goAndSay();
  };
  const button = jam.going ? (
    <button
      type="button"
      className={`${GOING} ${FIT}`}
      onClick={() => setSheet("going")}
    >
      <Check size={18} weight="bold" aria-hidden />
      {t("jam.going.you")}
    </button>
  ) : (
    <button
      type="button"
      className={`${buttonClasses(register || enterable ? "secondary" : "primary")} ${FIT}`}
      onClick={join}
    >
      {t("jam.going.button")}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {enterable && (
          <a href="#battles" className={`${buttonClasses("primary")} ${FIT}`}>
            {t("jam.going.enterBattle")}
            <ArrowDown size={18} weight="bold" aria-hidden />
          </a>
        )}
        {register && <PrimaryButton jam={jam} className={FIT} />}
        {button}
      </div>
      {jam.going_count > 0 && (
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 self-start text-body-sm text-muted underline-offset-2 hover:text-text hover:underline"
          onClick={() => setSheet("who")}
        >
          <UsersThree size={18} weight="bold" aria-hidden />
          {t("jam.going.count", { count: jam.going_count })}
        </button>
      )}
      {sheet === "going" && (
        <GoingDialog
          jam={jam}
          onLeave={() => {
            going.mutate(false);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "who" && (
        <WhoIsGoingDialog jam={jam} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

/**
 * Back from logging in with `?going=1`: the tap that sent the visitor there takes effect, once,
 * and the parameter goes so a reload doesn't repeat it.
 */
function useGoingAfterLogin(jam: Jam, then: () => void) {
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const done = useRef(false);
  const asked = params.get("going") === "1";
  useEffect(() => {
    if (!asked || me.isPending || done.current) return;
    done.current = true;
    setParams(
      (current) => {
        current.delete("going");
        return current;
      },
      { replace: true },
    );
    if (me.data && jam.takes_attendees) then();
  }, [asked, me.isPending, me.data, jam, setParams, then]);
}

/** After "I'm going", and on tapping "You're going": the day, the calendar, the crew. */
function GoingDialog({
  jam,
  onLeave,
  onClose,
}: {
  jam: Jam;
  onLeave: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const day = formatShortDateRange(jam.starts_on, jam.starts_on, i18n.language);
  const hours = openingHours(jam, i18n.language);
  const line = [
    jam.name,
    jam.city,
    hours && [hours.from, hours.to].filter(Boolean).join("–"),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Dialog title={t("jam.going.seeYou", { day })} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-start gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-success bg-success/[.12] px-3 text-body-sm font-bold text-success">
            <Check size={16} weight="bold" aria-hidden />
            {t("jam.going.you")}
          </span>
          <p className="text-body-sm text-muted">{line}</p>
        </div>
        <a href={calendarUrl(jam)} className={buttonClasses("primary")}>
          <CalendarPlus size={20} weight="bold" aria-hidden />
          {t("jam.calendar")}
        </a>
        <ShareButton
          title={shareTitle(jam, i18n.language)}
          look="secondary"
          label={t("jam.going.share")}
        />
        <p className="text-center text-caption text-muted">
          {t("jam.going.named")}
        </p>
        {jam.going && (
          <Button
            variant="ghost"
            size="sm"
            className="self-center"
            onClick={onLeave}
          >
            {t("jam.going.leave")}
          </Button>
        )}
      </div>
    </Dialog>
  );
}

/** Who is going: the verified dancers, each to their page, then how many others. */
function WhoIsGoingDialog({ jam, onClose }: { jam: Jam; onClose: () => void }) {
  const { t } = useTranslation();
  const list = useQuery({
    queryKey: ["event", jam.id, "going"],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/events/{id}/going", {
          params: { path: { id: jam.id } },
        }),
        "going",
      ),
  });
  return (
    <Dialog title={t("jam.going.who")} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {list.isPending ? (
          <Skeleton className="h-11 rounded-full" />
        ) : list.isError ? (
          <p className="text-danger">{t("errors.generic")}</p>
        ) : (
          <>
            {list.data.dancers.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {list.data.dancers.map((dancer) => (
                  <li key={dancer.id} className="h-11">
                    <DancerChip dancer={dancer} />
                  </li>
                ))}
              </ul>
            )}
            {list.data.others > 0 && (
              <p className="text-body-sm text-muted">
                {t(
                  list.data.dancers.length > 0
                    ? "jam.going.others"
                    : "jam.going.count",
                  { count: list.data.others },
                )}
              </p>
            )}
          </>
        )}
        <p className="text-caption text-muted">{t("jam.going.named")}</p>
      </div>
    </Dialog>
  );
}
