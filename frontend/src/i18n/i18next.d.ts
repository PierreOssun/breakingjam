import "i18next";
import type en from "./en.json";

// Typed keys: `t("auth.login.title")` is checked against en.json at compile time.
declare module "i18next" {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}
