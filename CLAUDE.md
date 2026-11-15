# StockLock — contexte pour l'agent

**StockLock** est l'application de l'équipe pour le Datathon PolyFinances 2026 (défi AlphaForge AI) : un assistant d'investissement agentique en quatre étapes — score d'entreprise, explication des fluctuations, optimisation fiscale CELI/REER/CELIAPP, détection de biais.

- **Frontend** (`frontend/`) : React 19 + TypeScript + Vite · Shadcn UI + Tailwind CSS · TanStack React Query v5 pour l'état serveur · React Router v7.
- **Backend** (`backend/`) : FastAPI + Strands Agents sur Amazon Bedrock.
- **Pas de connexion** : aucune authentification. L'utilisateur choisit un profil d'investisseur (Amira, Mateo, Robert) sur `/choisir-profil` ; l'id du profil actif est gardé dans `localStorage` et lu par `useActivePersona()`. « Changer de profil » l'oublie et ramène au choix.

Code en anglais, textes d'interface en français.

## Commandes (dans `frontend/`)

| Quoi | Commande |
|---|---|
| Serveur de développement (port 5173) | `npm run dev` |
| Build de production (`VITE_API_BASE_URL` requis) | `npm run build` |
| Tests | `npm test` |
| Tests E2E (Playwright, API simulée ; `npx playwright install chromium` la première fois) | `npm run test:e2e` |
| Lint | `npm run lint` |

L'URL du backend vient de `VITE_API_BASE_URL` (voir `frontend/.env.example`), `http://localhost:8000` par défaut en développement.

## Git

On travaille uniquement sur `main` : `git pull --rebase` avant de pousser.

## Frontend Rules

1. **No hardcoded colors** -- use CSS variable theme tokens (`bg-primary`, `text-muted-foreground`, etc.)
2. **File size limits**: pages 300 lines, components 200 lines, API hook files 400 lines
3. **Strict TypeScript** -- no `any` type
4. **React Query** for all server state; keep contexts minimal

## Skills

Dans `.claude/skills/` :

- **`/frontend`** -- composants, React Query, routage, client API, choix de profil
- **`/design-system`** -- jetons de couleur OKLCh, primitives Shadcn, règles Tailwind
- **`/audit`** -- à lancer après des changements pour vérifier le frontend
