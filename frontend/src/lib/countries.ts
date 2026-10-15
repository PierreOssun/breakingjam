import { localeOf } from "./dates";

/** "France" for `FR` in English, "Frankreich" in German; the code itself if unknown. */
export function countryName(code: string, language: string): string {
  try {
    return (
      new Intl.DisplayNames([localeOf(language)], { type: "region" }).of(
        code,
      ) ?? code
    );
  } catch {
    return code;
  }
}
