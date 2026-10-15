import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import i18n from "../i18n";

// Pages are lazy routes: the first test of a file waits for the module to be transformed,
// which takes over the 1 s default when every file runs in parallel.
configure({ asyncUtilTimeout: 5000 });

// jsdom has <dialog> without the modal API.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  localStorage.clear();
  await i18n.changeLanguage("en");
});
