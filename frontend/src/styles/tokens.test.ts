import design from "../../../DESIGN.md?raw";
import css from "./index.css?raw";

// DESIGN.md is the source of the tokens (§6 Visual system); these tests fail when the
// stylesheet and its tables drift apart.

function between(text: string, start: RegExp, end: RegExp): string {
  const from = text.search(start);
  const to = text.slice(from).search(end);
  return text.slice(from, from + to);
}

const theme = between(css, /@theme \{/, /@layer base/);
const light = between(css, /\[data-theme=["']light["']\] \{/, /@media/);
const osLight = between(
  css,
  /@media \(prefers-color-scheme: light\)/,
  /html \{/,
);

describe("design tokens", () => {
  const colours = [
    ...design.matchAll(
      /^\| `([a-z-]+)` \| `(#[0-9A-F]{6})` \| `(#[0-9A-F]{6})` \|/gim,
    ),
  ];

  it("covers every colour of §2.1", () => {
    expect(colours.length).toBe(16);
  });

  it.each(
    colours.map(([, name, dark, lightValue]) => [name, dark, lightValue]),
  )("colour %s is %s dark and %s light", (name, dark, lightValue) => {
    expect(theme).toContain(`--color-${name}: ${dark!.toLowerCase()};`);
    expect(light).toContain(`--color-${name}: ${lightValue!.toLowerCase()};`);
    expect(osLight).toContain(`--color-${name}: ${lightValue!.toLowerCase()};`);
  });

  const sizes = [
    ...design.matchAll(
      /^\| `([a-z0-9-]+)` \| (\d+) \/ (\d+) \| \w+ (\d{3})[^|]*\| ([^|]+)\|/gm,
    ),
  ];

  it("covers every size of the §2.2 type scale", () => {
    expect(sizes.length).toBe(13);
  });

  it.each(
    sizes.map(([, name, size, lineHeight, weight, tracking]) => [
      name,
      size,
      lineHeight,
      weight,
      tracking!.trim(),
    ]),
  )(
    "text %s is %spx / %spx, weight %s, tracking %s",
    (name, size, lineHeight, weight, tracking) => {
      expect(theme).toContain(`--text-${name}: ${size}px;`);
      expect(theme).toContain(`--text-${name}--line-height: ${lineHeight}px;`);
      expect(theme).toContain(`--text-${name}--font-weight: ${weight};`);
      if (tracking !== "0") {
        expect(theme).toContain(
          `--text-${name}--letter-spacing: ${tracking.replace("−", "-")};`,
        );
      }
    },
  );

  it("uses the §2.3 radii", () => {
    const radii = [...design.matchAll(/`(sm|md|lg|xl)` (\d+) \(/g)];
    expect(radii.length).toBe(4);
    for (const [, name, px] of radii) {
      expect(theme).toContain(`--radius-${name}: ${px}px;`);
    }
  });
});
