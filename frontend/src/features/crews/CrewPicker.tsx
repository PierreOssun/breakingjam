import { X } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { Button } from "../../components/Button";
import { SearchPicker } from "../../components/SearchPicker";
import { TextField } from "../../components/TextField";

type CrewName = Schemas["CrewName"];

async function searchCrews(q: string) {
  const { data, response } = await api.GET("/api/crews", {
    params: { query: { q, limit: 8 } },
  });
  if (!data) throw new Error(`search crews: ${response.status}`);
  return data.items;
}

/** The crew an entry represents, if any: one chip, or search-before-create (§6). */
export function CrewPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CrewName | null;
  onChange: (crew: CrewName | null) => void;
}) {
  const { t } = useTranslation();
  if (value) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-label text-text uppercase">{label}</p>
        <span className="inline-flex h-8 items-center gap-1.5 self-start rounded-full border border-border bg-surface-raised pr-1 pl-3 text-body-sm font-bold">
          {value.name}
          <button
            type="button"
            aria-label={t("picker.remove", { name: value.name })}
            onClick={() => onChange(null)}
            className="grid size-7 cursor-pointer place-items-center rounded-full hover:bg-surface"
          >
            <X size={14} weight="bold" aria-hidden />
          </button>
        </span>
      </div>
    );
  }
  return (
    <SearchPicker<Schemas["Crew"]>
      label={label}
      kind="crews"
      search={searchCrews}
      idOf={(c) => c.id}
      renderItem={(c) => (
        <>
          <span className="font-bold">{c.name}</span>
          <span className="text-muted">
            {[c.city, c.country].filter(Boolean).join(", ")}
          </span>
        </>
      )}
      onPick={(c) => onChange({ id: c.id, name: c.name })}
      create={{
        label: t("picker.newCrew"),
        render: (query, done) => (
          <NewCrew
            name={query}
            onCreated={(crew) => {
              onChange(crew);
              done();
            }}
            onCancel={done}
          />
        ),
      }}
    />
  );
}

function NewCrew({
  name: initialName,
  onCreated,
  onCancel,
}: {
  name: string;
  onCreated: (crew: CrewName) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) {
      setError(t("validation.required"));
      return;
    }
    setSaving(true);
    const { data, error } = await api.POST("/api/crews", {
      body: { name: name.trim() },
    });
    setSaving(false);
    if (data) return onCreated({ id: data.id, name: data.name });
    setError(error?.error.fields?.[0]?.message ?? t("errors.generic"));
  }

  return (
    <div
      role="group"
      aria-label={t("picker.newCrew")}
      className="flex flex-col gap-4 rounded-lg border border-dashed border-border-strong p-4"
    >
      <TextField
        label={t("picker.crewName")}
        value={name}
        error={error ?? undefined}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      />
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
