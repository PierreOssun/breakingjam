import { PencilSimple, Plus } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";

type BlockHeading = {
  id: string;
  icon: ReactNode;
  title: string;
};

type EditorBlockProps = BlockHeading & {
  /** A required block holds the jam back from publishing while empty. */
  required?: boolean;
  /** What the block is for, shown while it is empty. */
  hint: string;
  /** What is filled in, shown while closed; nothing means the block is empty. */
  summary: ReactNode;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
};

/**
 * One part of the jam page in the editor (M24): a dashed card with "+ Add" while empty, the
 * fields while open, and a summary with "Edit" once filled. Visitors only ever see filled blocks.
 */
export function EditorBlock(props: EditorBlockProps) {
  const { t } = useTranslation();
  const { id, icon, title, required, hint, summary, open } = props;
  if (open) {
    return (
      <BlockCard id={id} icon={icon} title={title}>
        {props.children}
        <Button
          variant="secondary"
          className="w-full lg:w-auto lg:self-start"
          onClick={props.onClose}
        >
          {t("org.editor.done")}
        </Button>
      </BlockCard>
    );
  }
  if (summary) {
    return (
      <section
        id={id}
        aria-labelledby={`${id}-title`}
        className="flex scroll-mt-36 flex-col gap-3 rounded-lg border border-dashed border-border-strong bg-surface p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <Title id={id} icon={icon} title={title} />
          <Button variant="ghost" size="sm" onClick={props.onOpen}>
            <PencilSimple size={16} weight="bold" aria-hidden />
            {t("org.editor.edit")}
          </Button>
        </div>
        <div className="text-body">{summary}</div>
      </section>
    );
  }
  return (
    <EmptyBlock
      id={id}
      icon={icon}
      title={title}
      required={required}
      hint={hint}
      onAdd={props.onOpen}
    />
  );
}

/** The dashed card of an empty block: what it is for, and "+ Add". */
export function EmptyBlock({
  id,
  icon,
  title,
  required = false,
  hint,
  onAdd,
}: BlockHeading & { required?: boolean; hint: string; onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex scroll-mt-36 items-center gap-4 rounded-lg border border-dashed border-border-strong p-4"
    >
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary-text"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${id}-title`} className="text-body font-extrabold">
            {title}
          </h2>
          {required && (
            <span className="rounded-md bg-accent/[.14] px-1.5 text-caption font-bold tracking-[0.04em] text-accent-text uppercase">
              {t("org.editor.required")}
            </span>
          )}
        </div>
        <p className="text-body-sm text-muted">{hint}</p>
      </div>
      <Button size="sm" onClick={onAdd}>
        <Plus size={16} weight="bold" aria-hidden />
        {t("org.editor.add")}
      </Button>
    </section>
  );
}

/** The solid card of a block being edited, or one that is always editable (battles, lineup). */
export function BlockCard({
  id,
  icon,
  title,
  children,
}: BlockHeading & { children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex scroll-mt-36 flex-col gap-5 rounded-lg border-2 border-primary bg-surface p-4 lg:p-5"
    >
      <Title id={id} icon={icon} title={title} />
      {children}
    </section>
  );
}

/** A closed block's summary: what was filled in, the first line bold, the rest muted. */
export function SummaryLines({ lines }: { lines: string[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {lines.map((line, i) => (
        <li
          key={i}
          className={`break-words ${i === 0 ? "font-bold" : "text-muted"}`}
        >
          {line}
        </li>
      ))}
    </ul>
  );
}

function Title({ id, icon, title }: BlockHeading) {
  return (
    <h2
      id={`${id}-title`}
      className="flex items-center gap-2 font-display text-display-sm"
    >
      <span aria-hidden className="text-primary-text">
        {icon}
      </span>
      {title}
    </h2>
  );
}
