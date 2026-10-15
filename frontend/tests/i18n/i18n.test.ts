import de from "../../src/i18n/de.json";
import en from "../../src/i18n/en.json";
import fr from "../../src/i18n/fr.json";

/** Every leaf of a translation file as `[dottedKey, value]`, e.g. `["auth.login.title", "Log in"]`. */
function leaves(tree: object, prefix = ""): [string, unknown][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? leaves(value as object, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value] as [string, unknown]],
  );
}

const keys = (tree: object) => leaves(tree).map(([key]) => key);
const values = (tree: object) => leaves(tree).map(([, value]) => value);

describe("translations", () => {
  it.each([
    ["fr", fr],
    ["de", de],
  ])("%s has exactly the English keys", (_, translation) => {
    expect(keys(translation).sort()).toEqual(keys(en).sort());
  });

  it.each([
    ["en", en],
    ["fr", fr],
    ["de", de],
  ])("%s has no empty strings", (_, translation) => {
    expect(
      values(translation).every(
        (v) => typeof v === "string" && v.trim() !== "",
      ),
    ).toBe(true);
  });
});
