import { X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { Flag } from "../../components/Flag";
import { OptionalLabel } from "../../components/OptionalLabel";
import { SearchPicker } from "../../components/SearchPicker";
import { SelectField } from "../../components/SelectField";
import { TextField } from "../../components/TextField";
import { VerifiedTick } from "../../components/VerifiedTick";
import { countryOptions } from "../../lib/countries";
import { toHandle } from "../../lib/instagram";
import { searchDancers } from "./search";

type DancerRef = Schemas["DancerRef"];

type DancerPickerProps = {
  label: string;
  selected: DancerRef[];
  onChange: (dancers: DancerRef[]) => void;
  /** How many dancers fit; the search hides once they are all chosen. */
  max: number;
};

/** Chosen dancers as removable chips, then search-before-create for more (§1, §6). */
export function DancerPicker({
  label,
  selected,
  onChange,
  max,
}: DancerPickerProps) {
  const { t } = useTranslation();
  const add = (dancer: DancerRef) => onChange([...selected, dancer]);
  return (
    <div className="flex flex-col gap-3">
      {selected.length > 0 && (
        <ul aria-label={label} className="flex flex-wrap gap-1.5">
          {selected.map((dancer) => (
            <li
              key={dancer.id}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface-raised pr-1 pl-3 text-body-sm font-bold"
            >
              <Flag code={dancer.country} size="bare" />
              {dancer.dancer_name}
              <button
                type="button"
                aria-label={t("picker.remove", { name: dancer.dancer_name })}
                onClick={() =>
                  onChange(selected.filter((d) => d.id !== dancer.id))
                }
                className="grid size-7 cursor-pointer place-items-center rounded-full hover:bg-surface"
              >
                <X size={14} weight="bold" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected.length < max && (
        <SearchPicker<Schemas["DancerSummary"]>
          label={label}
          kind="dancers"
          search={searchDancers}
          idOf={(d) => d.id}
          exclude={selected.map((d) => d.id)}
          renderItem={(d) => <DancerLine dancer={d} />}
          onPick={(d) => add(d)}
          create={{
            label: t("picker.newDancer"),
            render: (query, done) => (
              <NewDancer
                name={query}
                onCreated={(dancer) => {
                  add(dancer);
                  done();
                }}
                onCancel={done}
              />
            ),
          }}
        />
      )}
    </div>
  );
}

/** "Lil G ✓ · @lilg · FR · Floor Lords": name · @handle · country · crew (§4). */
function DancerLine({ dancer }: { dancer: Schemas["DancerSummary"] }) {
  const details = [
    dancer.instagram_handle && `@${dancer.instagram_handle}`,
    [dancer.country, dancer.country2].filter(Boolean).join("/"),
    dancer.crews.map((c) => c.name).join(", "),
    dancer.city,
  ].filter(Boolean);
  return (
    <>
      {/* Decorative here: the country code follows in words. */}
      <span aria-hidden className="contents">
        <Flag code={dancer.country} size="bare" />
      </span>
      <span className="font-bold">{dancer.dancer_name}</span>
      {dancer.verified && <VerifiedTick />}
      <span className="min-w-0 truncate text-muted">
        · {details.join(" · ")}
      </span>
    </>
  );
}

/** Name, country and handle: enough for a dancer page the dancer can claim later. */
function NewDancer({
  name: initialName,
  onCreated,
  onCancel,
}: {
  name: string;
  onCreated: (dancer: DancerRef) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState(initialName);
  const [country, setCountry] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const countries = useMemo(
    () => countryOptions(i18n.language),
    [i18n.language],
  );

  async function create() {
    if (!name.trim() || !country) {
      setError(t("picker.nameAndCountry"));
      return;
    }
    setSaving(true);
    const body = {
      dancer_name: name.trim(),
      country,
      instagram_handle: toHandle(handle) || null,
    };
    const { data, error, response } = await api.POST("/api/dancers", { body });
    setSaving(false);
    if (data) return onCreated(data);
    setError(
      response.status === 409
        ? t("picker.handleTaken")
        : (error?.error.fields?.[0]?.message ?? t("errors.generic")),
    );
  }

  return (
    <div
      role="group"
      aria-label={t("picker.newDancer")}
      className="flex flex-col gap-4 rounded-lg border border-dashed border-border-strong p-4"
    >
      <TextField
        label={t("picker.dancerName")}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      />
      <SelectField
        label={t("org.fields.country")}
        value={country}
        onChange={(e) => setCountry(e.target.value)}
      >
        <option value="">{t("org.fields.choose")}</option>
        {countries.map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </SelectField>
      <TextField
        label={<OptionalLabel label={t("picker.instagram")} />}
        value={handle}
        placeholder="@"
        onChange={(e) => setHandle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      />
      {error && (
        <p role="alert" className="text-caption font-bold text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t("form.cancel")}
        </Button>
        <Button size="sm" loading={saving} onClick={() => void create()}>
          {t("picker.create")}
        </Button>
      </div>
    </div>
  );
}
