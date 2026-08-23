// eslint.config.mjs
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import security from 'eslint-plugin-security'
import importX from 'eslint-plugin-import-x'
import boundaries from 'eslint-plugin-boundaries'
import nextPlugin from '@next/eslint-plugin-next'

/** Playwright yalnız apps/e2e içinde yaşar. Bu kural üç katmanlı savunmanın ikincisi. */
const PLAYWRIGHT_WALL = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['playwright', 'playwright-*', '@playwright/*'],
          message:
            'Playwright YALNIZCA apps/e2e içinde kullanılır. E2E testi gerekiyorsa görevi xox-qa-e2e agentına ver.',
        },
      ],
    },
  ],
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.expo/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      'reports/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'import-x': importX, security, boundaries },
    settings: {
      // pnpm workspace paketleri (@xox/*) node_modules altında symlink olarak durur.
      // preserveSymlinks:false olmadan çözümleyici gerçek yolu değil symlink yolunu
      // döndürür; bu da eslint-plugin-boundaries'in yerel paketleri "external" sanıp
      // sınır kontrolünü sessizce atlamasına yol açar. Bu ayar olmadan boundaries
      // kuralı paket-adı importlarında (gerçek kullanım şekli) asla tetiklenmez.
      'import/resolver': { node: { preserveSymlinks: false } },
      'boundaries/elements': [
        { type: 'game-core', pattern: 'packages/game-core/**' },
        { type: 'shared', pattern: 'packages/shared/**' },
        { type: 'db', pattern: 'packages/db/**' },
        { type: 'ui-tokens', pattern: 'packages/ui-tokens/**' },
        { type: 'web', pattern: 'apps/web/**' },
        { type: 'mobile', pattern: 'apps/mobile/**' },
        { type: 'e2e', pattern: 'apps/e2e/**' },
      ],
    },
    rules: {
      ...PLAYWRIGHT_WALL,
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'security/detect-object-injection': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'import-x/no-cycle': 'error',
      // v7 API: kural adı 'element-types' -> 'dependencies', seçenek 'rules' -> 'policies'.
      // game-core ve ui-tokens için politika tanımlanmadı: default: 'disallow' zaten
      // hiçbir hedefe izin vermeme davranışını sağlıyor (eski `allow: []` ile eşdeğer).
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'shared' } },
              allow: { to: { element: { type: 'game-core' } } },
            },
            {
              from: { element: { type: 'db' } },
              allow: { to: { element: { types: ['shared', 'game-core'] } } },
            },
            {
              from: { element: { type: 'web' } },
              allow: { to: { element: { types: ['db', 'shared', 'game-core', 'ui-tokens'] } } },
            },
            {
              from: { element: { type: 'mobile' } },
              allow: { to: { element: { types: ['shared', 'game-core', 'ui-tokens'] } } },
            },
            {
              from: { element: { type: 'e2e' } },
              allow: { to: { element: { type: 'shared' } } },
            },
          ],
        },
      ],
    },
  },

  // Next.js / React — yalnız web
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y, '@next/next': nextPlugin },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },

  // React Native — yalnız mobil
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },

  // apps/e2e — Playwright duvarının TEK istisnası
  {
    files: ['apps/e2e/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Test dosyaları — biraz gevşek
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/test/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'boundaries/dependencies': 'off',
    },
  },

  // Konfig dosyaları — tip bilgisi gerektirmeyen
  {
    files: ['**/*.config.{js,mjs,ts}', '**/*.setup.ts', 'vitest.shared.ts'],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
)
