# StockLock

**Team 17:** Bryan Sanchez, Loic Chen, Thomas Pajic, Tan Tommy Rin

Assistant d'investissement agentique et auto-explicatif, développé pour le Datathon PolyFinances 2026 (défi AlphaForge AI, avec la Banque Nationale et AWS). Il éclaire une décision d'investissement selon le profil de l'investisseur, sur des données publiques, et justifie chaque résultat par ses sources, ses hypothèses et ses limites. **Simulation uniquement : aucune transaction réelle, aucun conseil financier personnalisé.**

Quatre étapes, chacune construite comme un pipeline de données :

1. **Choisir** : un score par entreprise, calculé sur le titre lui-même (relevés financiers, prix, événements politiques et économiques), puis des propositions de titres selon le portefeuille.
2. **Comprendre** : pourquoi un titre a fluctué, mis en relation avec les événements politiques et économiques.
3. **Optimiser fiscalement** : quel compte utiliser pour quel actif (CELI, REER, CELIAPP), comparé après impôt sur 15 ans.
4. **Se protéger des biais** : repérer une demande dictée par l'émotion ou le battage médiatique, et la confronter au profil.

Pas de connexion : on choisit un profil de démonstration (Amira, Mateo ou Robert). L'onglet **Labo** exécute chaque pipeline avec les options choisies et montre le résultat de chaque stage.

Sur la fiche d'un titre, **Pourquoi le titre a bougé ?** (étape 2, `<StockMoves />`) compare le titre à son indice (XIU.TO, QQQ ou SPY ; modèle de marché avec un bêta estimé sur l'année précédente, sinon différence simple) sur les 3, 6 ou 12 derniers mois du kit ou sur une année (2022 à 2025), et repère les séances où l'écart dépasse 2 σ. Chaque séance est rapprochée des événements datés des 3 jours précédents : décisions de taux de la Banque du Canada et de la Fed (séries V39079 et DFF du kit, datées du jour de l'annonce), décisions politiques de la présidence américaine (décrets, proclamations et mémorandums du Federal Register sur les tarifs, le commerce et les sanctions, ou sur le secteur du titre), pics de couverture mondiale des tarifs et sanctions (GDELT), opérations sur titres, dépôts EDGAR (8-K décrits par leurs items, dont les changements de direction 5.02) et pics de couverture GDELT du titre. Les événements politiques, de taux et de direction où le titre a le plus bougé sur deux séances forment la liste « Événements politiques et économiques de la période », avec la réaction du titre et de l'indice. Un crawler lit les articles et les communiqués des 8-K (pièce 99) proches des mouvements, en respectant le robots.txt de chaque site ; Claude Haiku résume et date chaque événement (un résumé avec un chiffre absent de la page, ou une date hors de la semaine qui précède la publication, est refusé), puis juge si le lien est plausible en citant l'événement mot pour mot. Chaque mouvement est ainsi expliqué par un **fait daté**, une **hypothèse** ou **aucun événement**, sans jamais présenter une coïncidence comme une cause. Route : `POST /api/explain-move/stock` (`{persona_id, ticker, period: "3m" | "6m" | "1y" | "2022"}`) ; dans le Labo, l'étape 2 montre les nouveaux stages (décisions de taux, crawler, résumé des événements, lien plausible) avec leurs décisions.

Sur la fiche d'un titre, **Prendre du recul** analyse une intention écrite en la confrontant au profil et aux variations et volumes historiques du titre. Les 31 titres du kit utilisent ses cours ; pour les autres, l'historique Yahoo Finance est utilisé lorsqu'il est disponible. L'analyse du message reste possible si l'historique manque. La comparaison de 2022 porte sur le titre sélectionné ; elle nécessite un historique couvrant l'année et une devise CAD ou USD, et s'arrête au plus tard à la fin des données de liquidités et de change du kit. La vente au creux est un scénario extrême connu après coup. Les profils ne contiennent pas d'historique de décisions personnelles : les signaux ne démontrent donc pas une habitude ou une intention impulsive. La route dédiée `POST /api/bias/stock` utilise les mêmes agents et replis Bedrock/AgentCore que le pipeline du Labo.

Le signal média de cette étape indique sa **source**, sa **date la plus récente**, sa **fenêtre observée** et sa couverture : GDELT DOC 2.0 (articles en anglais, couverture internationale) ou Yahoo Finance lorsque GDELT est indisponible. Il décrit un contexte de marché et ne permet jamais, à lui seul, de conclure qu'une décision est impulsive. Le détecteur déterministe de biais est suivi par un petit corpus français annoté ; lancez `cd backend && python scripts/evaluate_bias_lexicon.py` pour obtenir précision, rappel et la liste des faux positifs/faux négatifs de cette référence. Claude Haiku reste optionnel et ses extraits sont rejetés s'ils ne sont pas verbatim. Après une analyse, la personne peut aussi indiquer si elle l’a trouvée pertinente ; ce retour reste seulement dans son navigateur et n’est pas transmis.

L'onglet **Comptes** (`/comptes`, étape 3) présente le CELI, le REER, le CELIAPP et le compte non enregistré par des faits et des règles, sans aucune recommandation. Trois filtres règlent l'affichage : la façon de voir (**Le parcours**, un organigramme de l'argent de l'ouverture au retrait ; **Côte à côte**, ce que chaque compte permet et l'arithmétique REER ou CELI ; **Par objectif**, les comptes dont les règles s'appliquent à un objectif ; **En chiffres**, la projection après impôt sur 15 ans d'une épargne ou d'un titre), le niveau de détail (**Simple**, sans chiffres ; **Normale**, avec les explications et les principaux graphiques ; **Complexe**, avec tous les chiffres, règles et sources) et les comptes affichés. Les détails sont dans des menus déroulants, et les questions fréquentes suivent chaque vue. La vue est dans l'URL (`?vue=comparer&niveau=normale&comptes=CELI,REER`). La fiche de chaque titre du jeu de départ (`/titres/:ticker`) affiche la section « L'impôt selon le compte » : `<StockAccountOptions ticker={ticker} />` (`frontend/src/features/accounts`) projette le titre dans chaque compte pour le profil actif (retenue américaine, crédit pour dividendes, intérêts), avec son propre sélecteur de niveau. Routes : `GET /api/accounts/rules`, `GET /api/accounts/assets`, `POST /api/accounts/projection` (le champ `comparison` situe le montant de chaque compte, sans choisir à la place de l'utilisateur) ; calcul déterministe dans `backend/app/services/account_*.py`. Les revenus des profils (`tax_profile` dans `personas.json`) sont des valeurs de démonstration, et les rendements supposés viennent des normes d'hypothèses de projection 2026 de l'Institut de planification financière et de FP Canada (`backend/app/rules/projection_assumptions_2026.json`).

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
