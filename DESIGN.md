# BreakingJam — DESIGN.md

v1 · dark first · Tailwind CSS v3.4+ · Mockups: the "BreakingJam — design system" Design canvas (style guide + 6 screens)

---

## 1. Brand direction

BreakingJam should look like a jam late at night: ink-black floor, Klein blue and violet light, and one wide, heavy headline face that sounds like the MC. The energy comes from big type, tight layouts and confident colour. It never comes from effects. Everything else behaves like a well-made tool: you can scan it in two seconds, tap it with one thumb, and nothing decorative slows down finding or publishing a jam.

**We are not:** corporate (no stock photos, no blue-grey SaaS dashboards) · neon-gamer (no glows, gradients or RGB) · retro-90s pastiche (no graffiti fonts, boombox clip-art, tilted stickers or drop-shadow cartoons).

---

## 2. Design tokens

### 2.1 Colour

The default theme is dark. Light is the same token set with other values. Klein blue `#002FA7` is the brand primary. On ink it's too dark to see, so dark mode uses **Klein, lifted** `#2F5BFF`.

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#0B0D14` | `#F4F6FB` | Page background |
| `surface` | `#141826` | `#FFFFFF` | Cards, inputs, panels |
| `surface-raised` | `#1C2133` | `#EBEEF6` | Popups, sheets, menus, toasts, hover fills |
| `border` | `#283048` | `#D7DCE8` | Decorative dividers, card outlines |
| `border-strong` | `#6B7391` | `#7D86A0` | Input/control outlines (≥3:1) |
| `text` | `#F3F5FA` | `#0B0D14` | Body and headings |
| `muted` | `#A3AAC2` | `#555D75` | Secondary text, captions, placeholders |
| `primary` | `#2F5BFF` | `#002FA7` | Primary buttons, markers, brand pill (fill only) |
| `primary-hover` | `#2850F0` | `#1A44C2` | Hover/pressed fill for primary |
| `primary-text` | `#8FAAFF` | `#002FA7` | Dates, links, counts, active nav: blue *as text* |
| `on-primary` | `#FFFFFF` | `#FFFFFF` | Text/icons on `primary` or `accent` fills |
| `accent` | `#6D3AF5` | `#6D3AF5` | Violet: fills for highlight pills and "New/Today" tags |
| `accent-text` | `#B49BFF` | `#6D3AF5` | Violet as text, "registration closed" badge |
| `danger` | `#FF5C6C` | `#B91C1C` | Errors, cancelled |
| `success` | `#2FD67F` | `#0F6E3B` | Published, success toasts |
| `focus` | `#B49BFF` | `#6D3AF5` | Focus ring |

Measured contrast (dark, on `bg`): text 17.8:1 · muted 8.4 · primary-text 8.7 · accent-text 8.4 · danger 6.5 · success 10.2 · white on primary 5.2 · white on accent 5.9 · border-strong 4.1.
Light, on `bg`: text 18.0 · muted 6.1 · primary 9.9 (white on it 10.7) · accent 5.4 · danger 6.0 · success 5.9 · border-strong 3.4.

### 2.2 Type scale

| Token | Size / line height | Family · weight | Tracking | Use |
|---|---|---|---|---|
| `display-3xl` | 64 / 68 | Unbounded 800 | −0.02em | Desktop hero only |
| `display-2xl` | 48 / 54 | Unbounded 800 | −0.02em | Desktop jam title |
| `display-xl` | 40 / 46 | Unbounded 800 | −0.02em | Mobile hero, desktop section titles |
| `display-lg` | 32 / 38 | Unbounded 800 | −0.02em | Mobile page titles |
| `display-md` | 24 / 30 | Unbounded 800 | −0.01em | Section titles, step numbers |
| `display-sm` | 20 / 26 | Unbounded 700 | −0.01em | Card and popup titles |
| `display-xs` | 16 / 22 | Unbounded 700 | 0 | List-row titles, wordmark (mobile) |
| `title` | 20 / 28 | Manrope 700 | 0 | Sub-heads in body |
| `body-lg` | 18 / 28 | Manrope 500 | 0 | Intros, pitch |
| `body` | 16 / 24 | Manrope 500 | 0 | Default; input text (never smaller, so iOS won't zoom) |
| `body-sm` | 14 / 20 | Manrope 500 | 0 | Meta lines, buttons-sm |
| `label` | 13 / 16 | Manrope 700, UPPERCASE | 0.06em | Dates, field labels, overlines |
| `caption` | 12 / 16 | Manrope 600 | 0 | Helper text, badges (UPPERCASE, 700, 0.04em) |

Weights loaded: Unbounded 500, 700, 800 · Manrope 500, 600, 700, 800.

### 2.3 Spacing, radii, borders, shadows

- **Spacing (4px base):** 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 44, 48, 56, 64, 80, 96 px.
- **Radii:** `sm` 8 (date tags in dense UI) · `md` 12 (inputs, selects, flyer thumbnails, map control groups) · `lg` 20 (cards, popups, toasts, menus, map previews) · `xl` 28 (bottom-sheet top corners) · `full` (all buttons, chips, badges, icon buttons, markers, wordmark pill).
- **Border widths:** 1 (cards, inputs, dividers) · 2 (buttons, markers, clusters) · 3 (focus outline only).
- **Shadows:** `sm` floating controls on the map · `md` sticky bars · `lg` popups, sheets, menus, toasts. Cards on a page have **no shadow**, only a border.

### 2.4 Paste-ready Tailwind config

Put the CSS variables in your global stylesheet. Dark is the default. Light applies through `[data-theme="light"]`, or through the OS setting when the user hasn't chosen.

```css
:root {
  --color-bg: 11 13 20;           --color-surface: 20 24 38;      --color-surface-raised: 28 33 51;
  --color-border: 40 48 72;       --color-border-strong: 107 115 145;
  --color-text: 243 245 250;      --color-muted: 163 170 194;
  --color-primary: 47 91 255;     --color-primary-hover: 40 80 240; --color-primary-text: 143 170 255;
  --color-on-primary: 255 255 255;
  --color-accent: 109 58 245;     --color-accent-text: 180 155 255;
  --color-danger: 255 92 108;     --color-success: 47 214 127;    --color-focus: 180 155 255;
  --shadow-a: 0.55;               --scrim: rgb(5 6 10 / 0.72);
  color-scheme: dark;
}
[data-theme="light"] {
  --color-bg: 244 246 251;        --color-surface: 255 255 255;   --color-surface-raised: 235 238 246;
  --color-border: 215 220 232;    --color-border-strong: 125 134 160;
  --color-text: 11 13 20;         --color-muted: 85 93 117;
  --color-primary: 0 47 167;      --color-primary-hover: 26 68 194; --color-primary-text: 0 47 167;
  --color-on-primary: 255 255 255;
  --color-accent: 109 58 245;     --color-accent-text: 109 58 245;
  --color-danger: 185 28 28;      --color-success: 15 110 59;     --color-focus: 109 58 245;
  --shadow-a: 0.14;               --scrim: rgb(11 13 20 / 0.45);
  color-scheme: light;
}
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { /* same values as [data-theme="light"] */ } }
```

```json
{
  "theme": {
    "screens": { "sm": "640px", "md": "768px", "lg": "1024px", "xl": "1280px" },
    "spacing": {
      "0": "0px", "0.5": "2px", "1": "4px", "1.5": "6px", "2": "8px", "3": "12px", "4": "16px",
      "5": "20px", "6": "24px", "8": "32px", "10": "40px", "11": "44px", "12": "48px",
      "14": "56px", "16": "64px", "20": "80px", "24": "96px"
    },
    "borderRadius": { "none": "0px", "sm": "8px", "md": "12px", "lg": "20px", "xl": "28px", "full": "9999px" },
    "borderWidth": { "0": "0px", "DEFAULT": "1px", "2": "2px", "3": "3px" },
    "extend": {
      "colors": {
        "bg": "rgb(var(--color-bg) / <alpha-value>)",
        "surface": "rgb(var(--color-surface) / <alpha-value>)",
        "surface-raised": "rgb(var(--color-surface-raised) / <alpha-value>)",
        "border": "rgb(var(--color-border) / <alpha-value>)",
        "border-strong": "rgb(var(--color-border-strong) / <alpha-value>)",
        "text": "rgb(var(--color-text) / <alpha-value>)",
        "muted": "rgb(var(--color-muted) / <alpha-value>)",
        "primary": "rgb(var(--color-primary) / <alpha-value>)",
        "primary-hover": "rgb(var(--color-primary-hover) / <alpha-value>)",
        "primary-text": "rgb(var(--color-primary-text) / <alpha-value>)",
        "on-primary": "rgb(var(--color-on-primary) / <alpha-value>)",
        "accent": "rgb(var(--color-accent) / <alpha-value>)",
        "accent-text": "rgb(var(--color-accent-text) / <alpha-value>)",
        "danger": "rgb(var(--color-danger) / <alpha-value>)",
        "success": "rgb(var(--color-success) / <alpha-value>)",
        "focus": "rgb(var(--color-focus) / <alpha-value>)",
        "scrim": "var(--scrim)"
      },
      "fontFamily": {
        "display": ["Unbounded", "Arial Black", "Helvetica Neue", "system-ui", "sans-serif"],
        "body": ["Manrope", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        "mono": ["ui-monospace", "SF Mono", "Cascadia Mono", "Roboto Mono", "Menlo", "Consolas", "monospace"]
      },
      "fontSize": {
        "display-3xl": ["64px", { "lineHeight": "68px", "letterSpacing": "-0.02em", "fontWeight": "800" }],
        "display-2xl": ["48px", { "lineHeight": "54px", "letterSpacing": "-0.02em", "fontWeight": "800" }],
        "display-xl":  ["40px", { "lineHeight": "46px", "letterSpacing": "-0.02em", "fontWeight": "800" }],
        "display-lg":  ["32px", { "lineHeight": "38px", "letterSpacing": "-0.02em", "fontWeight": "800" }],
        "display-md":  ["24px", { "lineHeight": "30px", "letterSpacing": "-0.01em", "fontWeight": "800" }],
        "display-sm":  ["20px", { "lineHeight": "26px", "letterSpacing": "-0.01em", "fontWeight": "700" }],
        "display-xs":  ["16px", { "lineHeight": "22px", "letterSpacing": "0em", "fontWeight": "700" }],
        "title":   ["20px", { "lineHeight": "28px", "fontWeight": "700" }],
        "body-lg": ["18px", { "lineHeight": "28px", "fontWeight": "500" }],
        "body":    ["16px", { "lineHeight": "24px", "fontWeight": "500" }],
        "body-sm": ["14px", { "lineHeight": "20px", "fontWeight": "500" }],
        "label":   ["13px", { "lineHeight": "16px", "letterSpacing": "0.06em", "fontWeight": "700" }],
        "caption": ["12px", { "lineHeight": "16px", "fontWeight": "600" }],
        "stat":    ["22px", { "lineHeight": "28px", "letterSpacing": "-0.02em", "fontWeight": "800" }],
        "code-xl": ["36px", { "lineHeight": "44px", "letterSpacing": "0.12em", "fontWeight": "700" }]
      },
      "boxShadow": {
        "sm": "0 1px 2px rgb(0 0 0 / var(--shadow-a))",
        "md": "0 4px 12px rgb(0 0 0 / var(--shadow-a))",
        "lg": "0 12px 32px rgb(0 0 0 / var(--shadow-a))",
        "selected": "0 0 0 4px rgb(var(--color-primary) / 0.45)"
      },
      "outlineWidth": { "3": "3px" },
      "maxWidth": { "content": "1200px", "prose": "640px", "popup": "320px", "toast": "400px" },
      "height": { "header": "56px", "header-lg": "64px" },
      "transitionDuration": { "fast": "120ms", "base": "180ms" }
    }
  }
}
```

---

## 3. Typography pairing

- **Display: [Unbounded](https://fonts.google.com/specimen/Unbounded)** (Google Fonts, OFL, variable). It's wide and heavy, so it reads as streetwear and stays legible on a phone. Use it for headings and the wordmark only, at 16px or larger, in sentence case. Never use it for body text, buttons or labels.
  Fallback: `Unbounded, "Arial Black", "Helvetica Neue", system-ui, sans-serif`
- **Text: [Manrope](https://fonts.google.com/specimen/Manrope)** (Google Fonts, OFL, variable). A calm geometric grotesque that stays readable at 12–14px on dark backgrounds. Use it for everything else, including buttons and labels.
  Fallback: `Manrope, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`
- Load: `https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;800&family=Manrope:wght@500;600;700;800&display=swap` (or self-host with `next/font` / Fontsource).
- **Mono** (verification codes only): the system stack `ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo, Consolas, monospace`. No extra font download.
- **Non-Latin jam names** (JA, KO, ZH and others): append the matching Noto Sans family to both stacks for that locale. Check script coverage on Google Fonts before launch, and never let the browser synthesise bold.

---

## 4. Components

All interactive elements have a hit area of at least 44×44, show the focus ring from §8 on `:focus-visible`, and use `transition-colors duration-fast`.

### 4.1 Button

Base: `inline-flex items-center justify-center gap-2 rounded-full border-2 font-body font-bold whitespace-nowrap transition-colors duration-fast focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-40 disabled:cursor-not-allowed`

| Size | Classes | Use |
|---|---|---|
| sm | `h-11 px-[18px] text-body-sm` | Header, popups, inline |
| md (default) | `h-12 px-6 text-body` | Forms, sheets |
| lg | `h-14 px-8 text-[18px]` | Hero CTAs, sticky bottom CTA |
| icon | `size-11 p-0` + `aria-label` | Close, share, menu, map controls |

| Variant | Default | Hover | Pressed |
|---|---|---|---|
| **Primary** | `bg-primary border-primary text-on-primary` | `bg-primary-hover border-primary-hover` | `active:translate-y-px` |
| **Secondary** | `bg-transparent border-text text-text` | `hover:bg-text hover:text-bg` | same as hover |
| **Ghost** | `bg-transparent border-transparent text-text` | `hover:bg-surface-raised` | `active:bg-border` |

- **Focus:** a 3px `focus` outline, offset 2px, on every variant.
- **Disabled:** 40% opacity, `cursor-not-allowed`, no hover change. Use a real `disabled` attribute, or `aria-disabled` when it needs a tooltip.
- **Loading:** keep the label and the width (`min-w` set to the width at rest). Swap the leading icon for Phosphor `CircleNotch` with `animate-spin`, change the label to the progressive form ("Saving…"), set `aria-busy="true"`, block clicks, and keep the colour unchanged.
- Use at most one primary button per view region. Icons go before the label (`Plus`, `MagnifyingGlass`), and an arrow goes after it only for "go to" actions (`View jam →`).

### 4.2 Text input, select, date

- **Field stack:** `label` (`text-label uppercase text-text mb-2`, always visible, never placeholder-only) → control → helper (`text-caption text-muted mt-2`) or error (`text-caption font-bold text-danger mt-2` with `WarningCircle` 14px, linked by `aria-describedby`).
- **Control:** `h-12 w-full rounded-md border border-border-strong bg-surface px-3.5 text-body text-text placeholder:text-muted`
  - Focus: `focus-visible:border-text focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus`
  - Error: `aria-invalid="true"` → `border-danger`. Validate on blur, re-validate on input.
  - Disabled: `opacity-40 cursor-not-allowed`. Read-only: `bg-surface-raised border-border`.
- **Select:** native `<select>` with `appearance-none pr-10`, plus a `CaretDown` 20px absolutely positioned at `right-3`, `pointer-events-none`. Never build a custom select in v1, because the native picker is best on phones.
- **Date:** native `<input type="date">` (and `type="time"` next to it). Give it a `CalendarBlank` icon on the right. `color-scheme` comes from the theme, so the OS picker matches. Show dates in the locale format.
- **Search** (map) is the one pill-shaped field: `rounded-full h-12 pl-11` with `MagnifyingGlass` on the left.

### 4.3 Card

- Shell: `rounded-lg border border-border bg-surface overflow-hidden`. The whole card is one `<a>`.
  - Hover: `hover:border-border-strong`. Focus: ring on the card.
  - No shadow. No tilt.
- **Grid card** (landing, desktop lists): flyer at the top, `aspect-[4/5] object-cover`. Then the body, `p-4 flex flex-col gap-2`:
  1. date `text-label uppercase text-primary-text`
  2. title `font-display text-display-sm line-clamp-2`
  3. city `text-body-sm text-muted`
  4. status badge
- **Row card** (mobile lists, map side panel): `flex gap-3 p-3`. The flyer is `w-16 h-20` (or `w-20 h-[100px]` on the landing page), `rounded-md`, with the same text stack as the grid card and a `display-xs` title.
  - Selected row: `border-primary-text bg-surface-raised`, plus `aria-current="true"`.
- **No flyer image:** render the **generated flyer** (4.24) at the same size. There is no empty placeholder.

### 4.4 Map popup

- **≥ lg, anchored:** `w-[320px] rounded-lg border border-border-strong bg-surface-raised shadow-lg p-4 flex flex-col gap-3`.
  - It has a 10px caret pointing down and sits 8px above the top of the marker. Auto-pan the map so the whole popup is visible.
  - Contents, in order:
    1. Close button (icon button, `absolute top-1 right-1`)
    2. A row with the flyer thumbnail (`w-[72px] h-[90px] rounded-md`) next to date `label`, title `display-sm` (2 lines max) and city `body-sm muted`
    3. Status badge and categories (`caption muted`, joined with " · ")
    4. Primary sm full-width **View jam →**
- **< lg, bottom sheet:** `fixed inset-x-0 bottom-0 rounded-t-xl border-t border-border-strong bg-surface-raised shadow-lg px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]`, with a 36×4 `bg-border-strong` handle and a maximum height of 50dvh. The content matches the popup, and adds the distance after the city. Actions are a primary **View jam** (`flex-1`) and a secondary icon **Share**.
- **Behaviour:**
  - `role="dialog"`, labelled by the title.
  - On open, focus moves to the title; on close, it returns to the marker.
  - Close with ✕, Esc, a tap on the map, or a swipe down on the sheet.
  - Only one popup can be open at a time.

### 4.5 Status badge

Base: `inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-caption font-bold uppercase tracking-[0.04em]` with a 14px icon. The text label is always visible, and colour is never the only cue.

| State | Classes | Icon | Shown to |
|---|---|---|---|
| Draft | `border-dashed border-border-strong text-muted` | `PencilSimple` | Organiser only |
| Published | `border-success text-success bg-success/[.12]` | filled 8px dot | Everyone |
| Registration closed | `border-accent-text text-accent-text bg-accent/[.15]` | `Lock` | Everyone |
| Completed | `border-border text-muted bg-surface-raised` | `Check` | Everyone |
| Cancelled | `border-danger text-danger bg-danger/[.12]` | `X` | Everyone (hidden from the map by default) |

### 4.6 Header with language switch

- `sticky top-0 z-40 h-header lg:h-header-lg bg-bg border-b border-border`, with the content inside the content container. On the map page it is not sticky. It's simply the first row.
- **Wordmark:** `font-display font-extrabold` at 16px (mobile) or 18px (desktop), "Breaking" plus "Jam" in a `bg-primary text-on-primary rounded-full px-[.35em]` pill. It links to `/`.
- **≥ lg**, left to right:
  1. Wordmark
  2. Nav: ghost sm links "Find a jam" and "For organisers". The active link gets `aria-current="page"` and a 2px `primary-text` underline inset at the bottom.
  3. Spacer
  4. Language switch: ghost sm with `Globe` + ISO code + `CaretDown`
  5. Primary sm **Register a jam**
- **< lg:** wordmark, then the language switch (`Globe` + code), then a menu icon button. The menu opens a full-height sheet with the nav links (`h-14 text-title`) and a full-width primary **Register a jam**.
- **Language menu:**
  - Menu box: `w-[200px] rounded-lg border border-border-strong bg-surface-raised shadow-lg p-1`, `role="listbox"`.
  - Options: `h-11 px-3 rounded-md`, each named in its own language with its own `lang` attribute (English, Français, Deutsch, Español, Português, Italiano, 日本語, 한국어).
  - The current option gets `bg-surface font-bold` and a `Check` in `primary-text`.
  - Arrow keys move between options, Enter selects and Esc closes.
  - Switching keeps the path and swaps the prefix (`/en/jams/…` → `/fr/jams/…`), and is remembered in a cookie.

### 4.7 Empty state

- `mx-auto max-w-sm py-12 px-6 flex flex-col items-center gap-4 text-center`, inside a card on content pages or in the side panel or sheet on the map.
- Icon: a 72px circle (`rounded-full border border-border-strong`) with an inner ring 10px inside it (record grooves) and a 28px Phosphor icon in `text-muted`.
  - `MapPin` on the map, `CalendarBlank` for lists, `Ticket` for organiser drafts.
- Title `display-sm`, then body `body-sm text-muted` (max 2 lines), then at most one secondary and one ghost action.
- Copy is short and direct, with no exclamation marks. Example: "No jams here yet / Zoom out or clear your filters. Running one? Put it on the map." with **Clear filters** and **Register a jam**.

### 4.8 Toast

- **Position:** < lg `fixed inset-x-4 bottom-4`, raised above any sticky CTA bar · ≥ lg `fixed bottom-6 right-6 w-toast`.
- **Shell:** `flex items-center gap-3 rounded-lg border border-border-strong bg-surface-raised shadow-lg py-3 pl-4 pr-2`. Inside:
  1. 22px icon: `CheckCircle` in success, `WarningCircle` in danger, or `Info` in primary-text
  2. message `body-sm font-bold flex-1`
  3. optional ghost sm action ("View", "Undo", "Retry")
  4. icon close button
- **Behaviour:**
  - Success and info toasts use `role="status"` and dismiss after 5 s. The timer pauses on hover or focus.
  - Errors use `role="alert"` and stay until dismissed.
  - Only one toast shows at a time; the rest queue.
  - Enter animation: 8px slide-up plus fade over 180ms. With reduced motion, fade only.

### 4.9 Modal / sheet *(added for the dancer page)*

One component that changes shape by viewport.

- **< lg, bottom sheet:**
  - `fixed inset-x-0 bottom-0 rounded-t-xl border-t border-border-strong bg-surface-raised shadow-lg` with a 36×4 handle.
  - Short content (e.g. verify): height is auto, `px-4 pb-[max(28px,env(safe-area-inset-bottom))]`.
  - Forms (e.g. edit): `top-10`, three parts: header (title + close), a body that scrolls, and a footer that sticks (`border-t`, ghost **Cancel** `flex-1` + primary **Save** `flex-[2]`).
- **≥ lg, centered dialog:**
  - `fixed left-1/2 -translate-x-1/2 top-[12vh] rounded-lg border border-border-strong bg-surface-raised shadow-lg p-6`.
  - Width: `w-[480px]` for short dialogs, `w-[560px]` for forms, max height `80vh` with the body scrolling.
  - Actions sit right-aligned in a row: ghost, then secondary, then primary last.
- **Scrim:** `fixed inset-0 bg-scrim`.
- **Both shapes:**
  - Title `display-md` with `id` used for `aria-labelledby`, plus an icon **Close** button at `top-3 right-3`.
  - `role="dialog" aria-modal="true"`.
  - Focus is trapped inside; it starts on the first field (forms) or the primary action (short dialogs) and returns to the trigger on close.
  - Close with Esc, the scrim, or a swipe down on the sheet. Forms with unsaved edits confirm before closing.

### 4.10 Flag chip

- `inline-flex items-center gap-1.5 h-7 pl-[7px] pr-2.5 rounded-full border border-border bg-bg text-caption font-extrabold tracking-[0.04em]` containing a flag plus the ISO alpha-2 code ("FR").
- Flag images: [`flag-icons`](https://github.com/lipis/flag-icons) 4:3 SVGs at 20×14, `rounded-[3px]`, with a 1px `ring-black/20`. Never use emoji flags, because Windows shows them as letters.
- The flag has `aria-label` set to the country name.
- Show at most 2 per dancer.
- Not interactive. A flag sits next to a name, never inside an avatar.
- In list rows, use the bare 16×11 flag before the city, with no chip.

### 4.11 Meta tag and role tag

- **Meta tag** (category: "1v1 Bboy", "2v2", "Kids 1v1"): `inline-flex items-center h-6 px-2.5 rounded-full border border-border text-caption font-bold text-muted`. Sentence case and not interactive, which is what distinguishes it from status badges (uppercase).
- **Role tag** (shown only when the dancer isn't competing: "Judge", "DJ", "MC", "Host"): the same shape with `border-accent-text text-accent-text bg-accent/[.14]`. It always follows the category tag.

### 4.12 Link chip

- For crews and other tappable entities: `relative inline-flex items-center h-9 px-3.5 rounded-full border border-border-strong text-body-sm font-bold text-text`.
- The hit area is extended to 44px with `after:absolute after:-inset-1 after:content-['']`.
- Hover: `hover:bg-surface-raised`. Focus: ring.
- Links to the crew page.
- **Dancer chip:** the same chip linking to the dancer page, with the 28px avatar (`size-7 rounded-[8px]`, §4.16) at `pl-1 gap-2`. Used for every competitor and lineup member on a jam page. For the jam's organiser it ends with a 28px "Remove …" icon button.
- **Add chip** (organiser only): the same shape with `border-dashed`, a `Plus` 16 and a label ("Add a dancer", "Add a judge"…).

### 4.13 Result badge

- Base: `inline-flex items-center justify-center min-w-[60px] h-7 px-2.5 rounded-full text-caption font-extrabold shrink-0`. It sits right-aligned in a past-jam row.
  - **1st / 2nd / 3rd:** `bg-primary text-on-primary`
  - **Top 8 / Top 16:** `border-[1.5px] border-primary-text text-primary-text`
  - **Prelims:** `border border-border text-muted`
- If the result is unknown, show nothing (no "—").
- Labels are fixed strings, localised: 1st, 2nd, 3rd, Top 8, Top 16, Prelims. Never show win/loss, scores or points.

### 4.14 Jam list row + year label

- **Row** (`<a>`, the whole row is tappable): `flex items-center gap-3.5 py-3 min-h-[76px] border-b border-border`, left to right:
  1. **Date block:** `w-[52px] h-14 rounded-md border border-border bg-surface flex flex-col items-center justify-center`. The day is in Unbounded 800 18/22; the short month is in `text-[11px] font-extrabold uppercase tracking-[0.06em] text-primary-text`.
  2. **Body** (`flex-1 min-w-0 flex flex-col gap-1`): the jam name in `text-body font-extrabold truncate`; flag and city in `text-[13px] leading-[18px] text-muted`; then the meta tag and an optional role tag.
  3. **Trailing:** the result badge (past rows only).
- **Order:** upcoming rows are soonest first; past rows are most recent first.
- **Year label:** `sticky top-0 z-[2] bg-bg flex items-center gap-3 pt-3 pb-2`, with the year in `font-display text-display-xs` followed by a 1px `bg-border` line that fills the rest of the width.
  - On the page, use `top-14` on mobile and `lg:top-16` so it sits under the header.
- **Paging:** show 10 rows, then a full-width secondary **Show more (n)** that loads 20 more.

### 4.15 Stats strip

- `grid grid-cols-4 gap-px bg-border border border-border rounded-lg overflow-hidden`.
- Each cell: `bg-surface py-3 px-1.5 flex flex-col items-center`, with the number in `font-display text-stat` and the label in `text-caption text-muted`. Labels are singular or plural to match the number.
- At ≥ lg in the left column, use `grid-cols-2`.
- Remove the strip entirely when every value is 0. Never show "0 · 0 · 0 · 0".
- Allowed stats only: jams, countries, years active, podiums.

### 4.16 Avatar + verified tick

- **Avatar:** `size-24 rounded-[28px] overflow-hidden border border-border` (`size-28 rounded-[32px]` in the ≥ lg left column, `size-[72px] rounded-[22px]` in forms). It's a rounded square, so it never reads as a map marker or a social profile bubble.
  - **Generated (default): pixel 2D-HD bust.** Pixel art with modern lighting on top. See the "Pixel avatar" artboard.
    - **Sprite:** a 32×32 grid rendered as SVG with `shape-rendering="crispEdges"`, or a PNG at 8× with `image-rendering: pixelated`. Never smooth the scaling.
    - **Drawing rules:**
      - A 1px ink (`#0B0D14`) outline around the silhouette.
      - Skin features (nose, mouth, chin line, ears) drawn with a darker skin tone, not black.
      - Cel shading with 2 tones per material, lit from the top-left. Hair gets a 1px diagonal highlight streak.
      - Anime eyes: a 4px lash line, 2×2 iris with a white catch-light, angled brows.
      - A 1px rim light in the backdrop's light tint on the right silhouette edge.
    - **HD layer**, on top of the pixels:
      - Soft radial glow from the top-left, white at 22% opacity.
      - Bottom vignette, black at 35% opacity.
      - This is the only place gradients are allowed in the product.
    - **Parts:**
      - Hair: spiky, cap with side brim, beanie, bun with headband, afro, buzz.
      - Skin: light, tan, medium, deep.
      - Hair colour: black, brown, bleached, violet, Klein blue.
      - Hoodie: ink, Klein, violet, white, red.
      - Extras: none, headphones, chain.
      - Backdrop: Klein, violet, ink or night, with pixel "record" rings.
    - **Seeding:** parts are seeded from the dancer id, so the avatar is stable. Anyone who can edit the dancer can change the parts in the edit sheet (skin tone especially should never stay a random guess once someone cares).
    - Never draw a flag, text, logo, or any existing character into the sprite.
  - **Photo (verified owners only):** `object-cover`, same mask.
  - `alt` is the dancer name.
- **Verified tick:** a 24px seal in `primary` with a white check, `role="img" aria-label="Verified"`, placed right after the name. It's the only mark allowed; there is no "pro", rank or popularity marker.

### 4.17 Identity card (the share unit)

- `relative overflow-hidden rounded-[28px] border border-border bg-surface p-5 flex flex-col gap-3`, with one `.rings` (300px) bleeding off the top-right.
- Contents, top to bottom:
  1. avatar
  2. name `font-display text-display-lg` + tick + flag chips (`flex flex-wrap items-center gap-2`; chips wrap under long names)
  3. aliases `text-body-sm font-semibold text-muted` ("aka …", joined with " · ")
  4. Instagram handle: Phosphor `InstagramLogo` 20 + `@handle` in `text-body font-extrabold text-text`, 44px min height. It opens `https://instagram.com/<handle>`, which the OS hands to the app.
  5. the canonical URL in `text-caption text-muted` (`breakingjam.com/d/<slug>`)
- It has to look complete when cropped on its own (screenshots). Nothing inside it depends on the page around it.
- The **OG image** for `/d/<slug>` renders this same card at 1200×630.

### 4.18 Pending pill

- `inline-flex items-center gap-2.5 h-11 pl-4 pr-1.5 rounded-full border-[1.5px] border-dashed border-accent-text text-accent-text bg-accent/10 text-body-sm font-extrabold`.
- Contents: `Clock` icon, "Verification pending", then the code inside a nested pill (`h-8 px-3 rounded-full bg-bg text-text font-mono font-bold tracking-[0.08em]`).
- It's a `<button>` that copies the code and confirms with the "Code copied" toast.
- Below it: `text-caption text-muted` "We check by hand, usually within a day."

### 4.19 Code display

- `flex flex-col items-center gap-1.5 p-[18px] rounded-lg border-[1.5px] border-dashed border-border-strong bg-bg`.
- Contents: a caption ("Your code"), then the code in `font-mono text-code-xl`.
- Codes use the format `BJ-` + 4 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O/1/I/L), and are selectable.

### 4.20 Form extras

- **Chip input** (aliases):
  - Container: the input shell with `min-h-12 h-auto flex-wrap gap-1.5 p-2`.
  - Chips: `h-8 pl-3 pr-1 rounded-full bg-surface-raised border border-border text-body-sm font-bold`, each with a 28px icon button labelled "Remove …".
  - Enter or comma adds an alias; Backspace on an empty input removes the last chip. Max 5 aliases.
  - Helper text: "Enter or comma adds an alias."
- **Prefixed input** (Instagram): the input shell with a leading `@` in `text-muted font-bold`. Strip a pasted `@` or full URL down to the handle.
- **Textarea** (bio): the input shell with `min-h-24 py-3 resize-none`, and a right-aligned `caption` counter "n / 160" that turns `text-danger` past the limit.
- **Optional label:** append "optional" in `normal-case tracking-normal font-semibold text-muted` to the field label. Never mark required fields with an asterisk.

### 4.21 Inline notice

- `flex gap-2.5 items-start rounded-md bg-surface-raised px-3.5 py-3 text-[13px] leading-[18px] text-muted`, with an 18px `Info` icon.
- Use it for one-line context inside forms and dialogs: "Edits by the community are logged." and "Someone else has already asked to verify this profile…".
- It's not an alert, so it has no colour fill. The icon takes `accent-text` only when the notice changes what the user should do.

### 4.22 Empty state, inline (lists)

- For an empty section inside a page: `rounded-lg border border-dashed border-border-strong px-[18px] py-4 text-body-sm text-muted`.
- One sentence, no icon, no illustration, no button.
- Copy: "No upcoming jams." · "No past jams on record yet — organisers add results after the jam."
- The illustrated empty state (4.7) stays for whole-screen emptiness (map, organiser dashboard).

### 4.23 Add-field affordance

- For an optional field the viewer could fill in, e.g. "Add Instagram": `inline-flex items-center gap-2 min-h-11 text-body-sm font-bold text-muted`, with a `Plus` icon and the label underlined by a `1.5px dashed border-strong`.
- It opens the edit sheet focused on that field.
- Show it only to logged-in users. Visitors see nothing in that spot.

### 4.24 Generated flyer *(v0.1: jams have no image upload)*

Every jam gets a 4:5 poster built from its own data, in the same pixel 2D-HD language as the dancer avatars. It's used wherever a flyer appears: the jam page hero, cards, popup and list thumbnails, and the share image. When uploads arrive, an uploaded image replaces it, and the generated one stays as the fallback and the OG image. See the "Generated flyer" artboard; `generated-flyer-reference.py` is a reference implementation that outputs SVG.

- **Inputs:** name, date (weekday, day, month), start time, city, country code, categories. Nothing else.
- **Rendering:** a single SVG with `viewBox="0 0 400 500"`, `preserveAspectRatio="xMidYMid slice"` and `shape-rendering="crispEdges"`. It scales to any size.
  - Render it server-side (Rust: build the SVG string; `resvg` for PNG/OG).
  - Text is real `<text>` in Unbounded and Manrope; embed the fonts when rasterising.
  - Accessibility: `role="img"` with `aria-label="Generated flyer: <name>, <date>, <city>"`.
- **Seed:** `h = sha1(jam.id)`.
  - Palette = `["klein","violet","ink"][h % 3]`.
  - Pose = `["handstand","toprock"][(h / 3) % 2]`.
  - Stable forever, with no randomness at render time.
- **Palettes** (theme-independent, the same in dark and light UI):

| | bg | rings | text | sub | dancer | rim | shadow | floor |
|---|---|---|---|---|---|---|---|---|
| klein | `#002FA7` | `#1440BE` | `#FFFFFF` | `#C7D4FF` | `#0B0D14` | `#8FAAFF` | `#001C6B` | `#5F80E6` |
| violet | `#6D3AF5` | `#7C4FFF` | `#FFFFFF` | `#E6DDFF` | `#0B0D14` | `#D6C7FF` | `#4818C6` | `#A88CFF` |
| ink | `#0B0D14` | `#182038` | `#F3F5FA` | `#8FAAFF` | `#2F5BFF` | `#B9CAFF` | `#111833` | `#2A3A72` |

- **Layers, back to front** (400×500 units):
  1. Background fill.
  2. **Pixel record rings:** 8-unit cells whose centre lies within 4 units of the radii 56, 96, 136, 176, 216 and 256 around (300, 170).
  3. **Floor:** dashes 8×4 every 16 units at y = 270.
  4. **Pixel dancer:** the 20×20 bitmap below at 8 units per cell, x = 196, standing on the floor.
     - Shadow: the same bitmap offset by one cell, in `shadow`.
     - Rim light: the right-most third of the last cell in each run, in `rim`.
  5. **HD layer:**
     - Radial glow at (25%, 20%): white from 16% to 0%.
     - Bottom vignette from 55% down: black from 0% to 45%.
  6. **Type:**
     - Weekday in Manrope 800 16, tracking 2, colour `sub`, at (28, 54).
     - Day in Unbounded 800 72 at (24, 124).
     - Month in Unbounded 800 28 at (28, 160).
     - Time in Manrope 700 15, `sub`, at (28, 188).
     - "BREAKINGJAM" in Manrope 800 11, tracking 2, right-aligned at (372, 46).
     - **Name:** Unbounded 800, line height 1.08, last baseline at y = 420.
     - City and country in Manrope 800 17 at y = 452.
     - Categories, uppercase, in Manrope 700 12, tracking 1.4, `sub`, at y = 478.
- **Name fit:**
  - Width 344. Assume an average glyph width of 0.8em for Unbounded.
  - Try 46, then 40, then 34 px over at most 3 lines, then 28 and 24 px over at most 4 lines.
  - The block must stay below the floor (at most 126 units from the first cap height to the last baseline).
  - If the last line is ≤ 3 characters, pull the previous word down.
  - Use an ellipsis only when 4 lines at 24 px still overflow.
- **Compact** (any render ≤ 120px wide): rings, dancer, weekday, day and month only. No name, city or categories, and `aria-hidden` (the row next to it carries the text).
- **Cancelled:** a band rotated −12° across the centre in `#D8354A`, with "CANCELLED" in Unbounded 800 30 white. Other statuses don't touch the flyer.
- **Share image:** the same seed and layers in 1200×630.
  - Text sits on the left: date line, name at 84 → 50 px over ≤ 3 lines, city, then categories + "BREAKINGJAM.COM".
  - The dancer sits on the right at 16 units per cell.
- **Pose bitmaps** (`X` = filled, rows top to bottom):

```
handstand            toprock
..XX..........XX.... ........XX..........
..XXX........XXX.... .......XXX..........
...XXX......XXX..... .......XX...........
....XXX....XXX...... ......XX....XXX.....
.....XXX..XXX....... ......XX...XXXXX....
......XXXXXX........ .......XX..XXXXX....
.......XXXX......... .......XX..XXXXX....
.......XXXX......... ........XX..XXX.....
.......XXXX......... .........XXXXXX.....
.......XXXX......... ........XXXXXXXXXX..
.......XXXX......... ........XXXXXXX..XX.
......XXXXXX........ ........XXXXXXX...XX
.....XXXXXXXX....... .........XXXXX...XX.
....XXX.XX.XXX...... .........XXXXX..XX..
....XX.XXXX.XX...... .........XXXXX......
...XX..XXXX..XX..... ........XXXXXXX.....
...XX..XXXX..XX..... .......XXX...XXX....
..XX....XX....XX.... ......XXX.....XXX...
..XX..........XX.... .....XXX.......XX...
.XXX..........XXX... ....XXX........XX...
                     ...XXX.........XXX..
                     ..XXXX.........XXXX.
```

- **On the jam page:** the flyer is the hero exactly as an uploaded flyer would be (mobile full-bleed 375×469; desktop left column, `rounded-lg`). The `<h1>` and fact rows stay below it, so the layout doesn't change when uploads ship.

---

## 5. Layout rules

- **Container:** `mx-auto max-w-content px-4 md:px-6 lg:px-8` (1200px including padding). Reading column: `max-w-prose` (640px).
- **Breakpoints:** design at **375** (support down to 320) · `sm` 640 · `md` 768 · `lg` 1024, where the side panel, anchored popups and desktop header switch on · `xl` 1280.
- **Header:** 56px below `lg`, 64px from `lg` up.
- **Vertical rhythm:**
  - Sections: `py-10` on mobile, `py-20` on desktop, separated by a `border-t border-border`.
  - Inside a section: `gap-4` on mobile, `gap-8` on desktop.
  - Card grids: `gap-4` on mobile, `gap-6` on desktop.
- **Content pages** (landing, jam detail, organiser forms): sticky header, normal document scroll, footer.
  - Forms are a single column, `max-w-prose`, with fields at `gap-6` and a sticky bottom action bar on mobile.
- **Map page:** an app shell with **no footer and no page scroll**: `h-dvh flex flex-col overflow-hidden`, with the header as the first row and the map filling the rest.
  - **≥ lg:** a 400px left panel (`border-r`, scrolls on its own: search, filter chips, result count, row cards) next to the map. Popups are anchored. Zoom and locate controls sit top-right as a 44px icon-button group (`rounded-md shadow-md`).
  - **< lg:** a full-bleed map with floating search and filter button at `top-3 inset-x-4`, plus a horizontally scrolling chip row below. A **List** pill sits bottom-left and locate bottom-right, 16px above the sheet. The popup becomes the bottom sheet. **List** opens a full-screen list that has a **Map** pill to return.
  - Filter chips: `h-11 px-3.5 rounded-full border border-border-strong text-body-sm font-semibold`. Active: `bg-text text-bg border-text`.
- **Jam detail:** ≥ lg uses `grid grid-cols-[440px_1fr] gap-16`.
  - Left column: flyer (4:5, `rounded-lg`), then the registration card. Make it `lg:sticky lg:top-24`.
  - Right column (`max-w-prose`): badge, title, facts, Battles, Lineup, About, Venue, Organiser.
  - < lg: the flyer runs full-bleed under the back bar, the content follows in one column, and a sticky bottom bar holds the fee and **Register to battle**.

---

## 6. Screens (see the canvas artboards)

**Landing.**
- **Mobile 375:**
  1. Header.
  2. Hero: overline "The world map of breaking jams", then `display-xl` "Every jam. One **map**." with "map." in the blue pill. Under it, a `body-lg muted` pitch and two full-width lg buttons stacked, **Find a jam** (primary) and **Register a jam** (secondary). One `.rings` decoration bleeds off the top-right corner.
  3. A 240px map preview card with clusters and markers, labelled "Open the map".
  4. "Next up": three row cards.
  5. "For organisers": steps 01–03 with `display-md` numbers in `primary-text`, then a full-width primary **Register a jam**.
  6. Footer.
- **Desktop:** the hero is a 5/7 grid, with the text and CTAs side by side on the left and a 480px map preview with an open mini-popup on the right. "Next up" is a 4-column grid of cards. The organiser band sits on `surface`, with the heading left and the three steps in columns on the right.

**Map with a popup open.**
- **Mobile:** a dark full-bleed map under a 56px header, with the floating search pill, a filter button (dot when filters are active) and the chip row. The selected marker is 28px with a date tag. The bottom sheet is up, showing the flyer, date, title, distance, badge, categories, **View jam** and Share. **List** and locate float above the sheet.
- **Desktop:** the 400px side panel (search set to "Zurich", chips, "6 jams in this area", row cards with the selected one highlighted) next to the map. The anchored 320px popup sits above the selected marker, with zoom and locate top-right and attribution bottom-right.

**Jam detail.**
- **Mobile:**
  1. Back bar (← Map, Share).
  2. Full-bleed 4:5 flyer.
  3. Badge and deadline caption, then the `display-lg` title.
  4. Fact rows for date/time, venue and fees, each with a `primary-text` icon.
  5. **Battles** list: category, format and spots, or "Full" in muted; cash prizes under the name (`Trophy` 16 in `primary-text`, "1st CHF 1,000 · 2nd CHF 500" muted); entries as dancer chips, best result first.
  6. **Lineup:** dancer chips for judges, DJ and MC.
  - For the jam's organiser, people are managed here: an add chip under each battle and per lineup role, edit and delete on each entry, remove on each chip. Battles themselves are edited in the jam editor.
  7. **About:** organiser text.
  8. **Venue:** mini map and "Open in maps ↗".
  9. **Organiser** card with **Contact**.
  10. Sticky bottom bar: fee and primary **Register to battle**.
- **Desktop:** two columns. The left holds the flyer and the registration card (fees, deadline, lg primary CTA). The right holds the `display-2xl` title, a 2-column fact grid and the same sections.

**Dancer page** (`/d/<slug>`). It's a record, not a social profile: no feed, followers, ratings, rankings or win/loss.
- **Mobile 375:**
  1. Header.
  2. Back/Share bar.
  3. Identity card (4.17).
  4. Crew link chips + city (`MapPin` 16, muted).
  5. Primary action, by state:
     - Unverified, logged out: nothing.
     - Unverified, logged in: full-width secondary **This is me**, which opens the verify modal.
     - Claim pending (me): the pending pill (4.18).
     - Verified owner: full-width secondary **Edit profile**.
  6. Stats strip (4.15), hidden when all zero.
  7. **Upcoming**, then **Past** (rows 4.14, year labels, Show more), or inline empty states (4.22).
  - Card, action and stats sit above the fold at 375×812.
  - "Add Instagram" (4.23) replaces the handle only for logged-in users.
- **Desktop 1024+:** `grid grid-cols-[340px_1fr] gap-12`. The left column is `sticky top-6` and holds the card, chips, action and a 2×2 stats grid. The right column holds the lists, with `display-md` section titles.
- **Verify modal** (4.9 + 4.19):
  - Title "Verify it’s you", two lines of explanation, then the code.
  - Buttons: **Copy code** (primary), **Open Instagram** (secondary, opens the @breaking.jam DM thread), **Done** (ghost).
  - When someone else has already requested it: an inline notice above the code, and the request is still allowed.
  - Submitting moves the page to the pending state.
- **Edit sheet** (4.9 + 4.20):
  - Fields: dancer name, aliases (chip input), country, second country (optional), city, Instagram, bio (160).
  - On unverified dancers: the notice "Edits by the community are logged." at the top.
  - Avatar upload (photo or "Use pixel avatar") only for the verified owner.
  - Desktop shows it as a 560px dialog with the two country selects side by side.

---

## 7. Iconography and map

- **Icon set: [Phosphor Icons](https://phosphoricons.com)** (MIT), via `@phosphor-icons/react`.
  - Use the **Bold** weight everywhere, because it matches Unbounded's weight. Use **Fill** only for selected or active states (e.g. the active nav icon, a selected chip).
  - Sizes: 20 default · 16 in buttons-sm · 14 in badges · 22 in toasts and the header on mobile · 28 in empty states.
  - Icons inherit `currentColor`. They are `aria-hidden` unless they are the only content, in which case the button gets an `aria-label`.
  - The core set: `MagnifyingGlass, MapPin, CalendarBlank, Clock, Ticket, Globe, CaretDown, List, ListBullets, X, Check, Lock, PencilSimple, CheckCircle, WarningCircle, Info, Export, Crosshair, SlidersHorizontal, Plus, Minus, ArrowRight, ArrowLeft, ArrowSquareOut, CircleNotch, UsersThree, InstagramLogo, Copy, UploadSimple, SealCheck` (the verified tick, Fill weight).
- **Map engine:** MapLibre GL JS with a custom vector style that follows the theme.
  - Dark: land `#0E111A` · minor roads `#1A1F2E` · major roads `#2A3147` · water `#0C1A3D` · parks `#131B24` · labels `muted` with a `bg` halo. Show road labels only from zoom 13.
  - Light: land `#F4F6FB` · roads `#FFFFFF` with a `#D7DCE8` casing · water `#CCD9F5` · labels `#555D75`.
- **Markers** (HTML or symbol layer, with a hit area of at least 44px):
  - Upcoming: a 20px circle in `primary`, with a 2px ring in `#F3F5FA` (dark) or `#FFFFFF` with `shadow-sm` (light).
  - Selected: 28px, with `shadow-selected` (a 4px ring in `primary` at 45%) and a date tag to its right. The tag is a pill, `bg-bg border border-primary-text text-primary-text text-label px-1.5`, reading e.g. "14 NOV".
  - Every marker gets a date tag from zoom 12 up.
  - Past (only when the "Past" filter is on): 14px `border-strong` fill with a `bg` ring.
  - Cancelled (only when that filter is on): a 20px hollow circle with a 2px dashed `danger` ring.
  - Markers are buttons labelled like "Concrete Cypher Vol. 3, Saturday 14 November, Zurich".
- **Clusters:** use GeoJSON source clustering (`clusterRadius: 48`, `clusterMaxZoom: 12`).
  - Shape: a `bg` fill with a 2px `primary-text` ring, and the count in Manrope 800 14px `primary-text`.
  - Size: 36px for 2–9, 44px for 10–99, 56px for 100+ (written "120+" style; 1000+ becomes "1k+").
  - Tapping a cluster zooms to its bounds.

---

## 8. Accessibility

- **Contrast:**
  - Body and small text: at least 4.5:1, and every text token in §2.1 passes in both themes.
  - Display sizes (24px and up): at least 3:1.
  - Control boundaries and icons: at least 3:1, which is why inputs use `border-strong`, not `border`.
  - Never put `muted` on `surface-raised` below 14px.
- **Focus ring:** `outline: 3px solid focus` with a 2px offset, on `:focus-visible` only, on every interactive element, including cards, markers, chips and menu options. Never remove it.
  - It's violet, so it stays distinct from the blue primary fill.
  - Inside the map canvas, markers get the same ring.
- **Touch targets:** at least 44×44 CSS px, with at least 8px between neighbouring targets. Small visuals (20px markers, 24px badges) get an invisible 44px hit area.
- **Also:**
  - Status always has an icon and text.
  - Every map result is reachable without the map, through the List view, using the keyboard.
  - Use `lang` on each language option and on user-entered text when it's known.
  - Respect `prefers-reduced-motion`: no map fly animations (jump instead) and fade-only toasts.
  - Form errors are announced and linked with `aria-describedby`.
  - Inputs use 16px text so iOS doesn't zoom.

---

## 9. Do's and don'ts

- **Do** use Unbounded big and sparingly: one display headline per screen region, sentence case.
- **Do** put blue only where it means "act" or "here" (primary buttons, markers, dates, links). Violet is the second voice for highlights, focus and closed states.
- **Do** keep shapes rounded: pills for anything you press, 20px corners for containers, 12px for fields and thumbnails.
- **Do** let the flyer carry the colour on cards and detail pages; the UI around it stays ink and white.
- **Do** use the thin outlined rings (`.rings`) as the only decoration: at most one per screen, behind a hero or empty state, never behind body text.
- **Don't** use gradients, glows, neon, or blue-to-violet blends.
- **Don't** tilt, rotate or sticker-shadow anything. Don't use graffiti or distressed fonts.
- **Don't** set Unbounded below 16px, or use it for buttons, labels or body text.
- **Don't** put white text on violet or blue fills except through `on-primary`. Don't use `#002FA7` in dark mode.
- **Don't** add a second primary button in the same region, or hide labels behind icons without an `aria-label`.

---

*Decoration utility:*
```css
.rings { position:absolute; border-radius:9999px; pointer-events:none;
  background: repeating-radial-gradient(circle at center, transparent 0 27px, rgb(var(--color-primary-text) / .16) 27px 28px); }
```
