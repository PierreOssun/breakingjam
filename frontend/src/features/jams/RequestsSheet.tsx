import { Check, InstagramLogo, Lock } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Flag } from "../../components/Flag";
import { VerifiedTick } from "../../components/VerifiedTick";
import { timeAgo } from "../../lib/dates";
import { DancerAvatar } from "../dancers/DancerAvatar";
import {
  activeEntries,
  filledUp,
  placesLeft,
  useAnswering,
  useJamRequests,
} from "./entering";

type Jam = Schemas["EventResponse"];
type Battle = Schemas["BattleDetail"];
type Request = Schemas["BattleRequest"];

/**
 * A battle's requests, oldest first, for its organiser (§4.47): who asks, their Instagram (even
 * when their page hides it), Accept and Decline, which act at once. Accept waits while full.
 */
export function RequestsSheet({
  jam,
  battle,
  onClose,
}: {
  jam: Jam;
  battle: Battle;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const requests = (useJamRequests(jam).data ?? []).filter(
    (r) => r.battle_id === battle.id,
  );
  const answer = useAnswering(jam);
  const full = placesLeft(battle) === 0;
  const entered = activeEntries(battle).length;
  return (
    <Dialog title={t("jam.requests.title")} onClose={onClose}>
      <p className="text-body-sm text-muted">
        {battle.name} ·{" "}
        {battle.max_entries == null
          ? t("jam.requests.enteredNoMax", { count: entered })
          : t("jam.requests.entered", {
              count: entered,
              max: battle.max_entries,
            })}{" "}
        ·{" "}
        <span className="font-bold text-accent-text">
          {t("jam.requests.waiting", { count: requests.length })}
        </span>
        {full && ` · ${t("jam.requests.full")}`}
      </p>
      {requests.length === 0 ? (
        <p className="text-body text-muted">{t("jam.requests.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              full={full}
              busy={answer.isPending}
              onAnswer={(choice) =>
                answer.mutate({ request: request.id, answer: choice })
              }
            />
          ))}
        </ul>
      )}
      {answer.error && (
        <p role="alert" className="text-body-sm font-bold text-danger">
          {filledUp(answer.error)
            ? t("jam.requests.filled")
            : t("errors.generic")}
        </p>
      )}
      <p className="text-caption text-muted">{t("jam.requests.footer")}</p>
    </Dialog>
  );
}

/** One request: a team's name over its members, each with their Instagram; then the answers. */
function RequestCard({
  request,
  full,
  busy,
  onAnswer,
}: {
  request: Request;
  full: boolean;
  busy: boolean;
  onAnswer: (answer: "accept" | "decline") => void;
}) {
  const { t, i18n } = useTranslation();
  const when = timeAgo(request.created_at, i18n.language);
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      {request.team_name && (
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-body font-extrabold break-words">
            {request.team_name}
          </p>
          <span className="shrink-0 text-caption text-muted">{when}</span>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {request.members.map((member, index) => (
          <Member
            key={member.id}
            member={member}
            when={!request.team_name && index === 0 ? when : null}
          />
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-3">
        <Button
          size="sm"
          disabled={full || busy}
          onClick={() => onAnswer("accept")}
        >
          <Check size={16} weight="bold" aria-hidden />
          {t("jam.requests.accept")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => onAnswer("decline")}
        >
          {t("jam.requests.decline")}
        </Button>
      </div>
    </li>
  );
}

/** Avatar, name and flag to their page, when they asked, then their Instagram. */
function Member({
  member,
  when,
}: {
  member: Schemas["RequestMember"];
  when: string | null;
}) {
  const { t } = useTranslation();
  const handle = member.instagram_handle;
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className="inline-flex">
        <DancerAvatar dancer={member} size="stack" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <Link
            to={`/dancers/${member.id}`}
            className="truncate text-body font-extrabold underline-offset-2 hover:underline"
          >
            {member.dancer_name}
          </Link>
          {member.verified && <VerifiedTick />}
          <Flag code={member.country} />
          {when && (
            <span className="ml-auto shrink-0 text-caption text-muted">
              {when}
            </span>
          )}
        </div>
        {handle && (
          <p className="flex flex-wrap items-center gap-x-2 text-body-sm">
            <a
              href={`https://www.instagram.com/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-bold text-primary-text underline-offset-2 hover:underline"
            >
              <InstagramLogo size={16} weight="bold" aria-hidden />@{handle}
            </a>
            {member.instagram_hidden && (
              <span className="inline-flex items-center gap-1 text-caption text-muted">
                <Lock size={12} weight="bold" aria-hidden />
                {t("jam.requests.hidden")}
              </span>
            )}
          </p>
        )}
      </div>
    </li>
  );
}
