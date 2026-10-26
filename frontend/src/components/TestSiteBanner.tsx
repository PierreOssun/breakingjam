import { X } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "./IconButton";

const STORAGE_KEY = "bj.testBannerClosed";

/** Whether the Worker marked this page as UAT's (`TEST_SITE` in deploy/src/index.ts). */
function isTestSite() {
  return document.querySelector('meta[name="test-site"]') !== null;
}

function closedBefore() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // Storage can be blocked (private mode): shown as on a first visit.
    return false;
  }
}

/** UAT's "Test site" notice until this browser closes it; nothing on production. */
export function TestSiteBanner() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => isTestSite() && !closedBefore());
  if (!open) return null;

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Closed for this visit only.
    }
  };

  // In the flow above the header, not fixed: it never covers sticky buttons or toasts.
  return (
    <div role="note" className="bg-accent text-on-primary">
      <div className="mx-auto flex max-w-content items-center gap-2 py-2 pr-2 pl-4 md:pl-6 lg:pl-8">
        <p className="flex-1 text-[1.625rem] leading-[1.3] font-semibold">
          {t("testSite.notice")}
        </p>
        <IconButton
          label={t("testSite.close")}
          onClick={close}
          className="text-on-primary! not-disabled:hover:bg-black/15!"
        >
          <X size={24} weight="bold" aria-hidden />
        </IconButton>
      </div>
    </div>
  );
}
