# Builder design system

> 中文指南: [spec.zh.md](spec.zh.md) — spec pages are bilingual (EN · 中文); English is normative.

Builder is quiet, dense and precise — tool UI in the Orca / Multica / Linear family. Monochrome chrome carries the interface; **color is reserved for state and the one primary action**. Hairline borders do the structural work, the system font stack does the talking, and everything sits on a compact 4px grid with 6–12px radii. It ships **two color systems in one stylesheet**: **Apple** (default — white ground, system blue) and **Claude** (warm ivory ground, terracotta).

## How to use this

- Link the one stylesheet from every page — `<link rel="stylesheet" href="styles.css">` (adjust the relative path) — and take every color, font, spacing, radius and shadow from its variables (`var(--color-*)`, `var(--font-*)`, `var(--space-*)`, `var(--radius-*)`, `var(--shadow-*)`). Never hard-code a hex, a font name or a px value the tokens already carry.
- **Switching palettes:** the Apple palette lives on `:root`; add `data-theme="claude"` to `<html>` (or any subtree) to switch that scope to the Claude palette. Every token re-resolves — components need no changes.
- Build with the classes below rather than inventing parallel ones; the component pages are plain HTML, so view source and copy the markup.
- Starter templates (`templates/landing`, `templates/deck`) live in the source Claude Design project (see [README.md](README.md)), not in this mirror — copy them from there when starting a standalone page.
- The system was derived from `theme.json` and the Orca styleguide / Multica token sheet (provenance in [README.md](README.md)). To change the look, edit the tokens at the top of `styles.css` and keep `theme.json` and this guide in step.

## Direction

Left-aligned, grid-true, compact. The chrome is neutral: grounds, hairlines and ink tints structure everything; saturation appears only on the primary action, links, focus and status. Rows align to a visible grid — text left, numbers/counts/shortcuts right in the mono face. Dense is fine when alignment and grouping make scanning faster; decoration is not. Prefer whitespace + one hairline over boxes-in-boxes; never nest cards.

## Color

Each theme defines the same roles: `--color-bg` (canvas), `--color-surface` (the quiet shell — sidebars, board columns), `--color-card` (bounded content groups), `--color-text`, `--color-accent`, `--color-accent-2`, plus 100–900 tonal ramps for neutral / accent / accent-2, generated in OKLCH on one shared lightness scale (the same step of any ramp in either theme has the same visual weight).

- **Apple:** white `#ffffff`, gray `#f5f5f7`, ink `#1d1d1f`, blue `#0071e3`, indigo `#5856d6`; status green/orange/red are the system colors.
- **Claude:** ivory `#faf9f5`, pampas `#f0eee6`, warm ink `#1f1e1d`, terracotta `#d97757`, slate `#4c73a5`; status colors are warm-tuned to sit on the ivory ground.

Semantic status tokens come in triples — `--color-success` / `-soft` (tint fill) / `-deep` (text on the tint), same for `warning` and `danger`. Use them only for state, never as decoration. Light ramp steps (100–300) make tints and hovers, 500 is the base, 700–900 are text-on-tint and pressed states.

Contrast: the Apple accent passes 4.5:1 on its ground; the Claude terracotta is a large-text/UI value (~3:1) — for paragraph-size accent text use `--color-accent-700`.

## Type

The system font stack — SF Pro on Apple hardware, Segoe UI on Windows — as `--font-body` and `--font-heading` (weight 600); `--font-mono` (SF Mono / Menlo / Consolas) for IDs, paths, counts, keyboard keys and anything literal. Body is 13px with `letter-spacing: 0.01em`. The scale is role-named and small on purpose — more sizes blur hierarchy:

- 10–11px — uppercase section labels (weight 600, letterspaced), counters, meta
- 12–13px — dense rows, body, buttons
- 14–15px — card and dialog titles
- 17–28px — page titles (h3–h1)

## Chinese / CJK

The system is mixed-script by default: the stacks name Latin faces only (SF Pro / Segoe UI), so han always falls to the per-script system default — PingFang SC on macOS/iOS, Microsoft YaHei on Windows, Noto Sans CJK SC on Android/Linux. That's the same system-stack strategy as the Latin type, with nothing to load or upload. Digits, IDs, code and shortcuts stay in the Latin mono face even inside Chinese copy. Declare the language (`lang="zh"` on `<html>` or any subtree) and the `:lang(zh)` layer at the end of styles.css re-tunes han with zero component changes: headings drop the Latin negative tracking to 0 (it makes han glyphs collide), body copy takes 1.7 leading + 0.02em, emphasis renders as weight 600 (han has no italics — never slant), the smallest labels step from 10px up to the 11px han floor, avatars take one family-name character, and mixed-script/punctuation spacing goes to `text-autospace` / `text-spacing-trim` where supported. Weights: PingFang carries 500/600 natively; Microsoft YaHei maps them to bold — acceptable. Demonstrated in foundations/cjk.html.

## Icons

Lucide (https://lucide.dev) at its default stroke-width 2, default size 16px (14px in dense rows, 12px in meta). Icons inherit the surrounding text color — don't color the SVG directly.

## Elevation

Three levels, never a fourth: **hairline** (`border: 1px solid var(--color-divider)` — the default; almost everything), **subtle lift** (`--shadow-sm` on a bordered card), **floating** (`--shadow-lg` — dialogs, command palette, toasts only). `--shadow-md` is the in-between for menus.

## Interaction states

Idle rows are transparent; hover is an ink tint (`color-mix` of `--color-text` at 4–6%); the keyboard-selected row is a stronger tint **plus an inset hairline ring** (see `.cmdk-item[aria-selected]`); a persistent current item uses `aria-current`. Primary buttons darken one ramp step on hover (`--color-accent-600`) and another when pressed. Keyboard focus is always `:focus-visible { outline: 2px solid var(--color-accent); }` — never the browser default, never removed. Cancel / Dismiss / Close stay quiet: ghost or secondary, no color, no shortcut chip.

## Components

| Class | What it is | Shown in |
| --- | --- | --- |
| `.btn` + `.btn-primary/-secondary/-ghost/-danger/-icon/-block` | Actions — one solid accent primary per view; danger for irreversible confirms | components/buttons.html |
| `.tag` + `.tag-accent/-accent-2/-neutral/-outline/-success/-warning/-danger` | Pill labels and status badges | components/buttons.html |
| `.kbd` | Keyboard key chips (mono, 18px cap) | components/buttons.html |
| `.field` + `label`, `.input` (incl. `select.input`, `textarea.input`), `.radio` + `.dot`, `.seg` + `.seg-opt` | Form fields; iOS-style segmented control. A select drops the platform's own chrome and gets the house chevron | components/forms.html |
| `.card` + `.card-kicker/-title/-body/-meta`; `.elev-sm/md/lg` | Bordered content cards; elevation utilities | components/cards.html |
| `.status` + `.status-dot`, variants `.status-todo/-progress/-review/-done/-blocked` | State dots + labels | components/status.html |
| `.avatar` + `.avatar-sm/-lg/-agent`, `.avatar-group` | People are circles, agents are squircles | components/status.html |
| `.nav` + `.nav-brand` | The top bar | components/navigation.html |
| `.sidebar` + `.sidebar-section/-item` (+ `.count`) | The app sidebar — 28px rows on the surface tint | components/navigation.html |
| `.tabs` + `.tab` | Underline tabs (`aria-selected`) | components/navigation.html |
| `.list` + `.list-row` + `.row-id/-title/-meta` | Dense issue-row lists — mono IDs, ellipsized titles | components/table.html |
| `.table` | Data tables, uppercase headers, hover rows | components/table.html |
| `.board` + `.board-col` + `.board-col-head` | Kanban columns on the surface tint | components/cards.html |
| `.dialog-backdrop` + `.dialog` (+ `-title/-body/-actions`) | Modal at floating elevation | components/dialog.html |
| `.toast` (+ `-title/-body/-action`) | Inverse dark notice, bottom corner | components/dialog.html |
| `.cmdk` + `.cmdk-input/-list/-section/-item` (+ `.keys`) | The ⌘K command palette | components/command.html |
| `.frame` | Crisp image frame — hairline edge, small radius | foundations/image.html |
| `.page-head` + `.page-desc/-actions` | Page title (24px) with a one-line description; page-level actions right | components/settings.html |
| `.section` + `.section-title/-desc/-tools` | A settings section: title, one line, optional controls at the right | components/settings.html |
| `.set-group` + `.set-row` + `.set-text/-title/-desc/-ctl` | Settings rows in a bordered group — title + one sentence left, the control at the row end | components/settings.html |
| `.toggle` + `.knob` | On/off switch (native checkbox) | components/settings.html |
| `.choice` + `.choice-pv/-label` | Pick one look from a few preview cards (native radio) | components/settings.html |
| `.path` | A file path — mono, muted, never wraps (ellipsize the middle in code) | components/settings.html |
| `.hr` | Hairline rule | — |

## Settings grammar

Every settings page is one skeleton: `.page-head` (title, one line, page actions at the right), then `.section`s, each with one `.set-group`. A `.set-row` is a title and **one** sentence on the left and the control at the row end — toggle, `.seg`, `select.input`, `.input`, `.path` + a secondary button, or a `.status`. Controls sit on one vertical line so the eye can scan what is changeable; details go behind a link, not into a second sentence. A control that commits itself (toggle, select, seg) needs no Save; a free-text input that must not be applied half-typed keeps a quiet Save beside it. See components/settings.html.

## Do

- Keep the chrome monochrome; let one accent-filled primary action own each view.
- Align: labels left, numbers and shortcuts right, in `--font-mono`.
- Use `color-mix` ink tints for hover/selection so both themes stay aligned automatically.
- Use `.status-*` semantics for state — a status keeps its hue in both themes.

## Don't

- No gradients, no decorative color floods, no rounded-corner inflation past `--radius-lg`.
- Don't nest cards inside cards; prefer a hairline or whitespace.
- Don't restyle focus, hover or selection per page — they're system-wide.
- Don't decorate Cancel/Close, and never use `danger` for them.

## Files

- `styles.css` — the only stylesheet: both palettes' tokens plus the component layer.
- `spec.md` — this guide (in the source design project: `readme.md`). `theme.json` — the machine-readable record.
- `README.md` — repo-side map: provenance, what was left behind in the design project, and how to sync either way.
- `foundations/` — color.html (both palettes + ramps), type.html, cjk.html (中文排版), layout.html, icons.html, image.html.
- `components/` — buttons, forms, cards, navigation, table, dialog (+ toast), command (⌘K), status (+ avatars), settings (page head, sections, rows, toggle, choice cards).
- `assets/photo.jpg` — the reference photograph used by foundations/image.html.
