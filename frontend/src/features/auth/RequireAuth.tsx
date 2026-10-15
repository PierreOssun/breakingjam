import { Navigate, Outlet, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { withNext } from "./safeNext";
import { useMe } from "./useMe";

/** Gate for organiser pages: logged-out visitors go to `/login?next=<here>` (§6). */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  const { t } = useTranslation();

  if (me.isPending) return null;
  if (me.isError) {
    return (
      <p className="mx-auto max-w-content px-4 py-10 text-body text-danger">
        {t("errors.generic")}
      </p>
    );
  }
  if (!me.data) {
    const here = location.pathname + location.search;
    return <Navigate to={withNext("/login", here)} replace />;
  }
  return <Outlet />;
}
