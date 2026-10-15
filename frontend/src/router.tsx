import type { RouteObject } from "react-router";
import { ComingSoon } from "./components/ComingSoon";
import { AppLayout, PageLayout } from "./components/Layout";
import { RequireAuth } from "./features/auth/RequireAuth";
import { LandingPage } from "./routes/LandingPage";
import { NotFoundPage } from "./routes/NotFoundPage";

/**
 * Every page of v0.1 (§6 Routing); `ComingSoon` marks the ones built in M11–M12.
 * Form pages load on demand, so zod and react-hook-form stay out of the first download.
 */
export const routes: RouteObject[] = [
  {
    element: <PageLayout />,
    // Lazy pages load before the first paint; nothing is shown meanwhile.
    HydrateFallback: () => null,
    children: [
      { path: "/", element: <LandingPage /> },
      {
        path: "/jams/:slug",
        lazy: async () => ({
          Component: (await import("./routes/JamPage")).JamPage,
        }),
      },
      {
        path: "/dancers/:id",
        lazy: async () => ({
          Component: (await import("./routes/DancerPage")).DancerPage,
        }),
      },
      {
        path: "/login",
        lazy: async () => ({
          Component: (await import("./routes/LoginPage")).LoginPage,
        }),
      },
      {
        path: "/register",
        lazy: async () => ({
          Component: (await import("./routes/RegisterPage")).RegisterPage,
        }),
      },
      {
        element: <RequireAuth />,
        children: [
          { path: "/org/jams", element: <ComingSoon title="pages.orgJams" /> },
          {
            path: "/org/jams/new",
            element: <ComingSoon title="pages.orgJamNew" />,
          },
          {
            path: "/org/jams/:id/edit",
            element: <ComingSoon title="pages.orgJamEdit" />,
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  {
    element: <AppLayout />,
    children: [{ path: "/map", element: <ComingSoon title="pages.map" /> }],
  },
];
