import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { splitFieldErrors } from "../../lib/apiErrors";
import { Button } from "../../components/Button";
import { CountrySelect } from "../../components/CountrySelect";
import { Flag } from "../../components/Flag";
import { OptionalLabel } from "../../components/OptionalLabel";
import { RemovableChip } from "../../components/RemovableChip";
import { SearchPicker } from "../../components/SearchPicker";
import { TextField } from "../../components/TextField";
import { VerifiedTick } from "../../components/VerifiedTick";
import { toHandle } from "../../lib/instagram";
import { ME_KEY } from "../auth/useMe";
import { searchDancers } from "./search";

type DancerRef = Schemas["DancerRef"];
// Search and creation only ever give a live dancer.
type LiveDancer = Omit<DancerRef, "deleted">;

type DancerPickerProps = {
  label: string;
  selected: DancerRef[];
  onChange: (dancers: DancerRef[]) => void;
  /** How many dancers fit; the search hides once they are all chosen. */
  max: number;
  /** The dialog opened to pick: its search takes the focus. */
  autoFocus?: boolean;
};

/** Chosen dancers as removable chips, then search-before-create for more (§1, §6). */
export function DancerPicker({
  label,
  selected,
  onChange,
  max,
  autoFocus,
}: DancerPickerProps) {
  const { t } = useTranslation();
  const add = (dancer: LiveDancer) =>
    onChange([...selected, { ...dancer, deleted: false }]);
  return (
    <div className="flex flex-col gap-3">
      {selected.length > 0 && (
        <ul aria-label={label} className="flex flex-wrap gap-1.5">
          {selected.map((dancer) => (
            <li key={dancer.id}>
              <RemovableChip
                name={dancer.dancer_name}
                onRemove={() =>
                  onChange(selected.filter((d) => d.id !== dancer.id))
                }
              >
                <Flag code={dancer.country} size="bare" />
                {dancer.dancer_name}
              </RemovableChip>
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
          autoFocus={autoFocus}
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

/** Where a new page goes: one for someone else, or the account's own (M25). */
type NewDancerRoute = "/api/dancers" | "/api/dancers/mine";

/** Name, country and handle: enough for a dancer page the dancer can claim later. */
export function NewDancer({
  name: initialName,
  route = "/api/dancers",
  label,
  onCreated,
  onCancel,
}: {
  name: string;
  route?: NewDancerRoute;
  /** Names the form for screen readers; "New dancer" by default. */
  label?: string;
  onCreated: (dancer: LiveDancer) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [country, setCountry] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    const { data, error, response } = await api
      .POST(route, { body })
      // Offline: the button must not spin for ever.
      .catch(() => ({
        data: undefined,
        error: undefined,
        response: undefined,
      }));
    setSaving(false);
    if (data) return onCreated(data);
    if (response?.status !== 409) {
      const known = ["dancer_name", "country", "instagram_handle"] as const;
      const { fields } = splitFieldErrors(error, known);
      setError(fields[0]?.[1] ?? t("errors.generic"));
    } else if (route === "/api/dancers/mine") {
      // The account may have made its page meanwhile, in another tab: reading it again moves
      // the welcome step on; without a handle, that is the only conflict there is.
      void queryClient.invalidateQueries({ queryKey: ME_KEY });
      setError(
        body.instagram_handle
          ? t("picker.handleTaken")
          : t("picker.ownPageTaken"),
      );
    } else {
      setError(t("picker.handleTaken"));
    }
  }

  return (
    <div
      role="group"
      aria-label={label ?? t("picker.newDancer")}
      className="flex flex-col gap-4 rounded-lg border border-dashed border-border-strong p-4"
    >
      <TextField
        label={t("picker.dancerName")}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
      />
      <CountrySelect
        label={t("org.fields.country")}
        blank={t("org.fields.choose")}
        value={country}
        onChange={(e) => setCountry(e.target.value)}
      />
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
