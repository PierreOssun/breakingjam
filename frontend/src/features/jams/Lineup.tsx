import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Schemas } from "../../api/client";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/useToast";
import { AddChip, DancerChip } from "../dancers/DancerChip";
import { DancerPicker } from "../dancers/DancerPicker";

type Role = Schemas["StaffRole"];
const ROLES: Role[] = ["judge", "dj", "mc", "organizer", "other"];

type LineupProps = {
  jamId: string;
  staff: Schemas["StaffMember"][];
  /** The jam's organiser: every role with an add chip, and a remove button on each person. */
  canEdit: boolean;
};

/** Judges, DJ, MC and hosts as dancer chips; each change saves the whole list. */
export function Lineup({ jamId, staff, canEdit }: LineupProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<Role | null>(null);
  const assignments = staff.map((s) => ({
    dancer_id: s.dancer.id,
    role: s.role,
  }));

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
      setAdding(null);
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });

  return (
    // Stacked on phones; side by side from lg (Judges | DJ | MC).
    <div className="flex flex-col gap-5 lg:flex-row lg:flex-wrap lg:gap-x-10">
      {ROLES.map((role) => {
        const people = staff.filter((s) => s.role === role);
        if (people.length === 0 && !canEdit) return null;
        return (
          <div key={role}>
            <h3 className="mb-2 text-label text-muted uppercase">
              {t(`jam.roles.${role}`)}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {people.map(({ dancer }) => (
                <li key={dancer.id}>
                  <DancerChip
                    dancer={dancer}
                    remove={
                      canEdit
                        ? {
                            label: t("org.staff.remove", {
                              name: dancer.dancer_name,
                              role: t(`dancer.roles.${role}`),
                            }),
                            disabled: save.isPending,
                            onClick: () =>
                              save.mutate(
                                assignments.filter(
                                  (a) =>
                                    !(
                                      a.dancer_id === dancer.id &&
                                      a.role === role
                                    ),
                                ),
                              ),
                          }
                        : undefined
                    }
                  />
                </li>
              ))}
              {canEdit && (
                <li>
                  <AddChip
                    label={t(`org.staff.addRole.${role}`)}
                    onClick={() => setAdding(role)}
                  />
                </li>
              )}
            </ul>
          </div>
        );
      })}
      {adding && (
        <Dialog
          onClose={() => setAdding(null)}
          size="form"
          title={t(`org.staff.addRole.${adding}`)}
        >
          <DancerPicker
            label={t("org.entries.dancer")}
            selected={[]}
            max={1}
            onChange={([dancer]) =>
              // The picker stays open while the save runs: one pick, one save.
              dancer &&
              !save.isPending &&
              save.mutate([
                ...assignments,
                { dancer_id: dancer.id, role: adding },
              ])
            }
          />
        </Dialog>
      )}
    </div>
  );
}
