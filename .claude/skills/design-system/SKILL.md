---
name: design-system
description: Design system rules — monochrome tile language, OKLCh tokens, Jost/Inter type, Shadcn UI patterns, Tailwind discipline and the three.js 3D rules. Use when writing or reviewing any UI code (components, pages, styling). Auto-activates on frontend files.
user-invocable: true
argument-hint: "[optional: colors|type|components|motion|3d]"
---

# Design System — StockLock

A **monochrome of cool greys built from square tiles**: near-black ink on white, hairline borders, large radii, almost no shadow, big light titles, upper-case labels. Colour only carries meaning. Built on **Tailwind CSS v4** + **Shadcn UI** + **CSS custom properties in OKLCh** (`frontend/src/styles/tokens.css`, extras in `frontend/src/styles/index.css`), light + dark.

---

## Colour

| Role | Token / utility | Light value |
|---|---|---|
| Page, cards | `bg-background`, `bg-card` | white |
| Soft surface (tags, hover, skeleton) | `bg-muted`, `bg-secondary`, `bg-accent` | `#F3F4F6` |
| Ink: text, primary buttons, active states | `text-foreground`, `bg-primary` | `#0B0B0C` |
| Secondary text, labels | `text-muted-foreground` | `#6B6E77` |
| Waiting text (unlit, placeholders) | `text-faint` | `#C9CCD2` |
| Hairlines, field borders | `border-border`, `border-input` | `#D9DBE0` |
| Tile scale, 1 = ink … 8 = softest | `bg-tile-1` … `bg-tile-8`, `fill-tile-N`, `text-tile-N` | `#0B0B0C #2A2C31 #4A4D55 #6B6E77 #A9ACB5 #D9DBE0 #E7E9ED #F3F4F6` |

- **Colour = meaning only**: `text-success` / `text-destructive` for gains and losses and for ok / error states, `text-warning` for attention (all desaturated to sit with the greys); `account-*` for the four accounts of Comptes. Nothing else is coloured — charts use `chart-1…5` (ink and greys).
- **Never hardcode a colour** (`#fff`, `rgb()`, `bg-blue-500`, `bg-white`, `text-black`, `dark:bg-slate-800`). New tokens go in `tokens.css` / `index.css` with a dark value, never in a component.
- Dark mode (`.dark` on `<html>`) mirrors the scale: `tile-1` stays the strongest tile against the background.

## Type

- **Display: Jost** (`font-display`, weights 400/500) — every `h1`/`h2` (400) and `h3` (500) gets it automatically, tight tracking; do not fight it with `font-semibold`/`font-bold` on headings. Big figures: class `display` (tabular numbers).
- **Text: Inter** (`font-sans`, the default).
- **Label**: class `eyebrow` (alias `label-caps`) — Jost 500, 12 px, upper case, letter-spacing 0.16em, muted. Use it for section labels, table captions, small headers.
- A title can quieten its second half: `<h1>Tableau <em>de bord</em></h1>` (`em` is upright and muted inside headings). `PageHeader` does it with its `accent` prop.
- Numbers line up: `tabular-nums` (automatic in `td`, `dd`, `.display`).
- Fonts are bundled with `@fontsource-variable/jost` and `@fontsource-variable/inter` (imported in `index.css`); no font CDN.

## Components

- **Buttons** (`Button`): pills, 44 px high (`size="default"`), upper-case Jost label; `variant="default"` solid ink, `variant="outline"` ghost with a hairline border that darkens on hover. Smaller: `sm` (36 px), `xs` (28 px) for dense rows. Icon buttons need an `aria-label`.
- **Cards** (`Card`): white, 1 px hairline border, large radius — 28 px by default (`rounded-3xl`), `size="sm"` for dense cards (20 px). No shadow, no gradient. Prefer hairline dividers (`divide-y divide-border`, `border-y`) to boxes inside boxes.
- **Fields** (`Input`, `Select`, `Textarea`): 44 px, pill, hairline border on the page background.
- **Tags** (`Badge`): small upper-case pills; `success` / `warning` / `destructive` only for states.
- **Tabs**: underlined, not pills. **Tables**: muted header, hairline rows.
- Radii come from `--radius` (1rem): `rounded-lg` 16, `rounded-xl` 20, `rounded-2xl` 24, `rounded-3xl` 28.
- Shadcn primitives first (`src/components/ui/`), then shared components, then a new one. `cn()` for conditional classes. No `style={{}}` unless the value is computed at run time, no `!important`, no arbitrary widths.

## Tile motifs (`src/components/tiles/`)

- `TileGauge` — a 10 × 10 grid of tiles with N filled, for a score or a percentage (always with the number next to it and an `aria-label`).
- `TileMosaic` — a decorative band of tiles in the grey scale (seeded, identical on every load, `aria-hidden`).
- Pictograms are drawn with square tiles (`<rect>` on a grid, `fill-tile-N`), never with icons that fight the language.

## Motion

- One easing: `ease-tile` = `cubic-bezier(0.4, 0, 0.25, 1)`.
- Entrances: `fade-up` (rise 16 px while fading in), `flip-in` (for big figures), `tile-in` (tiles); a parent with `stagger` plays its children 60 ms apart.
- **`prefers-reduced-motion` is respected everywhere**: the entrance classes switch off by themselves; any other animation must check it (`motion-reduce:` variants, or `usePrefersReducedMotion()`).
- Motion never delays reading a number: content is in the DOM at once.

## 3D (three.js) rules

Every screen has at least one 3D element, and each one **tells a story, illustrates a piece of information, or is the impressive moment** — state its purpose in a one-line comment above the component.

- Use the shared engine: `Tile3D` from `src/components/three/` — you describe tiles (`x`, `z`, `h`, `tone`, `label`), it renders them. Do not create a second renderer set-up.
- `three` is **lazy-loaded** (`React.lazy` inside `Tile3D`): never import `three` from a page or from the main bundle.
- **Plain equivalent required**: every scene has an `aria-label` that summarises the information, and the same information exists as text or a table on the page. The 3D never is the only place a number lives.
- **Fallbacks**: no WebGL → the flat SVG mosaic of the same tiles; reduced motion → one static rendered frame.
- **Performance**: one canvas per view where possible, instanced meshes, device pixel ratio capped at 2, paused off-screen and when the tab is hidden, everything disposed on unmount.
- Colours come from the tokens (resolved at run time), tones are the tile scale plus `up` / `down` / `alert` for meaning.
- A scene never blocks or overlaps the data, and never captures the scroll.

## Checklist

- [ ] Tokens only, no hardcoded colour; colour only where it means something
- [ ] Headings in Jost (automatic), labels with `eyebrow`, numbers tabular
- [ ] Pills 44 px, cards hairline + large radius, hairline dividers
- [ ] Entrances respect reduced motion
- [ ] 3D: purpose comment, lazy, accessible equivalent, fallback, paused off-screen, disposed
- [ ] Mobile first; semantic HTML; UI text in French, code in English
