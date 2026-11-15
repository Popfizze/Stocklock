# Tests E2E de navigation (Playwright)

Les parcours réels de l'application, joués dans Chromium contre le serveur de développement Vite.
Aucune connexion, aucun backend : chaque requête à l'API reçoit une réponse **déterministe** tirée des
fixtures des tests unitaires (`src/test/`), interceptée dans le navigateur. La suite tourne hors ligne.

## Lancer

```bash
cd frontend
npm ci
npx playwright install chromium   # une seule fois
npm run test:e2e                  # toute la suite (≈ 3 min)
```

| Commande | Effet |
|---|---|
| `npm run test:e2e` | la suite simulée (projet `chromium`) et, si `E2E_API_BASE_URL` est défini, le projet `live` |
| `npm run test:e2e -- e2e/labo.spec.ts` | un seul fichier |
| `npm run test:e2e -- -g "Relancer"` | les tests dont le titre contient ce texte |
| `npm run test:e2e -- --ui` | le mode interactif de Playwright |
| `npx playwright show-report e2e/.report` | le rapport HTML de la dernière exécution |
| `npx tsc -p e2e` | vérification des types de la suite |

Playwright démarre lui-même `npm run dev` sur le port **4173** (`E2E_PORT` pour en changer) avec
`VITE_API_BASE_URL=http://api.stocklock.test`, un hôte qui n'existe pas : rien ne peut partir vers un
vrai serveur. Les scènes 3D sont réellement dessinées (WebGL logiciel, SwiftShader), ce qui permet de
glisser les blocs du portefeuille et les colonnes de la table de mixage.

## Ce que la suite couvre

| Fichier | Parcours |
|---|---|
| `profiles.spec.ts` | redirection sans profil ; choisir Amira, Mateo ou Robert (souris et clavier) → son tableau de bord commence par **ses** sections, avec les verdicts et ses limites ; marqueur « Battage élevé » ; secteur exclu de Mateo ; changer de profil depuis le menu ; « Changer de profil » |
| `stock.spec.ts` | recherche (action, cryptomonnaie, sans résultat) → fiche titre : verdict « Pour {profil} », score et sa scène, battage → « Prendre du recul » prérempli → analyse du biais → « Quel compte ? » ; « Comprendre » (ruban + parcours au clavier) ; score personnel après réglage des pondérations ; titre inconnu ; adresse inconnue |
| `portfolio.spec.ts` | exemple du profil et plafond ; poids au clavier, retrait, persistance, retour à l'exemple ; ajout par recherche (clic) et **en glissant un résultat sur les blocs** ; glisser un bloc (poids), hors de la scène (retrait), une suggestion (ajout) ; table de mixage : **score suivi en direct**, suggestions reclassées, total à 100 %, glisser une colonne ; un portefeuille par profil |
| `labo.spec.ts` | console : frise, liste, filtres envoyés au registre (statut, pipeline, profil, **date → `since`**) ; ouvrir une exécution → une étape → un élément généré → son aperçu ; comparer deux exécutions ; groupe et titre non terminé ; lancer le pipeline de score sur des titres choisis par la recherche → page de l'exécution ; lancer un pipeline du Labo sur le portefeuille ; **« Relancer » reprend groupe et réglages** ; exécution inconnue (« introuvable », sans interrogation en boucle) ; **409** (déjà en cours) ; **503** (non déployé) |
| `shell.spec.ts` | navigation principale ; menu réduit en rail, gardé après rechargement ; thème sombre (choix, persistance, thème du système) ; **animations** : activées par défaut même quand le système demande moins de mouvement, l'interrupteur « Animations : activées / réduites » fige les scènes et coupe les entrées, le choix tient au rechargement ; **un seul contexte WebGL par page** (choix du profil, fiche titre et ses six scènes, puis navigation) et scènes réellement peintes ; pied du rail réduit au profil, dont le menu porte les réglages d'affichage ; téléphone 375 px : menu, aucune page ne déborde ; **sans WebGL** (mosaïques à plat) ; API injoignable ; section en échec puis relancée ; analyse du portefeuille en échec |

Chaque test échoue aussi s'il laisse une erreur dans la console du navigateur.

### Organisation

- `support/api.ts` — toute l'API simulée : `mockApi(page, options)` répond depuis les fixtures ; ce qu'elles
  ne contiennent pas tel quel (la fiche de n'importe quel titre, une analyse de portefeuille qui suit les
  titres et les pondérations envoyés) en est dérivé, de façon déterministe. Options : `scoreRunning` (409),
  `scoreUnconfigured` (503), `override` (réponse sur mesure, par exemple une erreur).
- `support/app.ts` — `test` (API simulée et contrôle de la console branchés d'office), `openAs(page, profil, chemin)`,
  `scene()`, `sceneTag()` (l'étiquette qu'une scène écrit sur une tuile : c'est ainsi que les tests savent où glisser),
  `trackWebglContexts()` (compte les contextes WebGL ouverts par la page) et `isPainted()` (le canevas d'une scène a bien été dessiné).

## Projet `live` : quelques vérifications sur l'API déployée (optionnel)

```bash
E2E_API_BASE_URL=https://<url-de-l-api> npm run test:e2e -- --project=live
```

Sans `E2E_API_BASE_URL`, ces tests sont **ignorés** (`skipped`). Ils sont en lecture seule : profils,
tableau de bord, recherche et fiche titre, analyse du portefeuille d'exemple, liste des exécutions.
Ils ne se connectent jamais au site en ligne (protégé par un mot de passe) : seule l'API est appelée.

### CORS : pourquoi un proxy

L'API n'accepte, en appel direct depuis un navigateur, que les origines de `CORS_ORIGINS` : le domaine
CloudFront et `http://localhost:5173`. Un serveur de développement sur un autre port (ou un 5173 déjà
occupé) est donc refusé par le navigateur. Le projet `live` contourne cela sans toucher à l'API : il démarre
un second serveur Vite (port **4174**, `E2E_LIVE_PORT`) avec le **proxy de développement**, qui sert `/api`
sur la même origine que la page.

Ce proxy sert aussi à travailler à la main sur des données réelles, depuis n'importe quel port :

```bash
VITE_DEV_PROXY_TARGET=https://<url-de-l-api> npm run dev
```

Il est désactivé par défaut (`vite.config.ts`) ; quand il est actif, `src/lib/env.ts` fait pointer le client
vers le serveur de développement lui-même, et `VITE_API_BASE_URL` est ignoré. Il n'existe qu'en
développement : un build de production appelle toujours `VITE_API_BASE_URL`.
