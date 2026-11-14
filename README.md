# StockLock

Assistant d'investissement agentique et auto-explicatif, développé pour le Datathon PolyFinances 2026 (défi AlphaForge AI, avec la Banque Nationale et AWS). Il éclaire une décision d'investissement selon le profil de l'investisseur, sur des données publiques, et justifie chaque résultat par ses sources, ses hypothèses et ses limites. **Simulation uniquement : aucune transaction réelle, aucun conseil financier personnalisé.**

Quatre étapes, chacune construite comme un pipeline de données :

1. **Choisir** : un score par entreprise, calculé sur le titre lui-même (relevés financiers, prix, événements politiques et économiques), puis des propositions de titres selon le portefeuille.
2. **Comprendre** : pourquoi un titre a fluctué, mis en relation avec les événements politiques et économiques.
3. **Optimiser fiscalement** : quel compte utiliser pour quel actif (CELI, REER, CELIAPP), comparé après impôt sur 15 ans.
4. **Se protéger des biais** : repérer une demande dictée par l'émotion ou le battage médiatique, et la confronter au profil.

Pas de connexion : on choisit un profil de démonstration (Amira, Mateo ou Robert). L'onglet **Labo** exécute chaque pipeline avec les options choisies et montre le résultat de chaque stage.

L'onglet **Comptes** (`/comptes`, étape 3) explique le CELI, le REER, le CELIAPP et le compte non enregistré : règles et plafonds 2026 sourcés, parcours d'un dollar, comparaison côte à côte, quel actif dans quel compte, et une projection après impôt sur 15 ans selon le profil, avec graphiques. Son sous-onglet **Par titre** montre la section que la fiche d'un titre affichera : `<StockAccountOptions ticker="JNJ" />` (`frontend/src/features/accounts`) donne, pour le profil actif, le verdict de chaque compte et la projection pour ce titre (retenue américaine, crédit pour dividendes, intérêts). Routes : `GET /api/accounts/rules`, `GET /api/accounts/assets`, `POST /api/accounts/projection` ; calcul déterministe dans `backend/app/services/account_*.py`. Les revenus des profils (`tax_profile` dans `personas.json`) sont des valeurs de démonstration, et les rendements supposés viennent des normes d'hypothèses de projection 2026 de l'Institut de planification financière et de FP Canada (`backend/app/rules/projection_assumptions_2026.json`).

## Structure

| Dossier | Contenu |
|---|---|
| `frontend/` | React 19, TypeScript, Vite, Tailwind et shadcn/ui |
| `backend/` | API FastAPI, agents Strands Agents sur Amazon Bedrock, déployables sur Bedrock AgentCore Runtime |
| `alphaforge_starter/` | Jeu de données de départ du case : prix, opérations sur titres, USD/CAD, séries macro, métadonnées |

## Prérequis

- Python 3.11 ou plus
- Node.js 20 ou plus, et npm
- Un accès AWS en région `us-east-1` avec Amazon Bedrock (identifiants dans `~/.aws/credentials` ou dans les variables d'environnement)

## Lancer en local

### Backend (port 8000)

```bash
cd backend
python -m venv .venv
```

Activer l'environnement : `.venv\Scripts\Activate.ps1` sous Windows (PowerShell), `source .venv/bin/activate` sous macOS et Linux.

```bash
pip install -r requirements.txt
```

Copier `backend/.env.example` en `backend/.env` et l'ajuster (voir Configuration), puis :

```bash
uvicorn app.main:app --reload --port 8000
```

Tests :

```bash
pytest
```

### Frontend (port 5173)

```bash
cd frontend
npm ci
```

Copier `frontend/.env.example` en `frontend/.env`, puis :

```bash
npm run dev
```

L'application est sur http://localhost:5173. Vérifications : `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

## Configuration

Backend (`backend/.env`) :

| Variable | Rôle |
|---|---|
| `AWS_REGION` | Région AWS (`us-east-1`) |
| `BEDROCK_MODEL_ID` | Modèle Bedrock des explications (ex. `global.anthropic.claude-sonnet-5`) |
| `BEDROCK_FAST_MODEL_ID` | Modèle Bedrock des tâches courtes (ex. `global.anthropic.claude-haiku-4-5-20251001-v1:0`) |
| `AGENT_MODE` | `local` (agents exécutés par l'API) ou `agentcore` (agent déployé sur Bedrock AgentCore Runtime) |
| `AGENTCORE_RUNTIME_ARN` | ARN du runtime AgentCore, en mode `agentcore` |
| `SEC_USER_AGENT` | En-tête exigé par SEC EDGAR : nom et contact de l'équipe |
| `CORS_ORIGINS` | Origines autorisées (frontend) |
| `DATA_DIR` | Dossier des données de départ (`alphaforge_starter/`) |
| `CACHE_DIR` | Cache disque des appels aux sources externes |

Frontend (`frontend/.env`) : `VITE_API_BASE_URL` (adresse de l'API, `http://localhost:8000` par défaut), `VITE_DEV_PORT` (5173).

## Données

- **Jeu de départ** (`alphaforge_starter/`) : 31 actifs, prix quotidiens du 12/11/2021 au 12/11/2026, opérations sur titres, USD/CAD, 9 séries macro (Banque du Canada, FRED). Ses sources et conditions d'utilisation sont dans `alphaforge_starter/sources_metadata.csv`. Ne pas lancer `build_dataset.py` dans ce dossier : il retélécharge les données et écrase les CSV.
- **Sources publiques ajoutées**, sans clé : SEC EDGAR (relevés financiers des émetteurs américains), yfinance (relevés et cours des titres canadiens), GDELT (événements politiques et économiques).
