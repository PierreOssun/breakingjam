import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { api, type Schemas, unwrap } from "../api/client";
import { Button } from "../components/Button";
import { ChipRow } from "../components/ChipRow";
import { Dialog } from "../components/Dialog";
import { InlineEmpty } from "../components/InlineEmpty";
import { MoreList } from "../components/MoreList";
import { SelectField } from "../components/SelectField";
import { MetaTag } from "../components/Tag";
import { TextField } from "../components/TextField";
import { useToast } from "../components/useToast";
import { formatMoment } from "../lib/dates";
import { useSearchText } from "../lib/useSearchText";

type Account = Schemas["AccountRow"];
type TeamRole = Schemas["TeamRole"];
type View = "last_seen" | "new" | "unconfirmed" | "organizers" | "team";

const VIEWS: View[] = ["last_seen", "new", "unconfirmed", "organizers", "team"];

/**
 * `/admin/accounts` (M31): accounts by last visit, newest confirmed, unconfirmed, organisers or
 * the team, searchable by email; team roles are changed from here.
 */
export function AdminAccountsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.find((v) => v === params.get("view")) ?? "last_seen";
  const [text, setText, q] = useSearchText();
  const accounts = useInfiniteQuery({
    queryKey: ["admin", "accounts", view, q],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET("/api/admin/accounts", {
          params: { query: { view, q: q || undefined, cursor: pageParam } },
        }),
        "accounts",
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const show = (next: View) =>
    setParams(
      (current) => {
        current.set("view", next);
        return current;
      },
      { replace: true },
    );

  return (
    <section aria-labelledby="accounts-title" className="flex flex-col gap-6">
      <title>{`${t("admin.accounts.title")} · ${t("admin.title")} · BreakingJam`}</title>
      <div className="flex flex-col gap-3">
        <h2 id="accounts-title" className="font-display text-display-md">
          {t("admin.accounts.title")}
        </h2>
        <p className="max-w-prose text-body text-muted">
          {t("admin.accounts.intro")}
        </p>
      </div>
      <ChipRow
        label={t("admin.accounts.view")}
        chips={VIEWS.map((v) => ({
          key: v,
          label: t(`admin.accounts.views.${v}`),
          on: v === view,
          onPick: () => show(v),
        }))}
      />
      <TextField
        type="search"
        label={t("admin.accounts.search")}
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="max-w-prose"
      />
      <MoreList
        query={accounts}
        empty={<InlineEmpty>{t("admin.accounts.none")}</InlineEmpty>}
        more={t("org.showMore")}
        className="flex flex-col gap-3"
      >
        {(account) => <AccountCard account={account} />}
      </MoreList>
    </section>
  );
}

function AccountCard({ account }: { account: Account }) {
  const { t, i18n } = useTranslation();
  const [changing, setChanging] = useState(false);
  const when = (iso: string) => formatMoment(iso, i18n.language);
  const dates = [
    t("admin.accounts.signedUp", { date: when(account.created_at) }),
    account.email_verified_at
      ? t("admin.accounts.confirmed", { date: when(account.email_verified_at) })
      : t("admin.accounts.unconfirmed"),
    account.last_seen_at
      ? t("admin.accounts.seen", { date: when(account.last_seen_at) })
      : t("admin.accounts.neverSeen"),
  ];
  const jams = [
    account.public_jams > 0 &&
      t("admin.accounts.publicJams", { count: account.public_jams }),
    account.private_jams > 0 &&
      t("admin.accounts.privateJams", { count: account.private_jams }),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a
            href={`mailto:${account.email}`}
            className="text-body font-extrabold break-all underline"
          >
            {account.email}
          </a>
          {account.role !== "user" && (
            <MetaTag>{t(`admin.accounts.roles.${account.role}`)}</MetaTag>
          )}
        </p>
        <p className="text-body-sm text-muted">
          {[account.display_name, ...dates].join(" · ")}
        </p>
        {jams.length > 0 && <p className="text-body-sm">{jams.join(" · ")}</p>}
      </div>
      {account.team_roles.length > 0 && (
        <Button
          size="sm"
          className="self-start lg:self-center"
          onClick={() => setChanging(true)}
        >
          {t("admin.accounts.changeRole")}
        </Button>
      )}
      {changing && (
        <TeamRoleDialog account={account} onClose={() => setChanging(false)} />
      )}
    </div>
  );
}

/** The account's place on the team, as `PUT /admin/users/{id}/role` names it. */
function teamRoleOf(role: Schemas["Role"]): TeamRole {
  return role === "seed_admin" || role === "admin" ? role : "none";
}

/** Picks one of the team roles the API says the viewer may give (`team_roles`). */
function TeamRoleDialog({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const current = teamRoleOf(account.role);
  const [role, setRole] = useState(current);
  const save = useMutation({
    mutationFn: async () => {
      const { error, response } = await api.PUT("/api/admin/users/{id}/role", {
        params: { path: { id: account.id } },
        body: { role },
      });
      if (!response.ok)
        throw new Error(error?.error.message ?? t("errors.generic"));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast({
        kind: "success",
        message: t("admin.accounts.changed", {
          email: account.email,
          role: t(`admin.accounts.teamRoles.${role}`),
        }),
      });
      onClose();
    },
    onError: (error) => toast({ kind: "error", message: error.message }),
  });

  return (
    <Dialog
      onClose={onClose}
      title={t("admin.accounts.roleTitle", { email: account.email })}
      action={{
        label: t("admin.accounts.save"),
        disabled: role === current,
        loading: save.isPending,
        onClick: () => save.mutate(),
      }}
    >
      <SelectField
        data-autofocus
        label={t("admin.accounts.teamRole")}
        value={role}
        onChange={(e) =>
          setRole(
            account.team_roles.find((r) => r === e.target.value) ?? current,
          )
        }
      >
        {account.team_roles.map((r) => (
          <option key={r} value={r}>
            {t(`admin.accounts.teamRoles.${r}`)}
          </option>
        ))}
      </SelectField>
      <p className="text-body-sm text-muted">
        {t(`admin.accounts.explain.${role}`)}
      </p>
    </Dialog>
  );
}
