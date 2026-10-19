import type { RouteObject } from "react-router";
import { AppLayout, PageLayout } from "./components/Layout";
import { RequireAdmin } from "./features/auth/RequireAdmin";
import { RequireAuth } from "./features/auth/RequireAuth";
import { LandingPage } from "./routes/LandingPage";
import { NotFoundPage } from "./routes/NotFoundPage";

/**
 * Every page of v0.1 (§6 Routing).
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
        path: "/dancers",
        lazy: async () => ({
          Component: (await import("./routes/PeoplePage")).PeoplePage,
        }),
      },
      {
        path: "/dancers/:id",
        lazy: async () => ({
          Component: (await import("./routes/DancerPage")).DancerPage,
        }),
      },
      {
        path: "/organizers/:id",
        lazy: async () => ({
          Component: (await import("./routes/OrganizerPage")).OrganizerPage,
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
          {
            path: "/org/jams",
            lazy: async () => ({
              Component: (await import("./routes/OrgJamsPage")).OrgJamsPage,
            }),
          },
          {
            path: "/org/jams/new",
            lazy: async () => ({
              Component: (await import("./routes/OrgJamNewPage")).OrgJamNewPage,
            }),
          },
          {
            element: <RequireAdmin />,
            children: [
              {
                path: "/admin",
                lazy: async () => ({
                  Component: (await import("./features/admin/AdminLayout"))
                    .AdminLayout,
                }),
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (await import("./routes/AdminOverviewPage"))
                        .AdminOverviewPage,
                    }),
                  },
                  {
                    path: "jams",
                    lazy: async () => ({
                      Component: (await import("./routes/AdminJamsPage"))
                        .AdminJamsPage,
                    }),
                  },
                  {
                    path: "claims",
                    lazy: async () => ({
                      Component: (await import("./routes/AdminClaimsPage"))
                        .AdminClaimsPage,
                    }),
                  },
                ],
              },
              {
                path: "/admin/dancers/:id/merge",
                lazy: async () => ({
                  Component: (await import("./routes/AdminMergePage"))
                    .AdminMergePage,
                }),
              },
            ],
          },
          {
            path: "/org/jams/:id/edit",
            lazy: async () => ({
              Component: (await import("./routes/OrgJamEditPage"))
                .OrgJamEditPage,
            }),
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  {
    element: <AppLayout />,
    // MapLibre is the largest dependency; only this page loads it.
    HydrateFallback: () => null,
    children: [
      {
        path: "/map",
        lazy: async () => ({
          Component: (await import("./routes/MapPage")).MapPage,
        }),
      },
    ],
  },
];
