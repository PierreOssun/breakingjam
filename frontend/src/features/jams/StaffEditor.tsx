import { X } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { InlineEmpty } from "../../components/InlineEmpty";
import { SelectField } from "../../components/SelectField";
import { useToast } from "../../components/useToast";
import { DancerPicker } from "../dancers/DancerPicker";
import { useStaff } from "./queries";

type Role = Schemas["StaffRole"];
const ROLES: Role[] = ["judge", "dj", "mc", "organizer", "other"];

/** Judges, DJ, MC and hosts: each change saves the whole list (`PUT /events/{id}/staff`). */
export function StaffEditor({ jamId }: { jamId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const staff = useStaff(jamId);
  const [role, setRole] = useState<Role>("judge");
  const list = staff.data ?? [];

  const save = useMutation({
    mutationFn: async (next: Schemas["StaffAssignment"][]) => {
      const { data, error } = await api.PUT("/api/events/{id}/staff", {
        params: { path: { id: jamId } },
        body: next,
      });
      if (!data) throw new Error(error?.error.message ?? t("errors.generic"));
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["event", jamId, "staff"], data);
      toast({ kind: "success", message: t("org.staff.saved") });
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });
  const assignments = list.map((s) => ({
    dancer_id: s.dancer.id,
    role: s.role,
  }));

  return (
    <section aria-labelledby="staff-title" className="flex flex-col gap-4">
      <h2 id="staff-title" className="font-display text-display-md">
        {t("jam.lineup")}
      </h2>
      {staff.data && list.length === 0 && (
        <InlineEmpty>{t("org.staff.none")}</InlineEmpty>
      )}
      {ROLES.map((r) => {
        const people = list.filter((s) => s.role === r);
        if (people.length === 0) return null;
        return (
          <div key={r} className="flex flex-col gap-2">
            <h3 className="text-label text-muted uppercase">
              {t(`jam.roles.${r}`)}
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {people.map(({ dancer }) => (
                <li
                  key={dancer.id}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border-strong pr-1 pl-3.5 text-body-sm font-bold"
                >
                  {dancer.dancer_name}
                  <button
                    type="button"
                    aria-label={t("org.staff.remove", {
                      name: dancer.dancer_name,
                      role: t(`dancer.roles.${r}`),
                    })}
                    disabled={save.isPending}
                    onClick={() =>
                      save.mutate(
                        assignments.filter(
                          (a) => !(a.dancer_id === dancer.id && a.role === r),
                        ),
                      )
                    }
                    className="grid size-7 cursor-pointer place-items-center rounded-full hover:bg-surface-raised"
                  >
                    <X size={14} weight="bold" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <SelectField
          label={t("org.staff.role")}
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`dancer.roles.${r}`)}
            </option>
          ))}
        </SelectField>
        <DancerPicker
          label={t("org.staff.add")}
          selected={[]}
          max={1}
          onChange={([dancer]) =>
            dancer &&
            save.mutate([...assignments, { dancer_id: dancer.id, role }])
          }
        />
      </div>
    </section>
  );
}
