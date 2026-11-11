import { ArrowUUpLeft, Check, DiceFive, X } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { FormError } from "../../components/FormError";
import { IconButton } from "../../components/IconButton";
import { useModal } from "../../components/useModal";
import { useToast } from "../../components/useToast";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { ME_KEY, useMe } from "../auth/useMe";
import {
  AVATAR_COLOURS,
  AVATAR_OPTIONS,
  type AvatarSpec,
  randomAvatar,
} from "./avatar";
import { avatarOf } from "./avatarSeed";
import { FIGHTERS } from "./fighters";
import { PixelAvatar } from "./PixelAvatar";

type Dancer = Schemas["DancerResponse"];
type Slot = keyof typeof AVATAR_OPTIONS;
type Detail = "lashes" | "lips" | "hoops";
/** What every option needs: the avatar being built, and how to replace it. */
type Building = { spec: AvatarSpec; onChange: (next: AvatarSpec) => void };

const TABS = ["fighters", "hair", "head", "face", "outfit", "stage"] as const;
type Tab = (typeof TABS)[number];
const UNDO_STEPS = 20;

/** Every option's label, by slot then value: a value's name depends on its slot. */
function useOptionNames(): Record<Slot, Record<string, string>> {
  return useTranslation().t("avatar.options", { returnObjects: true });
}

const same = (a: AvatarSpec, b: AvatarSpec) =>
  (Object.keys(a) as (keyof AvatarSpec)[]).every((key) => a[key] === b[key]);

/**
 * The avatar builder (DESIGN.md §4.44): a full-screen sheet below lg, a two-column dialog
 * from lg. Every option is a picture of the avatar with that one change; it saves by itself.
 */
export function AvatarBuilder({
  dancer,
  onClose,
}: {
  dancer: Dancer;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const ref = useModal();
  const titleId = useId();
  const tabsId = useId();
  const wide = useMediaQuery("(min-width: 1024px)");
  const mine = useMe().data?.dancer?.id === dancer.id;
  const [saved] = useState(() => avatarOf(dancer));
  // The avatar is the last step; the ones before it are what Undo goes back to.
  const [steps, setSteps] = useState([saved]);
  const [tab, setTab] = useState<Tab>("fighters");
  const [asking, setAsking] = useState(false);
  const spec = steps.at(-1)!;
  const building: Building = {
    spec,
    onChange: (next) =>
      setSteps((before) => [...before, next].slice(-UNDO_STEPS - 1)),
  };

  const save = useMutation({
    mutationFn: () =>
      // The avatar alone: the profile, and what the Edit profile form behind holds, stay put.
      api.PUT("/api/dancers/{id}/avatar", {
        params: { path: { id: dancer.id } },
        body: { avatar: spec },
      }),
    onSuccess: ({ data }) => {
      if (!data) throw new Error("avatar not saved");
      queryClient.setQueryData(["dancer", dancer.id], data);
      // The account menu shows its owner's avatar.
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
      toast({ kind: "success", message: t("avatar.saved") });
      ref.current?.close();
    },
  });

  const requestClose = () => {
    if (same(spec, saved)) ref.current?.close();
    else setAsking(true);
  };
  const title = mine ? t("avatar.title") : t("dancerEdit.avatar");
  const saveButton = (
    <Button
      size={wide ? "md" : "sm"}
      loading={save.isPending}
      onClick={() => save.mutate()}
    >
      {wide ? t("avatar.save") : t("avatar.done")}
    </Button>
  );

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={(e) => {
        // The stale `close` of a StrictMode remount arrives once open again (Dialog).
        if (!e.currentTarget.open) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none flex-col overflow-hidden bg-bg p-0 text-text backdrop:bg-scrim open:flex lg:m-auto lg:h-[min(660px,90vh)] lg:w-[944px] lg:flex-row lg:rounded-[28px] lg:shadow-lg"
    >
      {!wide && (
        <div className="flex h-14 shrink-0 items-center gap-2 px-2">
          <IconButton label={t("dialog.close")} onClick={requestClose}>
            <X size={20} weight="bold" aria-hidden />
          </IconButton>
          <h2
            id={titleId}
            className="min-w-0 flex-1 truncate text-center font-display text-display-xs"
          >
            {title}
          </h2>
          {saveButton}
        </div>
      )}
      <Stage
        dancer={dancer}
        title={wide ? <h2 id={titleId}>{title}</h2> : null}
        sizes={wide}
        undo={
          steps.length > 1
            ? () => setSteps((before) => before.slice(0, -1))
            : undefined
        }
        {...building}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:min-w-0">
        <div className="flex-1 overflow-y-auto">
          <div
            role="tablist"
            aria-labelledby={titleId}
            className="flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pt-4 pb-1 lg:px-7 lg:pt-6"
            onKeyDown={(e) => {
              const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
              if (!step) return;
              const next =
                TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length]!;
              setTab(next);
              document.getElementById(`${tabsId}${next}`)?.focus();
            }}
          >
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                id={`${tabsId}${name}`}
                aria-selected={name === tab}
                aria-controls={`${tabsId}panel`}
                tabIndex={name === tab ? 0 : -1}
                onClick={() => setTab(name)}
                className={`h-11 shrink-0 rounded-full px-[18px] text-body-sm font-bold transition-colors duration-fast ${
                  name === tab
                    ? "bg-text text-bg"
                    : "bg-surface-raised text-muted hover:text-text"
                }`}
              >
                {t(`avatar.tabs.${name}`)}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`${tabsId}panel`}
            aria-labelledby={`${tabsId}${tab}`}
            className="flex flex-col gap-6 px-4 pt-4 pb-8 lg:px-7"
          >
            <Options tab={tab} {...building} />
          </div>
        </div>
        {(wide || asking || save.isError) && (
          <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-surface px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] lg:px-7 lg:pb-5">
            <FormError
              message={save.isError ? t("avatar.failed") : undefined}
            />
            {asking ? (
              <div className="flex flex-wrap items-center justify-end gap-3">
                <p
                  role="alert"
                  className="w-full text-body font-bold lg:mr-auto lg:w-auto"
                >
                  {t("form.discard")}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  autoFocus
                  onClick={() => setAsking(false)}
                >
                  {t("avatar.keep")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => ref.current?.close()}
                >
                  {t("avatar.discard")}
                </Button>
              </div>
            ) : (
              wide && (
                <div className="flex justify-end gap-3">
                  <Button variant="ghost" onClick={requestClose}>
                    {t("form.cancel")}
                  </Button>
                  {saveButton}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}

const STAGE_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#fff]/25 bg-[#fff]/10 text-body-sm font-bold text-[#fff] transition-colors duration-fast not-disabled:hover:bg-[#fff]/20 disabled:cursor-not-allowed disabled:opacity-40";

/** The preview, as a fighter-select screen: the same dark stage in both themes. */
function Stage({
  dancer,
  title,
  sizes,
  undo,
  spec,
  onChange,
}: Building & {
  dancer: Dancer;
  title: ReactNode;
  /** Also the avatar at the sizes the site shows it. */
  sizes: boolean;
  /** Absent when there is no step to go back to. */
  undo?: () => void;
}) {
  const { t } = useTranslation();
  const names = useOptionNames();
  const option = (slot: Slot) => names[slot][spec[slot]];
  const parts = [
    option("style"),
    option("hair"),
    spec.head !== "none" && option("head"),
    option("outfit"),
  ].filter(Boolean);
  const [role] = dancer.titles;
  const tagline = [role && t(`dancer.titles.${role}`), dancer.crews[0]?.name]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="relative flex shrink-0 flex-col items-center gap-4 overflow-hidden bg-[linear-gradient(160deg,#101a4d,#2a1660)] px-4 pt-6 pb-5 text-[#fff] short:grid short:grid-cols-[auto_minmax(0,1fr)] short:justify-items-start short:gap-x-4 short:gap-y-2 short:py-4 lg:w-[300px] lg:justify-start lg:px-6 lg:pt-7">
      <div
        aria-hidden
        className="pointer-events-none absolute top-28 left-1/2 size-[640px] -translate-1/2 rounded-full bg-[repeating-radial-gradient(circle_at_center,transparent_0_31px,rgb(255_255_255/0.06)_31px_32px)]"
      />
      {title && (
        <div className="relative self-start font-display text-display-sm">
          {title}
        </div>
      )}
      <div className="relative short:row-span-2">
        <PixelAvatar
          spec={spec}
          label={t("avatar.alt", { parts: parts.join(", ").toLowerCase() })}
          className="block size-[156px] overflow-hidden rounded-[28%] shadow-lg lg:size-[184px] short:size-24"
        />
        <span
          aria-hidden
          className="absolute -top-2 -left-3 -rotate-6 rounded-sm bg-primary px-2 py-0.5 font-display text-[11px] font-bold text-[#fff]"
        >
          P1
        </span>
      </div>
      <div className="relative max-w-full -skew-x-[10deg] rounded-sm bg-[#000] px-4 py-2">
        <p className="flex skew-x-[10deg] flex-wrap items-baseline justify-center gap-x-2 text-center">
          <span className="line-clamp-2 font-display text-[18px] leading-6 short:text-[15px] font-extrabold wrap-anywhere uppercase">
            {dancer.dancer_name}
          </span>
          {tagline && (
            <span className="text-[11px] font-bold tracking-wider text-[#b49bff] uppercase">
              {tagline}
            </span>
          )}
        </p>
      </div>
      <div className="relative flex gap-2">
        <button
          type="button"
          className={`${STAGE_BUTTON} px-[14px] whitespace-nowrap`}
          onClick={() => onChange(randomAvatar())}
        >
          <DiceFive size={20} weight="bold" aria-hidden />
          {/* Beside a 96px avatar on a 320px phone there is room for the dice alone. */}
          <span className="max-[359px]:sr-only">{t("avatar.surprise")}</span>
        </button>
        <button
          type="button"
          aria-label={t("avatar.undo")}
          disabled={!undo}
          className={`${STAGE_BUTTON} w-11`}
          onClick={undo}
        >
          <ArrowUUpLeft size={20} weight="bold" aria-hidden />
        </button>
      </div>
      {sizes && (
        <div className="relative mt-2 flex items-end gap-5 text-caption text-[#fff]/70">
          {(
            [
              ["page", "size-14 rounded-[16px]"],
              ["menu", "size-9 rounded-[11px]"],
              ["results", "size-[22px] rounded-[7px]"],
            ] as const
          ).map(([where, shape]) => (
            <div key={where} className="flex flex-col items-center gap-2">
              <PixelAvatar
                spec={spec}
                className={`block overflow-hidden border border-[#fff]/40 ${shape}`}
              />
              {t(`avatar.sizes.${where}`)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A tab's groups of options. */
function Options({ tab, ...building }: Building & { tab: Tab }) {
  const { t } = useTranslation();
  switch (tab) {
    case "fighters":
      return (
        <Group label={t("avatar.groups.fighters")} grid="fighters">
          <Fighters label={t("avatar.groups.fighters")} {...building} />
        </Group>
      );
    case "hair":
      return (
        <>
          <Group label={t("avatar.groups.style")}>
            <Choice
              slot="style"
              label={t("avatar.groups.style")}
              {...building}
            />
          </Group>
          <Group label={t("avatar.groups.colour")} grid="swatches">
            <Swatches
              slot="hair"
              label={t("avatar.groups.colour")}
              {...building}
            />
          </Group>
        </>
      );
    case "head":
      return (
        <>
          <Group label={t("avatar.groups.headgear")}>
            <Choice
              slot="head"
              label={t("avatar.groups.headgear")}
              {...building}
            />
          </Group>
          <Group label={t("avatar.groups.colour")} grid="swatches">
            <Swatches
              slot="accent"
              label={t("avatar.groups.colour")}
              {...building}
            />
          </Group>
        </>
      );
    case "face":
      return (
        <>
          <Group label={t("avatar.groups.skin")} grid="swatches">
            <Swatches
              slot="skin"
              label={t("avatar.groups.skin")}
              {...building}
            />
          </Group>
          <Group label={t("avatar.groups.expression")}>
            <Choice
              slot="brows"
              label={t("avatar.groups.brows")}
              {...building}
            />
            <Choice
              slot="mouth"
              label={t("avatar.groups.mouth")}
              {...building}
            />
          </Group>
          <Group label={t("avatar.groups.faceItem")}>
            <Choice
              slot="face"
              label={t("avatar.groups.faceItem")}
              {...building}
            />
          </Group>
          <Group label={t("avatar.groups.details")}>
            <Toggle detail="lashes" {...building} />
            <Toggle detail="lips" {...building} />
          </Group>
        </>
      );
    case "outfit":
      return (
        <>
          <Group label={t("avatar.groups.top")}>
            <Choice
              slot="outfit"
              label={t("avatar.groups.top")}
              {...building}
            />
          </Group>
          <Group label={t("avatar.groups.colour")} grid="swatches">
            <Swatches
              slot="cloth"
              label={t("avatar.groups.colour")}
              {...building}
            />
          </Group>
          <Group label={t("avatar.groups.trim")} grid="swatches">
            <Swatches
              slot="accent"
              label={t("avatar.groups.trim")}
              {...building}
            />
          </Group>
          <Group label={t("avatar.groups.accessory")}>
            <Choice
              slot="extra"
              label={t("avatar.groups.accessory")}
              {...building}
            />
            <Toggle detail="hoops" {...building} />
          </Group>
        </>
      );
    case "stage":
      return (
        <>
          <Group label={t("avatar.groups.effect")}>
            <Choice slot="fx" label={t("avatar.groups.effect")} {...building} />
          </Group>
          <Group label={t("avatar.groups.colour")} grid="swatches">
            <Swatches
              slot="bg"
              label={t("avatar.groups.colour")}
              {...building}
            />
          </Group>
        </>
      );
  }
}

const GRIDS = {
  thumbs: "grid grid-cols-4 gap-x-2 gap-y-3 lg:grid-cols-7",
  fighters: "grid grid-cols-3 gap-x-2 gap-y-4 lg:grid-cols-6",
  swatches: "flex flex-wrap gap-x-1 gap-y-3",
};

function Group({
  label,
  grid = "thumbs",
  children,
}: {
  label: string;
  grid?: keyof typeof GRIDS;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-caption font-extrabold tracking-wider text-muted uppercase">
        {label}
      </h3>
      <div className={GRIDS[grid]}>{children}</div>
    </section>
  );
}

// `contents`: the options sit in the group's grid, beside another choice's or a toggle.
const RADIOS = { role: "radiogroup", className: "contents" } as const;
const FOCUS =
  "peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus";

/** One slot's values, each drawn on the avatar being built. */
function Choice({
  slot,
  label,
  spec,
  onChange,
}: Building & { slot: Slot; label: string }) {
  const name = useId();
  const names = useOptionNames()[slot];
  // Kept while the avatar stays the same, so the pictures are not drawn again.
  const options = useMemo(
    () =>
      AVATAR_OPTIONS[slot].map((value) => ({
        value,
        picture: { ...spec, [slot]: value } as AvatarSpec,
      })),
    [slot, spec],
  );
  return (
    <div {...RADIOS} aria-label={label}>
      {options.map(({ value, picture }) => (
        <Thumb
          key={value}
          input={{ type: "radio", name }}
          label={names[value]!}
          checked={spec[slot] === value}
          picture={picture}
          onPick={() => onChange(picture)}
        />
      ))}
    </div>
  );
}

/** A detail that is on or off, drawn switched on. */
function Toggle({ detail, spec, onChange }: Building & { detail: Detail }) {
  const { t } = useTranslation();
  const picture = useMemo(() => ({ ...spec, [detail]: true }), [detail, spec]);
  return (
    <Thumb
      input={{ type: "checkbox" }}
      label={t(`avatar.details.${detail}`)}
      checked={spec[detail]}
      picture={picture}
      onPick={() => onChange({ ...spec, [detail]: !spec[detail] })}
    />
  );
}

/** The starter fighters: picking one replaces the whole avatar. */
function Fighters({ label, spec, onChange }: Building & { label: string }) {
  const name = useId();
  return (
    <div {...RADIOS} aria-label={label}>
      {FIGHTERS.map((fighter) => (
        <Thumb
          key={fighter.name}
          input={{ type: "radio", name }}
          label={fighter.name}
          checked={same(spec, fighter.avatar)}
          picture={fighter.avatar}
          onPick={() => onChange(fighter.avatar)}
          fighter
        />
      ))}
    </div>
  );
}

/** A thumbnail option (§4.44): the picture, its label, and a check badge when picked. */
function Thumb({
  input,
  label,
  checked,
  picture,
  onPick,
  fighter = false,
}: {
  input: { type: "radio"; name: string } | { type: "checkbox" };
  label: string;
  checked: boolean;
  picture: AvatarSpec;
  onPick: () => void;
  /** Larger, its name in display caps. */
  fighter?: boolean;
}) {
  return (
    // `relative`: the hidden input stays in its label; loose in the dialog, focusing it scrolls the sheet.
    <label className="relative flex cursor-pointer flex-col items-center gap-1 text-center">
      <input
        {...input}
        checked={checked}
        onChange={onPick}
        className="peer sr-only"
      />
      <span
        className={`relative border-2 p-[3px] ${FOCUS} ${
          fighter
            ? "w-full max-w-[102px] rounded-[30px]"
            : "w-full max-w-[72px] rounded-[22px]"
        } ${checked ? "border-primary" : "border-transparent"}`}
      >
        <PixelAvatar
          spec={picture}
          // As wide as its column allows, up to its size: a 320px phone has less.
          className={`block aspect-square w-full overflow-hidden ${
            fighter ? "rounded-[25px]" : "rounded-[17px]"
          }`}
        />
        {checked && (
          <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border-2 border-bg bg-primary text-on-primary">
            <Check size={10} weight="bold" aria-hidden />
          </span>
        )}
      </span>
      <span
        className={`text-caption ${
          fighter
            ? "font-display font-bold text-text uppercase"
            : checked
              ? "font-extrabold text-text"
              : "font-bold text-muted"
        }`}
      >
        {label}
      </span>
    </label>
  );
}

/** One slot's colours as round swatches. */
function Swatches({
  slot,
  label,
  spec,
  onChange,
}: Building & { slot: keyof typeof AVATAR_COLOURS; label: string }) {
  const name = useId();
  const colours: Record<string, readonly string[]> = AVATAR_COLOURS[slot];
  const names = useOptionNames()[slot];
  return (
    <div {...RADIOS} aria-label={label}>
      {AVATAR_OPTIONS[slot].map((value) => {
        const checked = spec[slot] === value;
        return (
          <label
            key={value}
            className="relative flex w-14 cursor-pointer flex-col items-center gap-1 text-center"
          >
            <input
              type="radio"
              name={name}
              checked={checked}
              onChange={() => onChange({ ...spec, [slot]: value })}
              className="peer sr-only"
            />
            <span
              className={`rounded-full border-2 p-[3px] ${FOCUS} ${
                checked ? "border-primary" : "border-transparent"
              }`}
            >
              <span
                className="block size-[34px] rounded-full border border-border-strong"
                style={{ backgroundColor: colours[value]![0] }}
              />
            </span>
            <span
              className={`text-caption ${
                checked ? "font-extrabold text-text" : "font-bold text-muted"
              }`}
            >
              {names[value]}
            </span>
          </label>
        );
      })}
    </div>
  );
}
