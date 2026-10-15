import "@testing-library/jest-dom/vitest";
import i18n from "../i18n";

afterEach(async () => {
  vi.unstubAllGlobals();
  localStorage.clear();
  await i18n.changeLanguage("en");
});
