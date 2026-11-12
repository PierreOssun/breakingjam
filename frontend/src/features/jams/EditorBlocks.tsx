import {
  CalendarBlank,
  LinkSimple,
  TextAlignLeft,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/Button";
import { FormError } from "../../components/FormError";
import { OptionalLabel } from "../../components/OptionalLabel";
import { SelectField } from "../../components/SelectField";
import { TextAreaField } from "../../components/TextAreaField";
import { TextField } from "../../components/TextField";
import { BlockCard, EditorBlock, SummaryLines } from "./EditorBlock";
import { timezones } from "./jamFields";
import type { JamDraft } from "./useAutosave";

/** What every block that opens and closes takes. */
export type BlockProps = {
  draft: JamDraft;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
};

const ICON = { size: 20, weight: "bold" as const };

/** The date field a date chip opens the Dates block on. */
export type DateField = "starts_on" | "ends_on" | "opens_at";

/** First and last day, opening hours and timezone; opened from the date chips, so never empty. */
export function DatesBlock({
  draft,
  focus,
  onClose,
}: Pick<BlockProps, "draft" | "onClose"> & { focus: DateField }) {
  const { t } = useTranslation();
  // About 400 names: not rebuilt on each keystroke in the block.
  const zone = draft.values.timezone;
  const zones = useMemo(() => timezones(zone), [zone]);
  return (
    <BlockCard
      id="dates"
      icon={<CalendarBlank {...ICON} />}
      title={t("org.blocks.dates")}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField
          type="date"
          label={t("org.fields.startsOn")}
          autoFocus={focus === "starts_on"}
          {...draft.field("starts_on")}
        />
        <TextField
          type="date"
          label={<OptionalLabel label={t("org.fields.endsOn")} />}
          hint={t("org.fields.endsOnHint")}
          min={draft.values.starts_on}
          autoFocus={focus === "ends_on"}
          {...draft.field("ends_on")}
        />
        <TextField
          type="time"
          label={<OptionalLabel label={t("org.fields.opensAt")} />}
          autoFocus={focus === "opens_at"}
          {...draft.field("opens_at")}
        />
        <TextField
          type="time"
          label={<OptionalLabel label={t("org.fields.closesAt")} />}
          {...draft.field("closes_at")}
        />
      </div>
      <SelectField
        label={t("org.fields.timezone")}
        hint={t("org.fields.timezoneHint")}
        {...draft.field("timezone")}
      >
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll("_", " ")}
          </option>
        ))}
      </SelectField>
      <FormError message={draft.errors.root} />
      <Button
        variant="secondary"
        className="w-full lg:w-auto lg:self-start"
        onClick={onClose}
      >
        {t("org.editor.done")}
      </Button>
    </BlockCard>
  );
}

/** The organiser's pitch, up to 200 characters. */
export function AboutBlock({ draft, open, onOpen, onClose }: BlockProps) {
  const { t } = useTranslation();
  const text = draft.values.description;
  return (
    <EditorBlock
      id="about"
      icon={<TextAlignLeft {...ICON} />}
      title={t("jam.about")}
      hint={t("org.blocks.aboutHint")}
      summary={text.trim() && <p className="whitespace-pre-line">{text}</p>}
      open={open}
      onOpen={onOpen}
      onClose={onClose}
    >
      <TextAreaField
        label={t("org.fields.description")}
        rows={3}
        counter={{ length: text.length, max: 200 }}
        data-autofocus
        {...draft.field("description")}
      />
    </EditorBlock>
  );
}

/** Website, Instagram, the registration link and the public contact email. */
export function LinksBlock({ draft, open, onOpen, onClose }: BlockProps) {
  const { t } = useTranslation();
  const { values } = draft;
  const summary = [
    values.website_url,
    values.instagram_url,
    values.registration_url,
    values.contact_email,
  ]
    .map((value) => value.trim())
    .filter(Boolean);
  return (
    <EditorBlock
      id="links"
      icon={<LinkSimple {...ICON} />}
      title={t("org.blocks.links")}
      hint={t("org.blocks.linksHint")}
      summary={summary.length > 0 && <SummaryLines lines={summary} />}
      open={open}
      onOpen={onOpen}
      onClose={onClose}
    >
      <TextField
        type="url"
        label={<OptionalLabel label={t("org.fields.websiteUrl")} />}
        placeholder="https://"
        {...draft.field("website_url")}
      />
      <TextField
        type="url"
        // Not "optional": this or the email is needed to publish, as both hints say.
        label={t("org.fields.instagramUrl")}
        hint={t("org.fields.instagramUrlHint")}
        placeholder="https://www.instagram.com/"
        {...draft.field("instagram_url")}
      />
      <TextField
        type="url"
        label={<OptionalLabel label={t("org.fields.registrationUrl")} />}
        hint={t("org.fields.registrationUrlHint")}
        placeholder="https://"
        {...draft.field("registration_url")}
      />
      <TextField
        type="email"
        autoComplete="email"
        label={t("org.fields.contactEmail")}
        hint={t("org.fields.contactEmailHint")}
        {...draft.field("contact_email")}
      />
      <FormError message={draft.errors.root} />
    </EditorBlock>
  );
}
