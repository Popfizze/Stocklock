// Config ESLint de la chaîne — ses trois imports se résolvent dans le node_modules du
// dépôt, à la racine du repo : la pose y écrit les paquets de `deps_lint` aux versions
// du registre, dans le manifeste RACINE, et une seule passe lit tout l'arbre. Le plugin
// ne les livre plus (19.0.0) : il porte la liste et la recette, le dépôt porte l'outil.
// Un dépôt qui n'écrit ni `.ts` ni `.js` ne reçoit pas cette pose et n'a pas à charger
// ce fichier.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      "**/*.min.js",
      "**/staticfiles/**",
      "**/migrations/**",
    ],
  },
  // Plus de `**/e2e/**` depuis la 19.0.0 (issue #75, point 5). L'exclusion était là
  // depuis le premier commit de ce fichier sans qu'aucune ligne ne la justifie, et le
  // fork d'un dépôt adopté, lui, lintait ses e2e. Mesuré avant de la retirer : 5
  // fichiers de plus lus sur un dépôt adopté, 0 constatation, 0 avertissement. Un test
  // de bout en bout est du TypeScript écrit à la main, il porte les mêmes défauts que
  // le reste et il n'y a aucune raison de ne pas le lire.
  // eslint 10 ne globe par défaut que `**/*.js`, `**/*.mjs` et `**/*.cjs`, et rien
  // n'ajoute `.jsx` : mesuré par `calculateConfigForFile`, c'était le SEUL des huit
  // suffixes que `verifier-ce-qu-on-ecrit.md` §2 promet à n'avoir AUCUNE config — les
  // sept autres en portent 86 à 91 règles. Du JSX React écrit en session partait donc
  // à la CI sans avoir été lu, sous un `rc=0` indistinguable d'un fichier propre.
  {
    files: ["**/*.jsx"],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Une seule règle du greffon React, nommée à la main. Son `recommended` amènerait les
  // règles React Compiler, donc du code applicatif à retoucher chez chaque dépôt adopté
  // — un chantier, pas un réglage : hors de ce que la 19.0.0 tranche.
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      // `exhaustive-deps` reste dehors : bruyante sur du code existant, le fork la met
      // en avertissement, et un avertissement sur un processus BLOQUANT ne protège
      // personne. `complexity` et `max-lines` restent dehors : le processus
      // `complexite` porte déjà ces seuils, et deux endroits qui jugent le même défaut
      // rendent deux verdicts. `no-explicit-any` reste en `warn` : durcir demande de
      // typer du code existant, ce que la chaîne ne fait pas — elle vérifie ce qui est
      // écrit, elle n'exige pas d'écrire.
    },
  },
  // `rules-of-hooks` lit tout sauf `e2e/` et `tests/`. Une fixture Playwright reçoit un
  // paramètre nommé `use` et l'appelle (`await use(page)`) ; le greffon reconnaît un
  // hook à son seul nom et y lisait un hook React appelé hors composant : `error` sur
  // du code juste. Mesuré sous eslint 10.11.0, greffon 7.1.1 : les deux fixtures ne
  // rougissent plus, et un `useState` sous condition rougit toujours dans un `.tsx`
  // comme dans un hook écrit en `.ts`. Restreindre par suffixe (`**/*.{jsx,tsx}`)
  // éteignait la règle sur ces hooks en `.ts`, sans un mot. Le greffon reste déclaré
  // plus haut, pour tous les fichiers : déclaré ici, un
  // `eslint-disable-next-line react-hooks/…` dans un `.ts` sort `Definition for rule
  // … was not found`.
  {
    ignores: ["**/e2e/**", "**/tests/**"],
    rules: {
      // Entrée en 19.0.0 (issue #75). Un hook appelé sous condition casse l'ordre des
      // hooks au rendu suivant, et RIEN d'autre dans la chaîne ne le voit : ni
      // `tsc --noEmit`, ni les règles semgrep, ni les tests unitaires. C'est un fait
      // sur le code, pas un jugement de style — d'où `error`, comme le fork d'un dépôt
      // adopté l'avait déjà mise de son propre chef. Mesuré avant de l'écrire, greffon
      // 7.1.1 sous eslint 10.9.1 : 0 erreur sur les 156 fichiers React d'un dépôt
      // adopté, 0 sur les 4 du bac à sable de la chaîne. Et le zéro a été recoupé — un
      // témoin portant `useState` dans un `if` rend bien l'erreur, la règle tire.
      "react-hooks/rules-of-hooks": "error",
    },
  },
  // Un `.cjs` est du CommonJS, mais `tseslint.configs.recommended` pose
  // `sourceType: "module"` sur TOUS les fichiers : le `module.exports` d'un
  // `.dependency-cruiser.cjs` sortait `'module' is not defined` (no-undef). Placé après
  // typescript-eslint, ce bloc rend aux `.cjs` le type que Node leur donne ; une
  // variable réellement inconnue y rougit toujours. `require()` et les globales de Node
  // (`__dirname`, `process`) y rougissent encore : ce bloc ne les ouvre pas.
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
  // Le JS qu'une app Django sert au navigateur (`static/` de l'app, que `collectstatic`
  // recopie sous `staticfiles/`, déjà écarté) vit dans `window` : sans globale
  // déclarée, `no-undef` y rougissait sur `document`, `window` et `fetch` — cinq
  // erreurs sur une application de la flotte, aucune réelle (#270). Les globales sont
  // écrites ici, en lecture seule, et pas tirées du paquet `globals` : l'ensemble
  // `deps_lint` est fermé. Un nom absent de la liste rougit encore, et c'est voulu : la
  // liste s'allonge sur un constat, pas d'avance. Un `.ts` n'est pas concerné,
  // typescript-eslint y éteint `no-undef`.
  {
    files: ["**/static/**/*.{js,mjs}"],
    languageOptions: {
      globals: Object.fromEntries(
        [
          "window",
          "document",
          "navigator",
          "location",
          "history",
          "console",
          "fetch",
          "Headers",
          "Request",
          "Response",
          "FormData",
          "URL",
          "URLSearchParams",
          "AbortController",
          "localStorage",
          "sessionStorage",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "requestAnimationFrame",
          "cancelAnimationFrame",
          "alert",
          "confirm",
          "Event",
          "CustomEvent",
          "Node",
          "Element",
          "HTMLElement",
          "MutationObserver",
          "IntersectionObserver",
        ].map((g) => [g, "readonly"]),
      ),
    },
  },
);
