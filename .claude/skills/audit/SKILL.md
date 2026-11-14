---
name: audit
description: Quality audit of the frontend. Run after making changes to verify code follows the frontend architecture patterns. Checks component standards, data layer, and TypeScript strictness.
user-invocable: true
argument-hint: "[file or directory to audit, or 'all' for full scan]"
---

# Code Audit

Run this after making changes to verify they follow project architecture.

Reference standards:
- Frontend patterns: @.claude/skills/frontend/SKILL.md

---

## How to Audit

1. Identify which files were changed (use `git diff --name-only` or the argument provided)
2. Read each changed file
3. Run the checklist below
4. Report findings grouped by severity: **CRITICAL** -> **WARNING** -> **INFO**

If no argument is provided, audit all uncommitted changes.

---

## Frontend Checklist

### CRITICAL -- Standards

- [ ] No `any` type -- use proper interfaces or `unknown`
- [ ] No hardcoded colors -- uses theme tokens (`bg-primary`, `text-muted-foreground`, etc.)
- [ ] No inline styles (`style={{}}`) -- uses Tailwind classes
- [ ] No `!important`
- [ ] React Query for data fetching -- no `useEffect` for API calls

### WARNING -- Component Quality

- [ ] Pages under 300 lines, components under 200 lines, API hooks under 400 lines
- [ ] Reuses existing Shadcn components from `src/components/ui/` before creating custom
- [ ] `Dialog` components include `DialogDescription` (even if `sr-only`)
- [ ] Navigation/sidebar uses `<Link>` not `onClick` + `navigate()`

### WARNING -- Data Layer

- [ ] Query keys use hierarchical factory pattern (`KEYS.list(filters)`)
- [ ] Mutations invalidate relevant query keys on success
- [ ] No new contexts added without justification
- [ ] Every `localStorage` read and write is wrapped in try/catch

### INFO -- Conventions

- [ ] `console.debug` not `console.log` in committed code
- [ ] TypeScript interfaces for all component props
- [ ] `cn()` utility for conditional classnames
- [ ] Lazy loading for page components in router
- [ ] Code in English, UI text in French

---

## Report Format

```
# Audit Report

## Files Audited
- path/to/file1.tsx
- path/to/file2.ts

## CRITICAL (N issues)
1. **[file:line]** -- description of issue and how to fix

## WARNING (N issues)
1. **[file:line]** -- description

## INFO (N issues)
1. **[file:line]** -- description

## Summary
N critical / N warning / N info
Action: fix critical issues before committing
```
