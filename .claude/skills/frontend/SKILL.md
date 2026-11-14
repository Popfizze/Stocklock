---
name: frontend
description: Frontend architecture patterns. Use when writing or modifying any frontend code — pages, components, hooks, API calls, routing, styling. Activates automatically when working on frontend files.
user-invocable: true
argument-hint: "[optional: page|component|api|routing]"
---

# Frontend Architecture

React 19 + TypeScript + Vite. Shadcn UI + Tailwind CSS. React Query for server state. React Router v7 for navigation.

There is **no login**: the backend (FastAPI) is open, and the user picks an
investor profile (`/choisir-profil`) instead of signing in.

---

## App Structure

```
src/
+-- main.tsx              Entry point
+-- App.tsx               QueryClientProvider -> ActivePersonaProvider -> BrowserRouter -> Routes
+-- api/
|   +-- client.ts         apiClient: minimal JSON client, throws ApiError
|   +-- client.test.ts    the client's contract tests — keep green
|   +-- personas.ts       Persona type + usePersonas() (GET /api/personas)
|   +-- {domain}.ts       Domain-specific React Query hooks
+-- components/
|   +-- ui/               Shadcn components, copy-in per app (button, card, ...)
|   +-- layout/           AppLayout, AppSidebar
+-- features/
|   +-- personas/         ChoosePersonaPage, RequirePersona, useActivePersona
|   +-- dashboard/        Dashboard page
|   +-- {module}/         Feature pages + components, colocated
+-- hooks/                Custom React hooks
+-- lib/                  env.ts (API_BASE_URL), utils.ts (cn)
+-- styles/
    +-- index.css          @import tailwindcss + ./tokens.css + app extras
    +-- tokens.css         design tokens (OKLCh) — untouched baseline
+-- test/                 mockFetch, renderWithProviders, persona fixtures
```

---

## Components & Styling

### Shadcn UI

Style: `new-york`. Components live in `src/components/ui/`.

**Priority when building UI:**
1. Use installed Shadcn component (`src/components/ui/`)
2. Use existing shared/feature component
3. Install new Shadcn component (`npx shadcn@latest add {component}`)
4. Registry components (`@animate-ui`, `@originui`, `@kibo-ui`, `@jollyui`)
5. Custom component (last resort)

### Tailwind -- Rules

- **Theme tokens only** -- `bg-primary`, `text-muted-foreground`, `border-divider`, etc.
- **No hardcoded colors** -- never `#fff`, `rgb()`, `text-[#123]`
- **No inline styles** -- never `style={{}}` or `sx` props
- **No `!important`**
- **Use `cn()` utility** for conditional classnames

### Theming

CSS variable-based theming:
- Customize colors via CSS variables in `src/styles/index.css`
- Light/dark mode via `.dark` class on `<html>`
- All components use theme tokens, so changes apply globally

### File Size Limits

- Pages: **300 lines** max
- Components: **200 lines** max
- API hook files: **400 lines** max

Extract into sub-components if over limit.

### Accessibility

All `Dialog` components must include `DialogDescription` (even if `sr-only`):

```tsx
<DialogHeader>
  <DialogTitle>Title</DialogTitle>
  <DialogDescription className="sr-only">Description for screen readers</DialogDescription>
</DialogHeader>
```

---

## State Management

### React Query (server state)

Used for ALL data fetching. No `useEffect` for API calls.

```tsx
// Query key factory pattern
export const PROJECT_QUERY_KEYS = {
  all: ['projects'] as const,
  lists: () => [...PROJECT_QUERY_KEYS.all, 'list'] as const,
  list: (filters?: Filters) => [...PROJECT_QUERY_KEYS.lists(), filters] as const,
  details: () => [...PROJECT_QUERY_KEYS.all, 'detail'] as const,
  detail: (id: number) => [...PROJECT_QUERY_KEYS.details(), id] as const,
};

// Query hook
export function useProjects(filters?: Filters) {
  return useQuery<PaginatedResponse<Project>>({
    queryKey: PROJECT_QUERY_KEYS.list(filters),
    queryFn: async () => apiClient.request(`/api/projects/?${params}`),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

// Mutation with cache invalidation
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectData) => apiClient.request('/api/projects/create/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROJECT_QUERY_KEYS.lists() });
    },
  });
}
```

### Contexts (client state)

Keep contexts minimal. The one context is `ActivePersonaProvider`
(`features/personas/`): the chosen profile id, kept in `localStorage` (every
read and write in a try/catch), read through `useActivePersona()`, which also
returns the profile itself from `usePersonas()`. Do not add new contexts
without strong justification -- prefer React Query for server state.

---

## API Layer

### apiClient (`src/api/client.ts`)

Minimal JSON client (contract-tested in `client.test.ts` — keep it green):
- base URL `VITE_API_BASE_URL` (`src/lib/env.ts`)
- no credentials, no CSRF, no token refresh — the backend has no auth
- a string body is sent as `application/json` unless the caller set a Content-Type
- every failure throws an `ApiError`: `message` from the body's `detail`, then
  `message`; `status` 0 when the server could not be reached

```tsx
// Usage in hooks
const data = await apiClient.request<Thing[]>('/api/things');
const result = await apiClient.request<Thing>('/api/things', {
  method: 'POST',
  body: JSON.stringify(payload),
});
```

---

## Routing

### Structure

```tsx
<Route path="/choisir-profil" element={<ChoosePersonaPage />} />
<Route
  path="/"
  element={
    <RequirePersona>
      <DashboardPage />
    </RequirePersona>
  }
/>
```

### Guards

- `RequirePersona` -- requires a chosen profile (one the API knows), redirects to `/choisir-profil`

### AppLayout

Wraps every page reached once a profile is chosen:
- `AppSidebar` -- collapsible sidebar with `<Link>` navigation (not onClick+navigate)
- Content area with responsive layout
- `Suspense` around content for lazy page loading

---

## Error Handling

### API Errors

```tsx
// apiClient throws typed errors (src/api/client.ts)
interface ApiError {
  message: string;
  status: number; // 0 = server unreachable
  details?: unknown;
}

// Type the query's error so pages can read `error.status`
useQuery<Persona[], ApiError>({ ... })
```

Show a clear French message on error (server unreachable vs HTTP status), never a raw English `message`.

### Suspense

Use `<Suspense>` with fallback spinners for lazy-loaded pages.

---

## TypeScript

- **No `any` type** -- use `unknown` and narrow, or proper interfaces
- Proper interfaces for all component props
- React Query hooks typed with response generics: `useQuery<ResponseType>`

---

## Anti-Patterns

| Don't | Do |
|---|---|
| `useEffect` for data fetching | `useQuery` |
| `onClick={() => navigate(path)}` in navigation/sidebar | `<Link to={path}>` |
| Hardcoded colors (`#fff`, `text-red-500`) | Theme tokens (`text-foreground`, `text-destructive`) |
| `any` type | Proper interface or `unknown` |
| `console.log` in committed code | `console.debug` or remove |
| New context for server data | React Query |
| `style={{}}` inline | Tailwind classes |
