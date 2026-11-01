import {
  CalendarBlank,
  Clock,
  Eye,
  PencilSimple,
  Plus,
  UsersThree,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import type { Schemas } from "../api/client";
import { InlineNotice } from "../components/InlineNotice";
import { Loading, Skeleton } from "../components/Skeleton";
import { BattlesEditor } from "../features/jams/BattlesEditor";
import { CountdownChip } from "../features/jams/CountdownChip";
import { DeleteJamButton } from "../features/jams/DeleteJamButton";
import { EditorBar } from "../features/jams/EditorBar";
import { BlockCard, EmptyBlock } from "../features/jams/EditorBlock";
import {
  AboutBlock,
  DatesBlock,
  LinksBlock,
} from "../features/jams/EditorBlocks";
import { FlyerOverlay } from "../features/jams/FlyerEditor";
import { countdown, firstStart } from "../features/jams/jamDetail";
import {
  type Block,
  brokenSpot,
  checklist,
  type ChecklistItem,
  type Spot,
} from "../features/jams/jamFields";
import { JamFlyer } from "../features/jams/JamFlyer";
import { Lineup } from "../features/jams/Lineup";
import { OrganizerCard } from "../features/jams/OrganizerCard";
import { PublishBar, PublishCard } from "../features/jams/PublishPanel";
import { useBattles, useJam, useStaff } from "../features/jams/queries";
import { StatusActions } from "../features/jams/StatusActions";
import { type JamDraft, useJamAutosave } from "../features/jams/useAutosave";
import { VenueBlock } from "../features/jams/VenueBlock";
import { formatShortDateRange, formatTime } from "../lib/dates";
import { NotFoundPage } from "./NotFoundPage";

type Jam = Schemas["EventResponse"];

/** `/org/jams/:id/edit`: the jam page in edit mode (M24). Every part is a block that saves as
 * you type; the checklist says what a draft still needs before it goes to review. */
export function OrgJamEditPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const jam = useJam(id);
  if (jam.isPending) return <EditorSkeleton />;
  if (jam.isError)
    return (
      <p className="mx-auto max-w-content px-4 py-10 text-danger">
        {t("errors.generic")}
      </p>
    );
  // Someone else's jam reads as missing here, as drafts do on the API.
  if (!jam.data?.can_edit) return <NotFoundPage />;
  // Keyed: the editor holds its own copy, which must never go out under another jam's id.
  return <JamEditor key={jam.data.id} jam={jam.data} />;
}

/** The editor's shape while the jam loads (DESIGN.md §4.29): bar, flyer, title, blocks. */
function EditorSkeleton() {
  return (
    <Loading className="pb-10">
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-content justify-between px-4 py-2.5 md:px-6 lg:px-8">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
        </div>
      </div>
      <div className="mx-auto max-w-content pt-6 lg:grid lg:grid-cols-[420px_1fr] lg:gap-14 lg:px-8">
        <div className="px-4 md:px-6 lg:px-0">
          <Skeleton className="aspect-[4/5] rounded-lg" />
        </div>
        <div className="flex max-w-prose flex-col gap-4 px-4 pt-6 md:px-6 lg:px-0 lg:pt-0">
          <Skeleton className="h-12 w-3/4 rounded-lg" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    </Loading>
  );
}

function JamEditor({ jam }: { jam: Jam }) {
  const { t } = useTranslation();
  const draft = useJamAutosave(jam);
  const battles = useBattles(jam.id);
  const staff = useStaff(jam.id);
  const [open, setOpen] = useState<Block | null>(null);
  // The checklist waits for the battles, so it never says "3 of 4" for a moment.
  const items = battles.data && checklist(jam, battles.data.length);
  const chip = countdown(jam, firstStart(battles.data ?? []), new Date());
  const isDraft = jam.status === "draft";
  const broken = brokenSpot(draft.errors);
  // A block with a refused field stays open, so its error can't hide behind a closed card.
  const isOpen = (name: Block) => open === name || broken === name;

  // "Add" on the checklist and "Fix" in the bar: open the block and bring it into view.
  const jump = (spot: Spot | NonNullable<ChecklistItem["block"]>) => {
    if (spot !== "battles" && spot !== "title") setOpen(spot);
    document
      .getElementById(spot)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const block = (name: Block) => ({
    draft,
    open: isOpen(name),
    onOpen: () => setOpen(name),
    onClose: () => setOpen(null),
  });

  return (
    <div className="lg:pb-20">
      <title>{`${jam.name} · ${t("pages.orgJamEdit")} · BreakingJam`}</title>
      <EditorBar
        jam={jam}
        state={draft.state}
        items={items}
        action={broken ? "fix" : "retry"}
        onFix={() => (broken ? jump(broken) : draft.retry())}
      />
      <div className="mx-auto max-w-content pt-6 lg:grid lg:grid-cols-[420px_1fr] lg:gap-14 lg:px-8">
        <aside className="flex flex-col gap-4 px-4 md:px-6 lg:sticky lg:top-[145px] lg:self-start lg:px-0">
          <div className="relative">
            <JamFlyer jam={jam} className="rounded-lg" />
            <FlyerOverlay jam={jam} />
          </div>
          {!isDraft && <StatusActions jam={jam} />}
          {isDraft && items && (
            <div className="hidden lg:block">
              <PublishCard jam={jam} items={items} onJump={jump} />
            </div>
          )}
        </aside>

        <div className="flex max-w-prose flex-col gap-6 px-4 pt-6 pb-10 md:px-6 lg:px-0 lg:pt-0">
          {isDraft && jam.review_note && (
            <InlineNotice actionable>
              {t("org.status.sentBack", { note: jam.review_note })}
            </InlineNotice>
          )}
          <div className="flex flex-col gap-3">
            {chip && <CountdownChip value={chip} />}
            <TitleField draft={draft} />
            <DateChips draft={draft} onOpen={() => setOpen("dates")} />
            {isOpen("dates") && (
              <DatesBlock draft={draft} onClose={() => setOpen(null)} />
            )}
          </div>
          <VenueBlock {...block("venue")} />
          <BattlesEditor jam={jam} />
          <LineupBlock
            jam={jam}
            staff={staff.data}
            open={open === "lineup"}
            onOpen={() => setOpen("lineup")}
          />
          <AboutBlock {...block("about")} />
          <LinksBlock {...block("links")} />
          <OrganizerCard jam={jam} />
          <p className="flex items-center gap-2 text-body-sm text-muted">
            <Eye size={16} weight="bold" aria-hidden className="shrink-0" />
            {t("org.editor.emptyNote")}
          </p>
          {isDraft && <DeleteJamButton jam={jam} className="self-start" />}
        </div>
      </div>
      {isDraft && items && <PublishBar jam={jam} items={items} onJump={jump} />}
    </div>
  );
}

/** The name as the page's title, with an Edit pill; editing turns it into a field in place. */
function TitleField({ draft }: { draft: JamDraft }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const text = "font-display text-display-lg break-words lg:text-display-2xl";
  // A jam always has a name: the field stays until it does.
  const leave = () => draft.values.name.trim() && setEditing(false);
  if (editing) {
    return (
      <div id="title" className="flex scroll-mt-36 flex-col gap-2">
        <input
          autoFocus
          aria-label={t("org.fields.name")}
          value={draft.values.name}
          maxLength={200}
          onChange={(e) => draft.set({ name: e.target.value })}
          onBlur={leave}
          onKeyDown={(e) => e.key === "Enter" && leave()}
          className={`w-full rounded-lg border-2 border-primary bg-surface px-3 py-1 text-text ${text}`}
        />
        {draft.errors.name && (
          <p className="text-caption font-bold text-danger">
            {draft.errors.name}
          </p>
        )}
      </div>
    );
  }
  return (
    <div id="title" className="group relative scroll-mt-36">
      <h1
        className={`rounded-lg border border-dashed border-border-strong px-3 py-1 ${text}`}
      >
        {draft.values.name}
      </h1>
      <button
        type="button"
        aria-label={t("org.editor.editName")}
        onClick={() => setEditing(true)}
        className="absolute -top-3 right-3 inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-text px-3 text-caption font-bold text-bg transition-opacity duration-fast lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
      >
        <PencilSimple size={12} weight="bold" aria-hidden />
        {t("org.editor.edit")}
      </button>
    </div>
  );
}

/** The dates as chips: the days, "+ Last day" until there is one, the hours or "+ Times". */
function DateChips({ draft, onOpen }: { draft: JamDraft; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const { starts_on, ends_on, opens_at, closes_at } = draft.values;
  const days = formatShortDateRange(
    starts_on,
    ends_on || starts_on,
    i18n.language,
  );
  const hours = opens_at
    ? [
        formatTime(opens_at, i18n.language),
        closes_at && formatTime(closes_at, i18n.language),
      ]
        .filter(Boolean)
        .join("–")
    : null;
  const chip =
    "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border-strong px-3 text-body-sm font-bold text-text transition-colors duration-fast hover:bg-surface-raised";
  const icon = { size: 16, weight: "bold" as const, "aria-hidden": true };
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onOpen} className={chip}>
        <CalendarBlank {...icon} />
        {days}
      </button>
      {!ends_on && (
        <button
          type="button"
          onClick={onOpen}
          className={`${chip} border-dashed text-muted`}
        >
          <Plus {...icon} />
          {t("org.editor.lastDay")}
        </button>
      )}
      <button
        type="button"
        onClick={onOpen}
        className={`${chip} ${hours ? "" : "border-dashed text-muted"}`}
      >
        {hours ? <Clock {...icon} /> : <Plus {...icon} />}
        {hours ?? t("org.editor.times")}
      </button>
    </div>
  );
}

/** Judges, DJs and MCs: "+ Add" until someone is listed or the organiser opens it. */
function LineupBlock({
  jam,
  staff,
  open,
  onOpen,
}: {
  jam: Jam;
  staff: Schemas["StaffMember"][] | undefined;
  open: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const icon = <UsersThree size={20} weight="bold" />;
  if (!staff) return null;
  if (staff.length === 0 && !open) {
    return (
      <EmptyBlock
        id="lineup"
        icon={icon}
        title={t("jam.lineup")}
        hint={t("org.blocks.lineupHint")}
        onAdd={onOpen}
      />
    );
  }
  return (
    <BlockCard id="lineup" icon={icon} title={t("jam.lineup")}>
      <Lineup jamId={jam.id} staff={staff} canEdit />
    </BlockCard>
  );
}
