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
- Public cards show a status badge only when it's exceptional: Registration closed or Cancelled. Never show Published.

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
| In review | `border-primary-text text-primary-text bg-primary/[.12]` | `HourglassMedium` | Organiser and admins only |
| Published | `border-success text-success bg-success/[.12]` | filled 8px dot | Everyone |
| Registration closed | `border-accent-text text-accent-text bg-accent/[.15]` | `Lock` | Everyone |
| Completed | `border-border text-muted bg-surface-raised` | `Check` | Everyone |
| Cancelled | `border-danger text-danger bg-danger/[.12]` | `X` | Everyone (hidden from the map by default) |

### 4.6 Header with language switch

- `sticky top-0 z-40 h-header lg:h-header-lg bg-bg border-b border-border`, with the content inside the content container. On the map page it is not sticky. It's simply the first row.
- **Home link:** the **logo mark plus the wordmark**, `flex items-center gap-2 lg:gap-2.5`, `aria-label="BreakingJam home"`, linking to `/`. The same on every page, including the map and jam pages.
  - **Mark:** the Bounce "J" (`frontend/public/favicon.svg`, J only, as §10 requires below 48px), `size-8` on mobile and `size-9` from `lg`, decorative (`alt=""`).
  - **Wordmark:** `font-display font-extrabold` at 16px (mobile) or 18px (desktop), "Breaking" plus "Jam" in a `bg-primary text-on-primary rounded-full px-[.35em]` pill.
- **≥ xl** (below that, French and German labels or a long name don't fit), left to right:
  1. Home link (mark + wordmark)
  2. Nav: ghost sm links **Jam map** (`/map`), **Find a jam** (`/jams`), **Find someone** (`/dancers`). The active link gets `aria-current="page"` and a 2px `primary-text` underline inset at the bottom.
  3. Spacer
  4. Language switch: ghost sm with `Globe` + ISO code + `CaretDown`
  5. Account: ghost sm muted **Log in** when logged out; when logged in, the **account menu**, a ghost sm button with the display name and `CaretDown`
  6. Primary sm **Register a jam** with `Plus` 16
- **Account menu:** the language menu's box and options (`role="menu"`, `menuitem`s): **My jams** (`/org/jams`), **Admin** (`/admin`, admins only), **Log out**. Arrow keys move, Esc closes. It keeps the bar at four items whoever is logged in.
- **< xl:** the home link, then the language switch (`Globe` + code), then a menu icon button. The menu opens a full-height sheet with the three nav links (`h-14 text-title`), then My jams, Admin and Log in or Log out, and a full-width primary **Register a jam**.
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
- **Unknown country** (`ZZ`): a Phosphor `Globe` in the flag's place, and no code in the chip.
- Show at most 2 per dancer.
- Not interactive. A flag sits next to a name, never inside an avatar.
- In list rows, use the bare 16×11 flag before the city, with no chip.
- **Country count chip:** `h-8 pl-2 pr-3`, with the flag, the country name in `font-extrabold`, and the count in `text-muted font-bold` ("Belgium 28").

### 4.11 Meta tag and role tag

- **Meta tag** (category: "1v1 Bboy", "2v2", "Kids 1v1"): `inline-flex items-center h-6 px-2.5 rounded-full border border-border text-caption font-bold text-muted`. Sentence case and not interactive, which is what distinguishes it from status badges (uppercase).
- **Role tag** (shown only when the dancer isn't competing: "Judge", "DJ", "MC", "Host"): the same shape with `border-accent-text text-accent-text bg-accent/[.14]`. It always follows the category tag.

### 4.12 Link chip

- For crews and other tappable entities: `relative inline-flex items-center h-9 px-3.5 rounded-full border border-border-strong text-body-sm font-bold text-text`.
- The hit area is extended to 44px with `after:absolute after:-inset-1 after:content-['']`.
- Hover: `hover:bg-surface-raised`. Focus: ring.
- Links to the crew page.
- **Dancer chip:** the same chip linking to the dancer page, with the 28px avatar (`size-7 rounded-[8px]`, §4.16) at `pl-1 gap-2`. Used for every competitor and lineup member on a jam page. For the jam's organiser it ends with a 28px "Remove …" icon button.
  - A battle's entries and each lineup group are one **wrapping row** of chips (`flex flex-wrap gap-2`), never a chip per full-width row. A team shows its name, then its members' chips.
  - A podium place (1st–3rd, §4.13) sits inside the chip after the name, as the result badge at `h-6 px-2`.
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

- **Avatar:** `size-24 rounded-[28px] overflow-hidden border border-border` (`size-28 rounded-[32px]` in the ≥ lg left column, `size-[72px] rounded-[22px]` in forms, `size-[52px] rounded-[16px]` in person rows). It's a rounded square, so it never reads as a map marker or a social profile bubble.
  - **Generated (default): pixel 2D-HD bust.** Pixel art with modern lighting on top. See the "Pixel avatar" artboard. The app draws it in `features/dancers/avatarParts.ts`.
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
      - **Hair (13):**
        - Short and covered: spiky · cap with side brim · beanie · buzz · afro.
        - Long and up: bun with headband · long with centre part and side fringe · space buns · box braids · afro puffs · high ponytail · blunt bob with bangs · cap over long hair.
      - **Skin:** light, tan, medium, deep.
      - **Hair colour:** black, brown, bleached, violet, Klein blue.
      - **Hoodie:** ink, Klein, violet, white, red.
      - **Extras:** none, headphones, chain.
      - **Details** (optional, combinable): lash flicks · lip tint `#B4475F` · hoop earrings (silver).
      - **Backdrop:** Klein, violet, ink or night, with pixel "record" rings.
    - **Seeding:** parts are seeded from the dancer id, so the avatar is stable. Anyone who can edit the dancer can change the parts in the edit sheet (skin tone especially should never stay a random guess once someone cares).
      - No part is tied to a gender, and the schema has no gender field.
      - The seed picks evenly across all 13 hair styles, and turns each detail on with a 1-in-3 chance.
      - A dancer entered in a bgirl battle whom nobody has drawn yet gets a long or tied-up style with lash flicks (lip tint 1 in 2, hoops 1 in 3); one entered in a bboy battle gets a short or covered style without details. The battle is the only signal; it is stored as an ordinary choice, so it can be changed like any other.
      - Anyone who can edit the dancer can change any part in the edit sheet.
    - Reference implementation: `frontend/pixel-avatar-generator.py` (`make()`, `svg()`, `PRESETS`; bgirl presets `w1`–`w8`).
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

### 4.24 Generated flyer

Every jam gets a 4:5 poster built from its own data: the palette's background with a soft HD glow, and the jam's details set in type. No pixel art (decided after M15); the share image keeps the pixel rings, floor and dancer. It's used wherever a flyer appears: the jam page hero, cards, popup and list thumbnails, and the share image. An uploaded flyer (§4.28) replaces it, and the generated one stays as the fallback and the OG image. See the "Generated flyer" artboard; `generated-flyer-reference.py` is a reference implementation that outputs SVG.

- **Inputs:** name, date (weekday, day, month), start time, city, country code, categories. Nothing else.
- **Rendering:** a single SVG with `viewBox="0 0 400 500"`, `preserveAspectRatio="xMidYMid slice"` and `shape-rendering="crispEdges"`. It scales to any size.
  - Render it server-side (Rust: build the SVG string; `resvg` for PNG/OG).
  - Text is real `<text>` in Unbounded and Manrope; embed the fonts when rasterising.
  - Accessibility: `role="img"` with `aria-label="Generated flyer: <name>, <date>, <city>"`.
- **Seed:** `h = sha1(jam.id)`.
  - Palette = `["klein","violet","ink"][h % 3]`.
  - Pose = `["handstand","toprock"][(h / 3) % 2]` (share image only).
  - Stable forever, with no randomness at render time.
- **Palettes** (theme-independent, the same in dark and light UI; rings, dancer, rim, shadow and floor colour the share image only):

| | bg | rings | text | sub | dancer | rim | shadow | floor |
|---|---|---|---|---|---|---|---|---|
| klein | `#002FA7` | `#1440BE` | `#FFFFFF` | `#C7D4FF` | `#0B0D14` | `#8FAAFF` | `#001C6B` | `#5F80E6` |
| violet | `#6D3AF5` | `#7C4FFF` | `#FFFFFF` | `#E6DDFF` | `#0B0D14` | `#D6C7FF` | `#4818C6` | `#A88CFF` |
| ink | `#0B0D14` | `#182038` | `#F3F5FA` | `#8FAAFF` | `#2F5BFF` | `#B9CAFF` | `#111833` | `#2A3A72` |

- **Layers, back to front** (400×500 units):
  1. Background fill.
  2. **HD layer:**
     - Radial glow at (25%, 20%): white from 16% to 0%.
     - Bottom vignette from 55% down: black from 0% to 45%.
  3. **Type:**
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
  - The block must stay in the lower part, below y = 282 (at most 126 units from the first cap height to the last baseline).
  - If the last line is ≤ 3 characters, pull the previous word down.
  - Use an ellipsis only when 4 lines at 24 px still overflow.
- **Compact** (any render ≤ 120px wide): background, weekday, day and month only. No name, city or categories, and `aria-hidden` (the row next to it carries the text).
- **Cancelled:** a band rotated −12° across the centre in `#D8354A`, with "CANCELLED" in Unbounded 800 30 white. Other statuses don't touch the flyer.
- **Share image:** the same seed and palette in 1200×630, with the pixel art the flyer doesn't have.
  - **Pixel record rings:** 12-unit cells whose centre lies within 6 units of the radii 90, 150, 210, 270, 330 and 390 around (940, 260).
  - **Floor:** dashes 12×6 every 24 units at y = 520.
  - **Pixel dancer:** the bitmap of its pose (below) at 16 units per cell, x = 800, standing on the floor.
    - Shadow: the same bitmap offset by one cell, in `shadow`.
    - Rim light: the right-most third of the last cell in each run, in `rim`.
  - Bottom vignette from 60% down: black from 0% to 40%.
  - Text sits on the left: date line, name at 84 → 50 px over ≤ 3 lines, city, then categories + "BREAKINGJAM.COM".
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

- **On the jam page:** the flyer is the hero exactly as an uploaded flyer is (mobile full-bleed 375×469; desktop left column, `rounded-lg`). The `<h1>` and fact rows stay below it, so the layout is the same with either.

### 4.25 Person list row ("Find someone")

- **Page** `/dancers`: the `max-w-prose` column, the `font-display` H1 "Find someone", then a search field (label "Name, alias or @handle", hint "Bboys, bgirls, DJs, MCs, judges.").
  - Typing searches after a 250 ms pause and keeps `?q=` in the URL, so back and shared links return to the same results.
  - A blank search lists everyone, notable dancers first.
- **Row** (`<a>` to the dancer page, the whole row tappable): the jam row's shape (§4.14), `flex items-center gap-3.5 py-3 min-h-[76px] border-b border-border`:
  1. The avatar at `size-[52px] rounded-[16px]` (§4.16), decorative here (`aria-hidden`).
  2. Body: the name in `text-body font-extrabold truncate` with the verified tick after it; then the bare flags (up to 2), the city and the crews (`City · Crew, Crew`) in `text-[13px] leading-[18px] text-muted`.
- **Paging:** 20 rows, then a full-width secondary **Show more** for the next 20.
- **No match:** the inline empty state (§4.22), "No one matches “…”."

### 4.26 Hero search

- **Desktop:** `flex items-center gap-2.5 h-[60px] pl-5 pr-1.5 rounded-full border border-border-strong bg-surface shadow-lg`.
  - `MagnifyingGlass` 20 in muted.
  - Input in `text-body`, with a muted placeholder.
  - An inline primary sm button at the end.
- **Mobile:** `h-14`, with no inline button; the CTAs sit below.
- **Hero search (landing):** the same pill, bigger, alone in the hero (§6).
  - **Desktop:** `max-w-[760px] h-20 pl-[30px] pr-2 gap-3.5`, `MagnifyingGlass` 24, input at 20px.
  - **Mobile:** full width, `h-16`, input at 16px.
  - **Submit:** the round J Bounce logo (`favicon.svg`) as the button, 64px on desktop and 52px on mobile, `aria-label="Search"`. Hover scales it to 1.04; focus gets the standard ring.
  - **Placeholder:** "Jam, battle, bgirl, bboy, DJ…".
- **Behaviour:**
  - The landing search submits to `/search?q=`, which lists matching jams and people (§6).
  - No typeahead yet.

### 4.27 Map preview

*Unused since landing v3; kept as the spec for a future map teaser.*

- **Container:** `relative h-[260px] lg:h-[560px] rounded-[28px] overflow-hidden border border-border`.
  - The whole card is a link to `/map`.
  - It uses the same MapLibre style as the map page, non-interactive: no scroll-zoom, no drag.
  - Lazy-load it below the fold on mobile.
- **Content:**
  - Upcoming jams as markers, with clusters (§7), framed on the visitor's region.
  - Desktop only: one mini popup for the soonest jam. It's a `w-[300px]` row card with a compact flyer of 64×80.
- **Overlays:**
  - Top-left chip: `h-9 px-3.5 rounded-full bg-bg border border-border shadow-md text-[13px] font-extrabold`, with an 8px `success` dot and "N upcoming jams".
  - Bottom-left: secondary sm **Open the map →** on `bg-bg`.

### 4.28 Flyer upload and crop *(M19)*

Mockups: the "Flyer Upload" canvas (mobile sheet, desktop dialog, field states; https://claude.ai/artifact/26hnHfNDk6NGqUF2aMkB3i).

- **Field:** its own "Flyer" section in the jam editor, after Details.
  - **Empty:** a dashed drop target, `rounded-md border-2 border-dashed border-border-strong bg-surface px-4 py-6`, centred. Inside: `UploadSimple` 28 in `primary-text`, "Upload a flyer" in `body` bold, and "PNG or JPEG, up to 20 MB. Portrait 4:5 fits best." in `caption muted`.
    - It is a button that opens the file picker (the file input itself stays hidden), and it also takes a dropped file.
    - Under it: "Until you add one, the jam uses a flyer made from its details."
  - **Uploaded:** the card-size image at 120×150 `rounded-md border border-border`. Beside it, a secondary sm **Replace flyer** (`UploadSimple`) and a ghost sm **Remove flyer** (`Trash`). Under it: "Shown on the jam page, cards and the map. Remove it to go back to the generated flyer."
  - **Error:** the drop target's border turns `danger`, and the field error of §4.2 replaces the helper: not a PNG or JPEG, over 20 MB, under 540 × 675 px, or unreadable.
- **On the jam page**, for whoever may edit the jam (its organiser, the BreakingJam team, admins): right under the flyer, a secondary sm **Upload a flyer**, or **Replace flyer** and a ghost sm **Remove flyer** once there is one. They open the same picker and crop dialog as the editor, and a file problem shows under them as the field error. Below lg the row takes the content's side padding, as the flyer is full-bleed.
- **Crop dialog:** §4.9 in its `form` shape (a sheet below lg, a 560px dialog from lg), titled "Crop your flyer". In order:
  1. **Crop area:** full-bleed in the sheet, `h-[382px] bg-bg`. The image sits under a fixed 280×350 frame with a 2px `text` border, and the `scrim` covers what's outside the frame.
     - Drag to move, pinch to zoom. Arrow keys move the image 16px, `+` and `-` zoom. The cursor is `grab`, `grabbing` while dragging.
  2. **Zoom row:** `Minus` and `Plus` icon buttons around a range slider (`accent-primary`), then a ghost sm **Reset** (`ArrowCounterClockwise`).
     - Zoom 1 is the largest 4:5 crop. Zoom stops where the crop holds 540 image pixels (the card image), or at 4×.
     - Under the row: "Drag to move. Pinch or slide to zoom." in `caption muted`.
  3. **Soft warning:** an actionable inline notice (§4.21) when the crop is under 900 px wide: "This crop is N px wide, so it will look soft. Zoom out, or pick a bigger image: 1080 × 1350 is ideal."
  4. **"On cards and lists":** the crop at 96×120, and a row card (§4.3) with the crop at 64×80 beside the jam's date, name and city.
  5. **Footer:** ghost **Cancel**, primary **Use this flyer** (loading while it uploads). On success the dialog closes, with the toast "Flyer updated."
- **Showing it:** an uploaded flyer takes the generated one's place everywhere, with the same shell (`aspect-[4/5] overflow-hidden`, `object-cover`). The jam page uses the 1080×1350 image; cards, rows and popups use the 540×675 one. Its alt text is "Flyer of <name>", empty on compact thumbnails, as they sit next to the name.

### 4.29 Loading placeholders

- **Never a full-page spinner.** What needs no data shows at once: the header, the landing's hero and search, page and section titles, filters.
- **Placeholders take the final shape** of what is loading, so nothing moves when it arrives:
  - Blocks are `rounded-md bg-surface-raised` with `motion-safe:animate-pulse`, sized like the lines, flyers, avatars and cards they stand for. Rounded-full for pills and buttons.
  - **Lists:** row placeholders (the 52px lead and two lines of §4.14 and §4.25), or card placeholders (§4.3), 2–6 of them.
  - **Pages that need one request first** show their skeleton: the jam page (back bar, 4:5 flyer, badge, title, facts), dancer and organiser pages (identity card, then rows), the jam editor (links, title, fields).
  - **Sections** keep their title and their static parts, e.g. "Next up near you" with its "See all on the map" link while its cards load.
- **Accessibility:** each loading region is `aria-busy` with one visually hidden "Loading…"; the shapes are `aria-hidden`.
- **When loading ends:** the content replaces the placeholders, and a section that turns out empty disappears (e.g. Next up with no upcoming jam). On failure the generic error message replaces them, except on the landing, whose sections disappear. A failed refetch never hides content already shown.
- **Radius:** a placeholder has no default radius; each one sets its own, like the element it stands for.

### 4.30 Countdown chip

- Next to the status badge on the jam page: "In 9 days", "Tomorrow", "Today", "Live now".
- `inline-flex h-6 items-center rounded-full border border-primary-text/50 bg-primary/[.12] px-2.5 text-caption font-extrabold text-primary-text uppercase`.
- Counted in the jam's own timezone. **Live now** once its first battle has started, or from its second day when no start is announced. Hidden once the jam is over, completed or cancelled.

### 4.31 "Who's in" card

- Under the meta lines: `flex items-center gap-3 rounded-lg border border-border bg-surface p-3`, the whole card a link down to Battles (to Lineup when only the lineup is known).
- A stack of the first 6 avatars, 36px rounded squares (`size-9 rounded-[10px]`) overlapping by 10px, each with a 2px `bg` ring.
- Then "10 dancers in" in bold (each competitor once, withdrawn entries left out) and "2 judges · DJ Krate" in muted (one DJ or MC is named, several are counted), then an `ArrowRight`.
- Hidden when nobody is listed.

### 4.32 Action bar and action card

- **Action bar** (< lg): along the bottom while the jam is on screen, `bg-bg border-t shadow-lg px-4 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]`. A secondary **Share** (`flex-1`) and the primary action (`flex-[2]`). It is `sticky`, not `fixed`, so it stops before the footer instead of covering it.
- **Action card** (≥ lg, under the flyer): `bg-surface border rounded-lg p-5 gap-3`: the primary action, a secondary **Share this jam**, and a caption.
- **The primary action, by the jam's state:**

| State | Primary action | Caption |
|---|---|---|
| Registration open (a registration link) | **Register to battle** ↗ | Spectators welcome · registration is open |
| Announced without a registration link | **Add to calendar** | Spectators welcome |
| Registration closed | **Add to calendar** | Spectators welcome · registration is closed |
| Completed | **See results** (to Battles) | — |
| Cancelled | none, Share only | This jam is called off. |

- **Add to calendar** opens the API's `.ics` (`GET /api/events/{slug}/calendar.ics`): one all-day event over the jam's days, at its venue, with the page's link.

---

## 5. Layout rules

- **Container:** `mx-auto max-w-content px-4 md:px-6 lg:px-8` (1200px including padding). Reading column: `max-w-prose` (640px).
- **Breakpoints:** design at **375** (support down to 320) · `sm` 640 · `md` 768 · `lg` 1024, where the side panel and anchored popups switch on · `xl` 1280, where the full header bar switches on (§4.6).
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
- **Jam detail:** ≥ lg uses `grid grid-cols-[420px_1fr] gap-14`.
  - Left column, `lg:sticky lg:top-6`: the flyer (4:5, `rounded-lg`), then the action card (§4.32).
  - Right column (`max-w-prose`): badges, title, meta, "Who's in", facts, then the sections (§6 Jam detail).
  - < lg: the flyer sits inset (`mx-4 rounded-lg`) under the back bar, the content follows in one column, and the action bar (§4.32) runs along the bottom.

---

## 6. Screens (see the canvas artboards)

**Landing** (order is the same on every viewport):

1. **Header** (§4.6).
2. **Hero: title, subtitle and the search.** No pitch paragraph, map preview or second button. Everything is centred.
   - **Title**, the page's only `<h1>`: "Find your next jam", `font-display` (Unbounded 800), 56px / 62px on desktop and 32px / 38px on mobile, with `text-wrap: balance` so mobile breaks as "Find your / next jam".
   - **Subtitle** (`<p>`, right under it): "All of breaking, in one search", Manrope 500 (not bold), `muted`, 20px / 30px on desktop and 17px / 26px on mobile.
   - The hero search (§4.26, landing size).
   - Spacing: 12px between title and subtitle (8px on mobile), 36px between subtitle and search (24px on mobile). `pt-24 pb-28` on desktop, `pt-12 pb-16` on mobile, so the hero is no taller than with the search alone.
   - One `.rings` (1120px desktop, 560px mobile) is centred behind the whole block.
3. **Next up near you.**
   - **Title row:**
     - Title: `display-xl` on desktop, `display-md` on mobile.
     - Location line: `body-sm muted` "Around <city> · change". Use geolocation if granted, otherwise IP; fall back to "Worldwide".
     - Link: ghost **See all on the map →**.
   - **Cards:** grid cards (§4.3), soonest first.
     - Desktop: 4 columns, first 4 jams.
     - Mobile: horizontal scroll-snap row of 240px cards, up to 6.
   - Hide the section when there are no upcoming jams.
   - On desktop (1440×900) it starts above the fold.
4. **The scene so far.**
   - Overline, then the counters.
     - Desktop: inline, each counter a `display-xl` number + `body-lg muted` label, separated by a muted "·".
     - Mobile: a 3-cell stats strip.
     - Counters: battles, countries, dancers.
   - Then the 10 busiest countries as country chips (§4.10), plus a muted "+N more" chip.
5. **Footer.**
   - The round Bounce logo at 56px next to the wordmark.
   - Links: Find a jam, Find someone, Register a jam, Instagram.
   - Language switch.
   - Desktop: one row. Mobile: stacked.

The organisers' pitch moves to a future `/register` landing; dancers find themselves through the main search.

**Search** (`/search?q=`): what the hero search submits to.
- Reading column (`max-w-prose`): the visually hidden `<h1>` "Search", the hero search pill at its standard size (§4.26), prefilled.
- **Jams:** a `display-md` title, then the jams the words match (same matching as the map: name, city, country), upcoming first, as jam rows (§4.14). Up to 10, then **See all on the map →** (`/map?q=`).
- **People:** a `display-md` title, then person rows (§4.25), paged with **Show more**.
- Each part has its own inline empty state (§4.22). A blank search shows the upcoming jams and the notable people.

**Find a jam** (`/jams`): every jam as a list, for those who don't want the map.
- Reading column (`max-w-prose`): `display-lg`/`display-xl` title, the search field, the filter chips (§5, wrapped as in the side panel), the result count.
- Jam rows (§4.14), upcoming soonest first; **Past jams** shows the completed ones, most recent first. 30 at a time, then **Show more**.
- The search lives in the URL (`?q=`), like the map's.

**Map with a popup open.**
- **Mobile:** a dark full-bleed map under a 56px header, with the floating search pill, a filter button (dot when filters are active) and the chip row. The selected marker is 28px with a date tag. The bottom sheet is up, showing the flyer, date, title, distance, badge, categories, **View jam** and Share. **List** and locate float above the sheet.
- **Desktop:** the 400px side panel (search set to "Zurich", chips, "6 jams in this area", row cards with the selected one highlighted) next to the map. The anchored 320px popup sits above the selected marker, with zoom and locate top-right and attribution bottom-right.

**Jam detail** (`/jams/<slug>`, v2 in M21): the most shared page, built for people arriving from Instagram or WhatsApp on a phone.
- **Mobile 375:**
  1. Back bar: ghost **← Map**, **Edit jam** for its writers, and Share as an icon button.
  2. The 4:5 flyer, inset `mx-4 rounded-lg`, with the flyer buttons under it for the jam's writers (§4.28).
  3. The status badge and the countdown chip (§4.30).
  4. The title, `display-lg` (`display-2xl` from lg).
  5. **Meta lines**, each with a `primary-text` icon: the date, with "from 14:00" when a battle start is announced (jams have days, not times); the flag, city and country; all cash prizes together, "€1,750 in prizes", when there are any.
  6. **"Who's in"** (§4.31).
  7. **Battles** (`#battles`): one card per battle, `bg-surface border rounded-lg p-5`.
     - Header: the name in `display-sm`; "Starts 14:00" (`Clock`) and "8 / 16 dancers" (`UsersThree`, teams for team battles) in muted; the prize line with `Trophy`; the format as a meta tag on the right ("Top 8", "7 to Smoke").
     - Entries: dancer chips in a wrapping row (§4.12), best result first; the podium gets its badge inside the chip; a play icon button when an entry has a video.
     - For the jam's organiser: a row per entry instead, withdrawn ones included, with edit, delete and video buttons, and an add chip under each battle.
  8. **Lineup** (`#lineup`): judges, DJ, MC, hosts, staff, each a `label` and a wrapping row of chips; stacked on phones, side by side from lg. The organiser removes and adds people here.
  9. **About:** the organiser's pitch, up to 200 characters.
  10. **Info** (phones only): website (the host as label, ↗), email (`mailto:`) and Instagram; desktop has them in the facts grid.
  11. **Venue:** a static mini map (MapLibre, not interactive, the map page's style), `rounded-lg`, 170px tall (220px from lg), with the selected marker centred. Under it the address, then a secondary sm **Directions** opening Apple Maps on Apple devices and Google Maps elsewhere. Without a pin: the address only.
  12. **Organiser:** a card with a 52px rounded-square initials avatar (a logo once organisers have one), the name in bold with the verified tick, "N jams on BreakingJam · @handle" in muted, and a secondary sm **Contact** (the jam's public email, else an Instagram DM). On phones it wraps and the button goes full width. Left out when the BreakingJam team entered the jam: the team lists jams it doesn't run.
  13. **More jams coming up:** up to 4 other upcoming jams, the nearest first (the soonest when this one has no pin), as grid cards (§4.3): a scroll of 200px cards on phones, 4 columns from lg, with **See the map →**. Hidden when there are none.
  14. The action bar (§4.32).
  - At 375×812 the flyer, badges, title, date, city and the action bar show without scrolling.
- **Desktop:** two columns (§5). Under the flyer, the action card (§4.32). The meta lines run as one inline row, and a facts grid (When, Where, Website, Email, Instagram) follows "Who's in".
- **Share** (the top bar, the action bar, the action card): the system share sheet with `{ title: "<Jam> · <Wed 4 Nov> · <City>", url }` where there is one (cancelling isn't an error); else the link is copied with the toast "Link copied" (§4.8).
- **Link previews** (Open Graph, set by the Worker): `og:title` is "<Jam> · <Wed 4 Nov> · <City>", `og:description` the battles + "on BreakingJam", `og:image` the uploaded flyer at card size, else the generated share image.

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
  - Buttons: **Copy code** (primary), **Open Instagram** (secondary, opens the @breakingjam DM thread), **Done** (ghost).
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

## 10. Logo — “Jam” Bounce

The social and app mark: the same “Jam” as the wordmark (“Breaking” + the “Jam” pill, §4.6), turned into a funky, flat-3D sticker.

- **Where it appears:**
  - **Header:** the J mark at 32/36px before the text wordmark (§4.6).
  - **Footer:** the full round “Jam” at 56px next to the wordmark.
  - **Favicon, app icons and social:** as listed below.

- **Build** (see `frontend/jam-logo-generator.py`):
  - The word “Jam” in Unbounded 800, converted to outlines, with tracking −20 units.
  - Inflated with a round-join stroke (80 units, same colour as the fill), so every corner is soft.
  - **Bounce:** each letter is lifted or dropped and slightly rotated.
    - J: 30 down, −7°
    - a: 55 up, +5°
    - m: 25 down, −4°
  - Flat extrusion 150 units down-right in violet `#6D3AF5`, drawn as 16 solid steps.
  - An ink `#0B0D14` outline 66 units wide around the face and the extrusion.
  - The face is white, with a pale-blue `#C9D6FF` rim on its lower right.
  - Everything is solid colour: no gradients, no blur, no lighting.
- **Container:** a Klein `#002FA7` circle. The lettering spans 78% of the diameter, including the extrusion, and is optically centred.
- **Sizes:**
  - Down to 48px: the full “Jam”.
  - Below 48px: the **J alone**, built the same way (favicon 32 and 16).
  - Never put “Jam” below 32px.
- **Clear space:** at least ¼ of the circle's diameter on every side, and nothing touching the circle.
- **Backgrounds:** the circle works on ink, white, photos and flyers. Don't recolour the letters. On violet surfaces, use the Sticker variant (`logo/funky/jam-sticker.svg`).
- **Exception to §9:** the tilt and extrusion belong to the logo only. Never apply them to UI text or components.
- **Files** (`logo/final/`):
  - `jam-logo.svg`: round master
  - `jam-logo-square.svg`: full-bleed square
  - `instagram-1080.png`: upload as the Instagram profile picture; Instagram crops it to the circle itself
  - `app-icon-1024/512/192.png`: the OS applies its own mask
  - `apple-touch-icon-180.png`
  - `favicon.svg` and `favicon-48/32/16.png` (J only)
  - `jam-logo-round-1024.png`: transparent corners
- **HTML head:**
  ```html
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon-32.png" sizes="32x32">
  <link rel="apple-touch-icon" href="/apple-touch-icon-180.png">
  ```
- **In the site** (`frontend/public/`):
  - These files are linked as above: `favicon.svg`, `favicon-32.png`, `apple-touch-icon-180.png`.
  - `site.webmanifest` lists `app-icon-192/512.png` and `jam-logo-square.svg` for Android and desktop installs.
  - `jam-logo.svg` is published as-is.
  - The square PNGs are rendered from `jam-logo-square.svg` with macOS QuickLook: `qlmanage -t -s <size> jam-logo-square.svg`.
  - QuickLook flattens onto white, so the round `favicon-32.png` is rendered with headless Chrome: `--headless=new --screenshot --window-size=32,32 --default-background-color=00000000` on a page showing `favicon.svg` at 32px.

---

*Decoration utility:*
```css
.rings { position:absolute; border-radius:9999px; pointer-events:none;
  background: repeating-radial-gradient(circle at center, transparent 0 27px, rgb(var(--color-primary-text) / .16) 27px 28px); }
```
