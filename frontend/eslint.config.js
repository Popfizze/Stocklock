// Flat ESLint config. `npm run lint` invokes `eslint .`, which fails
// without this file even though the deps were already pinned.
//
// ESLint resolves the config from the file it lints, so THIS file governs
// every file under frontend/, on every suffix (.ts, .tsx, .js, .jsx, .cjs,
// .mjs): the recommended sets, rules-of-hooks + exhaustive-deps, the
// react-refresh component-only export constraint the build relies on,
// browser globals.
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'e2e/.results', 'e2e/.report'] },
  // ESLint globs .js, .mjs and .cjs by default, never .jsx: this block is what
  // makes a .jsx file linted at all.
  {
    files: ['**/*.jsx'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  // No `files` key: the recommended sets apply to every suffix, the plain
  // JavaScript config files included.
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Part of @eslint/js 10's recommended set. This frontend still resolves
      // @eslint/js 9, whose recommended set lacks them, so they are named here.
      'no-unassigned-vars': 'error',
      'no-useless-assignment': 'error',
      'preserve-caught-error': 'error',
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // A .cjs file is CommonJS, but typescript-eslint sets sourceType "module" on
  // every file: without this block, `module.exports` is `'module' is not
  // defined` (no-undef).
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    // shadcn/ui components export both components and variant constants
    // (e.g. badgeVariants alongside <Badge>) — react-refresh complains,
    // but the constants are part of the public API of every shadcn file
    // by design. Silence the warning rather than restructure the library.
    files: ['src/components/ui/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
)
