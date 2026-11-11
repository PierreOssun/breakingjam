import { Crown } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { Schemas } from "../../api/client";
import { ChipRow } from "../../components/ChipRow";
import { FormError } from "../../components/FormError";
import { InlineNotice } from "../../components/InlineNotice";
import { OptionalLabel } from "../../components/OptionalLabel";
import { SelectField } from "../../components/SelectField";
import { TextField } from "../../components/TextField";
import { SaveIndicator } from "./EditorBar";
import { entryLabel } from "./entryFields";
import { badLink, roundDone, type Slot } from "./results";
import type { Results } from "./useResults";

type Battle = Schemas["BattleDetail"];

/**
 * The battle sheet's Results step (M29): round by round, who battled whom and who won, with an
 * optional video link. A winner moves on to the next round by itself; each change saves itself.
 */
export function ResultsStep({
  battle,
  results,
}: {
  battle: Battle;
  results: Results;
}) {
  const { t } = useTranslation();
  const entries = battle.entries.filter((e) => e.status !== "withdrawn");
  const { rounds, draft, round } = results;
  if (rounds.length === 0) {
    return <InlineNotice>{t("org.results.needsBracket")}</InlineNotice>;
  }
  if (entries.length < 2) {
    return <InlineNotice>{t("org.results.needsEntries")}</InlineNotice>;
  }
  const slots = (round && draft[round]) || [];
  // An entrant battles once a round: the others' picks are greyed out.
  const taken = new Set(slots.flatMap((slot) => [slot.a, slot.b]));
  return (
    <div className="flex flex-col gap-5">
      <SaveIndicator
        state={results.state}
        action="retry"
        onFix={results.retry}
      />
      <ChipRow
        label={t("org.results.round")}
        chips={rounds.map((r) => ({
          key: r,
          // A finished round wears a tick: what's left to enter shows at a glance.
          label: roundDone(draft[r])
            ? t("org.results.roundDone", { round: t(`jam.rounds.${r}`) })
            : t(`jam.rounds.${r}`),
          on: r === round,
          onPick: () => results.setRound(r),
        }))}
      />
      <InlineNotice>{t("org.results.hint")}</InlineNotice>
      {round && (
        <ol className="flex flex-col gap-3">
          {slots.map((slot, index) => (
            <SlotCard
              key={`${round}-${index}`}
              index={index}
              slot={slot}
              entries={entries}
              taken={taken}
              onChange={(change) => results.change(round, index, change)}
            />
          ))}
        </ol>
      )}
      <FormError message={results.error ?? undefined} />
    </div>
  );
}

/** One battle: each side with its crown to mark the winner, then the video link. */
function SlotCard({
  index,
  slot,
  entries,
  taken,
  onChange,
}: {
  index: number;
  slot: Slot;
  entries: Schemas["Entry"][];
  taken: Set<string>;
  onChange: (change: Partial<Slot>) => void;
}) {
  const { t } = useTranslation();
  const title = t("org.results.battle", { n: index + 1 });
  const nameOf = (id: string) => entries.find((e) => e.id === id) ?? null;
  return (
    <li className="flex flex-col gap-3 rounded-[16px] border border-border p-3">
      <p className="text-label text-muted uppercase">{title}</p>
      {(["a", "b"] as const).map((side, n) => {
        const entry = nameOf(slot[side]);
        const won = slot.winner === side;
        return (
          <div key={side} className="flex items-end gap-2">
            <button
              type="button"
              aria-pressed={won}
              disabled={!entry}
              onClick={() => onChange({ winner: won ? null : side })}
              aria-label={t("org.results.won", {
                name: entry
                  ? entryLabel(entry)
                  : t("org.results.side", { n: n + 1 }),
              })}
              className={`grid size-12 shrink-0 cursor-pointer place-items-center rounded-full border transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-40 ${
                won
                  ? "border-primary-text bg-primary/12 text-primary-text"
                  : "border-border-strong text-muted hover:text-text"
              }`}
            >
              <Crown size={20} weight={won ? "fill" : "regular"} aria-hidden />
            </button>
            <SelectField
              className="min-w-0 flex-1"
              label={
                <span className="sr-only">
                  {title}, {t("org.results.side", { n: n + 1 })}
                </span>
              }
              value={slot[side]}
              onChange={(e) => onChange({ [side]: e.target.value })}
            >
              <option value="">{t("org.results.pick")}</option>
              {entries.map((e) => (
                <option
                  key={e.id}
                  value={e.id}
                  disabled={taken.has(e.id) && slot[side] !== e.id}
                >
                  {entryLabel(e)}
                </option>
              ))}
            </SelectField>
          </div>
        );
      })}
      <TextField
        type="url"
        inputMode="url"
        label={<OptionalLabel label={t("org.results.video")} />}
        placeholder="https://youtu.be/…"
        value={slot.video}
        error={badLink(slot) ? t("org.results.videoInvalid") : undefined}
        onChange={(e) => onChange({ video: e.target.value })}
      />
    </li>
  );
}
