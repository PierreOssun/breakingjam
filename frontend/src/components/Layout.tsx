import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigationType } from "react-router";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { TestSiteBanner } from "./TestSiteBanner";
import { ToastProvider } from "./Toast";

function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main"
      className="sr-only rounded-full bg-primary px-4 py-2 font-bold text-on-primary focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
    >
      {t("nav.skipToContent")}
    </a>
  );
}

/** Another page, opened by a link or a redirect, starts at its top; Back and Forward keep the
 * browser's position, and a link to a part of a page (`#battles`) goes there. */
function useTopOfNewPage() {
  const { pathname, hash } = useLocation();
  const back = useNavigationType() === "POP";
  const last = useRef(pathname);
  useLayoutEffect(() => {
    // The same page with another search or filter stays where it is.
    if (last.current === pathname) return;
    last.current = pathname;
    if (!back && !hash) window.scrollTo(0, 0);
  }, [pathname, hash, back]);
}

/** Content pages: sticky header, document scroll, footer (DESIGN.md §5). */
export function PageLayout() {
  useTopOfNewPage();
  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col">
        <SkipLink />
        <TestSiteBanner />
        <Header />
        <main id="main" tabIndex={-1} className="focus:outline-none flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </ToastProvider>
  );
}

/** The map: an app shell with no footer and no page scroll (DESIGN.md §5). */
export function AppLayout() {
  return (
    <ToastProvider>
      <div className="flex h-dvh flex-col overflow-hidden">
        <SkipLink />
        <TestSiteBanner />
        <Header sticky={false} />
        <main
          id="main"
          tabIndex={-1}
          className="focus:outline-none relative flex-1"
        >
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}
