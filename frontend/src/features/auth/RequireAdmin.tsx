import { Outlet } from "react-router";
import { NotFoundPage } from "../../routes/NotFoundPage";
import { atLeast } from "./roles";
import { useMe } from "./useMe";

/** Gate for admin screens, inside `RequireAuth`: anyone else sees a missing page (§5 roles). */
export function RequireAdmin() {
  const me = useMe();
  if (me.isPending) return null;
  if (!me.data || !atLeast(me.data.role, "admin")) return <NotFoundPage />;
  return <Outlet />;
}
