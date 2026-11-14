---
name: design-system
description: Design system rules — OKLCh color tokens, Shadcn UI patterns, and Tailwind discipline. Use when writing or reviewing any UI code (components, pages, styling). Auto-activates on frontend files.
user-invocable: true
argument-hint: "[optional: colors|components|patterns]"
---

# Design System

Single-theme design system built on **Tailwind CSS v4** + **Shadcn UI (New York)** + **CSS Custom Properties in OKLCh**. Ships light + dark variants by default.

The full token list lives in `frontend/src/styles/tokens.css` (overrides go in `frontend/src/styles/index.css`). This skill is the design contract — copy/paste-friendly rules + the top-10 patterns you'll reach for.

---

## Core rules (always apply)

### ✅ DO

1. **Use semantic tokens, never raw Tailwind colors** for surfaces, text, borders:
   - `bg-background`, `bg-card`, `bg-popover` — layered surfaces
   - `text-foreground`, `text-muted-foreground` — body & secondary
   - `border-border`, `border-input`, `ring-ring` — dividers & focus
   - `bg-primary text-primary-foreground` — CTAs (never `bg-blue-500`)
   - `bg-destructive text-destructive-foreground` — danger actions
2. **Compose classes with `cn()`** (clsx + twMerge) from `@/lib/utils`
3. **Use Shadcn primitives first** — `Button`, `Card`, `Dialog`, `Input`, `Select`, `Table`, etc. from `src/components/ui/`
4. **Mobile-first responsive** — default styles apply to mobile, `sm:`/`md:`/`lg:` scale up
5. **Semantic HTML** — `<h1>`-`<h6>` for headings (not `<div className="text-2xl font-bold">`)

### ❌ DON'T

1. **Never hardcode colors**:
   - ❌ `bg-blue-500`, `text-red-600`, `border-gray-300`
   - ❌ `#3B82F6`, `rgb(59, 130, 246)`, `hsl(217, 91%, 60%)`
   - ❌ `dark:bg-slate-800` (overrides tokens in dark mode — anti-pattern)
   - ❌ `bg-white`, `bg-black`, `text-white`, `text-black` (invariant — breaks dark mode)
2. **Never use `style={{}}`** inline unless dynamic (e.g., transform from JS value)
3. **Never use `!important`**
4. **Never use arbitrary widths** like `w-[180px]` — prefer fractional (`w-1/3`), content-based (`w-fit`), or named sizes
5. **Never define new tokens in component files** — they go in `src/styles/index.css` so every component picks them up

---

## Token reference

See `frontend/src/styles/index.css` for the full token list. The template ships the Shadcn baseline:

### Surfaces & content
`--background` / `--foreground` · `--card` / `--card-foreground` · `--popover` / `--popover-foreground`

### Brand & action
`--primary` / `--primary-foreground` · `--secondary` / `--secondary-foreground` · `--accent` / `--accent-foreground` · `--destructive` / `--destructive-foreground`

### Muted (subtle backgrounds, helper text)
`--muted` / `--muted-foreground`

### Borders & focus
`--border` · `--input` · `--ring`

### Charts
`--chart-1` through `--chart-5`

### Sidebar
`--sidebar` / `--sidebar-foreground` · `--sidebar-primary` / `--sidebar-primary-foreground` · `--sidebar-accent` / `--sidebar-accent-foreground` · `--sidebar-border` · `--sidebar-ring`

### Structural
`--radius` (controls corner radius via `rounded-*` Shadcn utilities)

### Domain-specific tokens (add as your app grows)

If your product needs status colors, business-function colors, scoring colors, etc., **add them as tokens in `index.css`** with light + dark variants — don't hardcode them in components.

---

## Light / Dark mode

- `.dark` class on `<html>` toggles dark mode
- Every token has a dark variant under the `.dark` selector in `index.css`
- Never override a dark token with a raw Tailwind color (`dark:bg-slate-800` is the anti-pattern that breaks the token system)

---

## Top-10 patterns

```tsx
// Card with correct tokens
<div className="bg-card text-card-foreground border border-border rounded-lg p-4 shadow-sm">

// Primary CTA button (via Shadcn)
<Button>Save</Button>

// Destructive action
<Button variant="destructive">Delete</Button>

// Muted helper text
<p className="text-sm text-muted-foreground">Optional — leave blank to skip.</p>

// Form field with label + error
<Label htmlFor="email">Email</Label>
<Input id="email" type="email" aria-invalid={!!error} />
{error && <p className="text-sm text-destructive">{error}</p>}

// Page-level container (consistent horizontal padding)
<div className="container mx-auto px-4">

// Sidebar nav link (with active state via tokens)
<Link className={cn(
  "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  isActive && "bg-sidebar-primary text-sidebar-primary-foreground"
)}>

// Empty state
<div className="text-center py-12">
  <p className="text-muted-foreground">No items yet.</p>
</div>

// Disabled state (Shadcn pattern)
<Button disabled={isPending}>{isPending ? "Saving..." : "Save"}</Button>

// Loading skeleton (Shadcn Skeleton)
<Skeleton className="h-4 w-[250px]" />
```

---

## Invoke modes

- `/design-system colors` → tell me which token to use for a given semantic role
- `/design-system components` → list available Shadcn primitives in `src/components/ui/`
- `/design-system patterns` → expand on common layouts (form, dashboard, table)

When invoked from any frontend file, this skill reads `frontend/src/styles/index.css` to verify the token exists before suggesting it.
