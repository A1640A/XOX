# XOX Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** XOX oyununun gece boyunca denetimsiz geliştirilebileceği monorepo + 18 agent'lık Claude harness'ını kurmak ve tüm boru hattını gerçek bir Vercel deploy'una karşı kanıtlamak.

**Architecture:** pnpm workspaces + Turborepo monorepo. Saf TypeScript `game-core` paketi web ve mobil arasında paylaşılır. Kalite prompt'la değil derleyici/CI ile zorlanır: TS strict, typescript-eslint strict-type-checked, bağımlılık sınır kuralları, kapsam eşikleri, mutasyon testi, gitleaks. Claude harness'ı `.claude/` altında yaşar; lead'in state'i `docs/board/` içinde diskte tutulur, hook'larla güncel kalır. Playwright yalnız `apps/e2e` içinde yaşar; üç katmanda (hook, ESLint, CI) ana projeden uzak tutulur.

**Tech Stack:** Node 24 · pnpm 11 · TypeScript 6.0.3 · Turborepo 2.10 · Next.js 16.3 · React 19.2 · Tailwind 4.3 · Auth.js v5 beta · Mongoose 9 · MongoDB Atlas · Vercel Functions WebSocket · Expo 57 / RN 0.87 · Vitest 4 · Playwright 1.62 · Stryker 10

**Referans spec:** `docs/superpowers/specs/2026-08-24-xox-harness-design.md`

---

## Sürüm matrisi (doğrulandı 2026-08-24 — bunları değiştirme)

| Paket                        | Sürüm         | Not                                                                                       |
| ---------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| node                         | 24            | `.nvmrc`                                                                                  |
| pnpm                         | 11.15.1       | `packageManager` alanı                                                                    |
| **typescript**               | **6.0.3**     | ⚠️ **7.0.2 KULLANMA** — `typescript-eslint@8.67` peer'ı `<6.1.0`. TS 7 = lint katmanı yok |
| turbo                        | 2.10.11       |                                                                                           |
| next                         | 16.3.2        | App Router                                                                                |
| react / react-dom            | 19.2.8        |                                                                                           |
| tailwindcss                  | 4.3.3         | v4 — CSS-first, `tailwind.config.js` yok                                                  |
| next-auth                    | 5.0.0-beta.32 | `next-auth@beta`. v4 latest ama App Router için v5 gerekli                                |
| @auth/mongodb-adapter        | 3.11.3        | `mongodb` sürücüsünü kullanır, mongoose'u değil — bağlantı paylaşılacak                   |
| mongoose                     | 9.9.3         |                                                                                           |
| @vercel/functions            | 3.9.5         | `experimental_upgradeWebSocket`                                                           |
| zod                          | 4.4.3         |                                                                                           |
| eslint                       | 10.9.0        | flat config                                                                               |
| typescript-eslint            | 8.67.0        |                                                                                           |
| eslint-plugin-boundaries     | 7.2.0         |                                                                                           |
| prettier                     | 3.9.6         |                                                                                           |
| vitest / @vitest/coverage-v8 | 4.1.11        |                                                                                           |
| @playwright/test             | 1.62.1        | **yalnız `apps/e2e`**                                                                     |
| expo                         | 57.0.15       |                                                                                           |
| react-native                 | 0.87.0        |                                                                                           |
| react-native-web             | 0.21.2        |                                                                                           |
| expo-router                  | 57.0.15       | ⚠️ **`~7.0.0` YAZMA** — 7.x sürümleri canary. expo-router SDK ile hizalı sürümlenir       |
| @stryker-mutator/core        | 10.0.0        | yalnız `game-core`                                                                        |
| knip                         | 6.32.2        |                                                                                           |
| lefthook                     | 2.1.10        |                                                                                           |
| @commitlint/cli              | 21.2.2        |                                                                                           |
| size-limit                   | 13.0.3        |                                                                                           |
| mongodb-memory-server        | 11.2.0        |                                                                                           |
| gitleaks                     | brew          | ⚠️ npm'deki `gitleaks@1.0.0` sahte — `brew install gitleaks`                              |

---

## Dosya yapısı

```
XOX/
├── CLAUDE.md                            Lead protokolü, <200 satır
├── package.json · pnpm-workspace.yaml · turbo.json · tsconfig.base.json
├── eslint.config.mjs · .prettierrc.json · lefthook.yml · commitlint.config.mjs
├── vitest.shared.ts · knip.json · .size-limit.json
├── .nvmrc · .gitleaks.toml · knip.json · .env.example
│
├── apps/
│   ├── web/         Next.js — app/, lib/, messages/tr.ts, vitest.config.ts
│   ├── mobile/      Expo — app/, lib/, app.json, metro.config.js
│   └── e2e/         Playwright — tests/, fixtures/, playwright.config.ts
│
├── packages/
│   ├── game-core/   src/{types,board,status,ai,errors,index}.ts + testler
│   ├── shared/      src/{ws-protocol,rest-contract,constants,index}.ts
│   ├── db/          src/{client,models/*,seed,reset,index}.ts
│   └── ui-tokens/   src/{colors,spacing,typography,index}.ts
│
├── docs/board/      board.json · journal.ndjson · reports/ · waves/
├── docs/memory/     decisions.md · gotchas.md · conventions.md · api-contract.md · state.md
│
└── .claude/
    ├── settings.json
    ├── agents/      18 dosya
    ├── commands/    xox-night · xox-wave · xox-status · xox-report · xox-unblock
    └── hooks/       session-start · pre-compact · subagent-stop · post-tool-use
                     · playwright-firewall · destructive-snapshot · night-continue
```

### Sorumluluk sınırları

| Birim       | Tek sorumluluğu                                                        | Bağımlılığı                        |
| ----------- | ---------------------------------------------------------------------- | ---------------------------------- |
| `game-core` | XOX kuralları + AI. Saf fonksiyonlar, I/O yok, framework yok           | hiçbiri                            |
| `shared`    | İstemci↔sunucu sözleşmesi (zod). Davranış içermez                      | `game-core`                        |
| `db`        | Kalıcılık. Mongoose modelleri + bağlantı + seed/reset                  | `shared`, `game-core`              |
| `ui-tokens` | Görsel sabitler. Bileşen içermez                                       | hiçbiri                            |
| `web`       | Next.js sunum + API. Kural mantığı içermez — `game-core`'a delege eder | hepsi                              |
| `mobile`    | Expo sunum. Kural mantığı içermez                                      | `shared`, `game-core`, `ui-tokens` |
| `e2e`       | Kara kutu doğrulama. Uygulama koduna **import edemez**                 | `shared` (yalnız tipler)           |

---

# FAZ 1 — Monorepo temeli

### Task 1: Workspace kökü ve sürüm sabitleme

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `.npmrc`, `.editorconfig`

- [ ] **Step 1: Node sürümünü sabitle**

```bash
echo "24" > .nvmrc
```

- [ ] **Step 2: Kök `package.json` oluştur**

```json
{
  "name": "xox",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@11.15.1",
  "engines": {
    "node": ">=24.0.0",
    "pnpm": ">=11.0.0"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:coverage": "turbo run test:coverage",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "knip": "knip",
    "e2e": "pnpm --filter @xox/e2e e2e",
    "mutation": "pnpm --filter @xox/game-core mutation",
    "gates": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage && pnpm knip"
  },
  "devDependencies": {
    "@commitlint/cli": "21.2.2",
    "@commitlint/config-conventional": "21.2.2",
    "@eslint/js": "10.0.1",
    "@next/eslint-plugin-next": "16.3.2",
    "@size-limit/preset-app": "13.0.3",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.2",
    "@vitejs/plugin-react": "6.1.0",
    "@vitest/coverage-v8": "4.1.11",
    "eslint": "10.9.0",
    "eslint-config-prettier": "10.1.8",
    "eslint-plugin-boundaries": "7.2.0",
    "eslint-plugin-import-x": "4.17.1",
    "eslint-plugin-jsx-a11y": "6.10.2",
    "eslint-plugin-react-hooks": "7.1.1",
    "eslint-plugin-security": "4.0.1",
    "jsdom": "30.0.1",
    "knip": "6.32.2",
    "lefthook": "2.1.10",
    "prettier": "3.9.6",
    "size-limit": "13.0.3",
    "turbo": "2.10.11",
    "typescript": "6.0.3",
    "typescript-eslint": "8.67.0",
    "vite-tsconfig-paths": "6.1.1",
    "vitest": "4.1.11"
  }
}
```

- [ ] **Step 3: Workspace tanımı**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
allowBuilds:
  esbuild: true
  lefthook: true
  unrs-resolver: true
minimumReleaseAgeExclude:
  - '@types/react-dom@19.2.5'
```

Not: lefthook'un postinstall'ı örnek içerikli bir `lefthook.yml` üretir. Onu commit etme —
gerçek konfigürasyon Task 7'de yazılıp üzerine geçilecek.

- [ ] **Step 4: `.npmrc` — katı çözümleme**

```ini
# .npmrc
strict-peer-dependencies=false
auto-install-peers=true
shamefully-hoist=false
resolution-mode=highest
```

- [ ] **Step 5: `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 6: Kur ve doğrula**

Run: `pnpm install`
Expected: `Done in Xs` — hata yok, `node_modules/` ve `pnpm-lock.yaml` oluşur.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml .nvmrc .npmrc .editorconfig pnpm-lock.yaml
git commit -m "chore: pnpm workspace kökü ve sürüm sabitleme"
```

---

### Task 2: TypeScript taban konfigürasyonu

**Files:**

- Create: `tsconfig.base.json`, `tsconfig.json`

- [ ] **Step 1: `tsconfig.base.json` — katı ayarlar**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "Preserve",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  },
  "exclude": ["node_modules", "dist", ".next", ".expo", "coverage"]
}
```

- [ ] **Step 2: Kök `tsconfig.json` — çözümleme yolları**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@xox/game-core": ["./packages/game-core/src/index.ts"],
      "@xox/shared": ["./packages/shared/src/index.ts"],
      "@xox/db": ["./packages/db/src/index.ts"],
      "@xox/ui-tokens": ["./packages/ui-tokens/src/index.ts"]
    }
  },
  "files": []
}
```

- [ ] **Step 3: TypeScript sürümünü doğrula**

Run: `pnpm exec tsc --version`
Expected: `Version 6.0.3` — **7.x görürsen dur ve `package.json`'da `typescript` pinini düzelt.**

- [ ] **Step 4: Commit**

```bash
git add tsconfig.base.json tsconfig.json
git commit -m "chore: katı TypeScript taban konfigürasyonu (6.0.3 pinli)"
```

---

### Task 3: Turborepo pipeline

**Files:**

- Create: `turbo.json`

- [ ] **Step 1: `turbo.json`**

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "stream",
  "globalDependencies": ["tsconfig.base.json", "eslint.config.mjs", ".env.example"],
  "globalEnv": ["NODE_ENV", "VERCEL_ENV"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "lint": { "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": [] },
    "test:coverage": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "mutation": { "dependsOn": ["^build"], "outputs": ["reports/mutation/**"], "cache": false }
  }
}
```

- [ ] **Step 2: Doğrula**

Run: `pnpm exec turbo run typecheck --dry=json | head -20`
Expected: JSON çıktısı, `"packages": []` (henüz paket yok) — hata yok.

- [ ] **Step 3: Commit**

```bash
git add turbo.json
git commit -m "chore: Turborepo pipeline tanımı"
```

---

### Task 4: Prettier

**Files:**

- Create: `.prettierrc.json`, `.prettierignore`

- [ ] **Step 1: `.prettierrc.json`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 2: `.prettierignore`**

```
node_modules
.next
.expo
dist
coverage
pnpm-lock.yaml
docs/board/journal.ndjson
apps/e2e/test-results
apps/e2e/playwright-report
reports/mutation
apps/web/next-env.d.ts
```

- [ ] **Step 3: Mevcut dosyaları biçimlendir ve doğrula**

Run: `pnpm format && pnpm format:check`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 4: Commit**

```bash
git add .prettierrc.json .prettierignore
git commit -m "chore: Prettier konfigürasyonu"
```

---

# FAZ 2 — Kalite kapıları

Bu fazın çıktısı: **hiçbir agent'ın atlayamayacağı mekanik kapılar.** Prompt talimatı gece 03:00'te tutmaz.

### Task 5: ESLint flat config — strict-type-checked

**Files:**

- Create: `eslint.config.mjs`
- Modify: `package.json` (devDependencies)

- [ ] **Step 1: ESLint bağımlılıklarını kur**

```bash
pnpm add -Dw eslint@10.9.0 @eslint/js@10.0.1 typescript-eslint@8.67.0 \
  eslint-config-prettier@10.1.8 eslint-plugin-react-hooks@7.1.1 \
  eslint-plugin-jsx-a11y@6.10.2 eslint-plugin-security@4.0.1 \
  eslint-plugin-import-x@4.17.1 eslint-plugin-boundaries@7.2.0 \
  eslint-import-resolver-typescript@4.4.5 \
  @next/eslint-plugin-next@16.3.2
```

- [ ] **Step 2: `eslint.config.mjs` yaz**

⚠️ İki ayrıntı hayati, kopyalarken atlama:

- `boundaries` **v7 API'si** kullanılıyor: kural adı `boundaries/dependencies`, seçenek adı
  `policies`, hedefler `{ from: { element: { type } }, allow: { to: { element: { types } } } }`
  biçiminde sarmalanmış. Eski `element-types`/`rules` sözdizimi çalışır ama her koşuda
  deprecation basar.
- `settings['import/resolver'].node.preserveSymlinks = false` **zorunlu.** pnpm workspace
  paketleri `node_modules/@xox/*` altında sembolik bağlantıdır; realpath çözülmezse yol
  `node_modules` içerdiği için boundaries onu "harici paket" sayar ve kural **hiçbir gerçek
  paketler-arası import'ta ateşlenmez.**

```js
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

/**
 * Hem eslint-plugin-boundaries (import/resolver) hem eslint-plugin-import-x
 * (import-x/resolver) aynı çözümleyiciyi kullanır: ikisi de bir import'un
 * NEREYE gittiğini yalnız çözümlenmiş dosya yolundan bilir.
 * `project` listesi kök tsconfig'i de kapsar; böylece bir paket bağımlılığı
 * package.json'a eklenmemiş olsa bile '@xox/...' hedefi çözülür.
 */
const TS_RESOLVER = {
  typescript: {
    alwaysTryTypes: true,
    project: ['tsconfig.json', 'apps/*/tsconfig.json', 'packages/*/tsconfig.json'],
    // Birden fazla tsconfig bilerek veriliyor; resolver'ın her çalıştırmada
    // bastığı "Multiple projects found" uyarısı gürültüden ibaret.
    noWarnOnMultipleProjects: true,
  },
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
      // eslint-plugin-boundaries bir import'un HANGİ elemana gittiğini yalnızca
      // çözümlenmiş DOSYA YOLUNDAN bilir (Elements/Elements.js -> eslint-module-utils/resolve).
      // Çözümleme başarısızsa hedef `isUnknown: true` olur ve boundaries/dependencies
      // sessizce hiçbir şey söylemez — yani kural "varmış gibi" görünüp aslında çalışmaz.
      //
      // Eski ayar (`node` resolver) iki yerden birden kırılıyordu:
      //   1. eslint-import-resolver-node varsayılan uzantıları ['.mjs','.js','.json','.node'];
      //      '.ts' YOK. Bu yüzden GÖRELİ importlar ('../../shared/src/constants') çözülemiyordu.
      //   2. Altında yatan `resolve` paketi package.json `exports` alanını bilmez; @xox/*
      //      paketlerinde yalnız `exports` var (`main` yok), bu yüzden PAKET-ADI importları
      //      ('@xox/shared') da çözülemiyor, "external" sanılıyordu.
      // Sonuç: boundaries/dependencies HER İKİ import biçiminde de tamamen atıl durumdaydı.
      //
      // TypeScript resolver hem '.ts' uzantısını, hem `exports` alanını, hem tsconfig
      // `paths` eşlemesini bilir ve pnpm symlink'lerini gerçek yola (realpath) çözer —
      // eleman desenleri (packages/shared/**) ancak gerçek yolla eşleşir.
      'import/resolver': TS_RESOLVER,

      // --- import-x tarafı: no-cycle'ın gerçekten çalışması + stderr sessizliği ---
      // import-x kendi çözümleyicisini 'import-x/resolver' anahtarından okur;
      // 'import/resolver' onu ETKİLEMEZ. Varsayılan node çözümleyicisinin uzantı
      // listesinde '.ts' yoktu, bu yüzden göreli TS importları hiç çözülmüyordu.
      'import-x/resolver': TS_RESOLVER,
      // ExportMap yalnız bu uzantılara sahip dosyaları ayrıştırır
      // (utils/export-map.js -> hasValidExtension). Varsayılan ['.js','.mjs','.cjs']
      // ile birinci-parti TS hiç okunmuyor, buna karşılık node_modules içindeki
      // .js dosyaları okunuyordu: no-cycle atıl kalırken react-native/index.js'in
      // Flow sözdizimi her lint çalıştırmasında stderr'e yığın döküyordu.
      'import-x/extensions': ['.ts', '.tsx', '.mts', '.cts'],
      // İkinci savunma: node_modules ASLA ayrıştırılmaz. @xox/* paketleri gerçek
      // yollarına (packages/...) çözüldüğü için bu desen onları kapsamaz —
      // paketler arası döngüler yakalanmaya devam eder.
      'import-x/ignore': ['node_modules'],
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
    // Monorepo: Next uygulaması kökte değil. Bu ayar olmadan no-html-link-for-pages
    // kuralı repo kökünde pages/ arar, bulamaz ve her lint çalıştırmasında
    // stderr'e "Pages directory cannot be found" satırı basar.
    settings: { next: { rootDir: 'apps/web' } },
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
```

- [ ] **Step 3: Kök `package.json`'a lint scripti ekle**

`scripts` içine ekle:

```json
"lint": "eslint . --max-warnings=0"
```

- [ ] **Step 4: Çalıştır — henüz kaynak yok, temiz geçmeli**

Run: `pnpm lint`
Expected: Çıktı yok, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs package.json pnpm-lock.yaml
git commit -m "chore: ESLint strict-type-checked + bağımlılık sınırları + Playwright duvarı"
```

---

### Task 6: Playwright duvarını test et (kuralın gerçekten çalıştığını kanıtla)

Bir kuralın yazılmış olması çalıştığı anlamına gelmez. Kanıtla.

⚠️ **Sıralama tuzağı:** `eslint.config.mjs` içinde `projectService: true` var. Hiçbir
`tsconfig.json`'ın `include`'una girmeyen bir `.ts` dosyası, **hiçbir kural çalışmadan önce**
"was not found by the project service" parse hatası verir. Bu noktada henüz paket tsconfig'i
yok; bu yüzden sonda geçici bir tsconfig ile birlikte kurulur.

**Files:**

- Create (geçici, sonra silinir): `packages/game-core/tsconfig.json`, `packages/game-core/src/__wall-probe.ts`

- [ ] **Step 1: Geçici tsconfig ve ihlal eden dosyayı oluştur**

```bash
mkdir -p packages/game-core/src
cat > packages/game-core/tsconfig.json <<'TSEOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
TSEOF
cat > packages/game-core/src/__wall-probe.ts <<'PROBE'
import { test } from '@playwright/test'
export const probe = test
PROBE
```

- [ ] **Step 2: Lint çalıştır — PLAYWRIGHT HATASI vermeli**

Run: `pnpm exec eslint packages/game-core/src/__wall-probe.ts`

Expected: çıktıda şu geçmeli —
`Playwright YALNIZCA apps/e2e içinde kullanılır` ve kural adı `no-restricted-imports`, exit code 1.

Bunun yerine `was not found by the project service` görüyorsan geçici tsconfig oluşmamıştır.
Bunun yerine **hiç hata yoksa** ESLint konfigürasyonunda `no-restricted-imports` uygulanmıyordur;
Task 5 Step 2'yi tekrar kontrol et — kuralı düzeltmeden ilerleme.

- [ ] **Step 3: apps/e2e istisnasının çalıştığını da kanıtla**

```bash
mkdir -p apps/e2e/tests
cat > apps/e2e/tsconfig.json <<'TSEOF'
{
  "extends": "../../tsconfig.base.json",
  "include": ["**/*.ts"]
}
TSEOF
cat > apps/e2e/tests/__wall-probe.spec.ts <<'PROBE'
import { test } from '@playwright/test'
export const probe = test
PROBE
```

Run: `pnpm exec eslint apps/e2e/tests/__wall-probe.spec.ts`
Expected: `no-restricted-imports` hatası **YOK** (yalnızca çözülemeyen modül kaynaklı tip
uyarıları olabilir — `@playwright/test` henüz kurulu değil, o normaldir).

Duvar yalnızca engelliyorsa yarım iştir; doğru yerde **izin verdiğini** de kanıtlaman gerekir.

- [ ] **Step 4: Tüm sondaları sil**

```bash
rm -rf packages apps
```

- [ ] **Step 5: Lint tekrar temiz**

Run: `pnpm lint`
Expected: exit code 0, çıktı yok.

Run: `git status --short`
Expected: çıktı yok — hiçbir sonda geride kalmamalı.

- [ ] **Step 6: Bulguyu hafızaya yaz**

`docs/memory/conventions.md` Task 25'te oluşur. O görev tamamlandığında şu satırı ekle:

```markdown
- Playwright duvarı ESLint `no-restricted-imports` ile zorlanır; hem engellediği (packages/**)
  hem izin verdiği (apps/e2e) yön 2026-08-24'te sonda ile doğrulandı.
```

---

### Task 7: Lefthook + commitlint + gitleaks

**Files:**

- Create: `lefthook.yml`, `commitlint.config.mjs`, `.gitleaks.toml`

- [ ] **Step 1: gitleaks kur (npm paketi SAHTE — brew kullan)**

```bash
brew install gitleaks
gitleaks version
```

Expected: `v8.x.x` gibi bir sürüm.

- [ ] **Step 2: `.gitleaks.toml`**

```toml
title = "XOX secret taraması"

[extend]
useDefault = true

[[rules]]
id = "mongodb-connection-string"
description = "MongoDB bağlantı dizesi (kimlik bilgisi içeren)"
regex = '''mongodb(\+srv)?:\/\/[^\s:@]+:[^\s:@]+@'''
tags = ["database", "credentials"]

[allowlist]
description = "Örnek ve doküman dosyaları"
paths = [
  '''\.env\.example$''',
  '''docs/superpowers/specs/.*\.md$''',
]
regexes = [
  '''mongodb\+srv://<kullanici>:<sifre>@''',
]
```

- [ ] **Step 3: `commitlint.config.mjs`**

```js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'web',
        'mobile',
        'e2e',
        'core',
        'shared',
        'db',
        'ui',
        'ci',
        'claude',
        'board',
        'deps',
        'docs',
        // plan/hafıza dokümanı güncellemeleri ve Task 34'ün ci(deploy) commit'i için:
        'plan',
        'memory',
        'deploy',
      ],
    ],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
}
```

- [ ] **Step 4: `lefthook.yml`**

```yaml
pre-commit:
  parallel: true
  commands:
    gitleaks:
      run: gitleaks protect --staged --redact --config .gitleaks.toml
      fail_text: '🔴 SECRET TESPİT EDİLDİ — repo PUBLIC. Commit engellendi.'
    format:
      glob: '*.{ts,tsx,js,mjs,json,md,yml,yaml,css}'
      run: pnpm exec prettier --check {staged_files}
      fail_text: 'Biçim hatası — `pnpm format` çalıştır.'
    lint:
      glob: '*.{ts,tsx}'
      run: pnpm exec eslint --max-warnings=0 {staged_files}

commit-msg:
  commands:
    commitlint:
      run: pnpm exec commitlint --edit {1}

pre-push:
  commands:
    typecheck:
      run: pnpm typecheck
```

- [ ] **Step 5: Lefthook'u kur**

```bash
pnpm exec lefthook install
```

Expected: `sync hooks: ✔️ (pre-commit, commit-msg, pre-push)`

- [ ] **Step 6: Secret engelini KANITLA**

```bash
echo 'const uri = "mongodb+srv://admin:supersecret123@cluster.mongodb.net/"' > /tmp/leak-probe.ts
cp /tmp/leak-probe.ts ./leak-probe.ts
git add leak-probe.ts
git commit -m "test: secret sondası" || echo "ENGELLENDİ — beklenen davranış"
```

Expected: `🔴 SECRET TESPİT EDİLDİ` ve commit **başarısız**.

- [ ] **Step 7: Sondayı temizle**

```bash
git reset HEAD leak-probe.ts && rm -f leak-probe.ts /tmp/leak-probe.ts
```

- [ ] **Step 8: Commit**

```bash
git add lefthook.yml commitlint.config.mjs .gitleaks.toml package.json pnpm-lock.yaml
git commit -m "chore: lefthook + commitlint + gitleaks pre-commit kapıları"
```

---

### Task 8: Vitest workspace ve kapsam eşikleri

**Files:**

- Create: `vitest.shared.ts`

- [ ] **Step 1: Vitest bağımlılıklarını kur**

```bash
pnpm add -Dw vitest@4.1.11 @vitest/coverage-v8@4.1.11 vite-tsconfig-paths@6.1.1 \
  @vitejs/plugin-react@6.1.0 jsdom@30.0.1 \
  @testing-library/react@16.3.2 @testing-library/jest-dom@7.0.1
```

- [ ] **Step 2: `vitest.shared.ts` — ortak taban**

```ts
// vitest.shared.ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export const sharedConfig = defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Çöken bir Stryker koşusu .stryker-tmp/ bırakır; içindeki test kopyaları
    // toplanırsa test sayısı iki katına çıkar ve sonuç yanıltıcı olur.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.stryker-tmp/**'],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      exclude: ['**/*.test.ts', '**/*.config.*', '**/index.ts', '**/dist/**'],
    },
  },
})
```

Testleri Turborepo sürer (`turbo run test`), her paket kendi `vitest.config.ts`'ini kullanır.
Kök `vitest.workspace.ts` **bilinçli olarak yok** — hiçbir şey onu import etmezdi ve `knip`
kullanılmayan dosya olarak işaretleyip kapıları kırardı.

- [ ] **Step 3: Kapsam eşiği politikası (her pakette uygulanacak, referans)**

| Paket       | lines | branches | functions | statements |
| ----------- | ----- | -------- | --------- | ---------- |
| `game-core` | 100   | 100      | 100       | 100        |
| `shared`    | 90    | 90       | 90        | 90         |
| `db`        | 90    | 85       | 90        | 90         |
| `web`       | 70    | 65       | 70        | 70         |

Bu eşikler her paketin kendi `vitest.config.ts`'inde `coverage.thresholds` olarak yazılır (Task 10, 12, 13, 16).

- [ ] **Step 4: Commit**

```bash
git add vitest.shared.ts package.json pnpm-lock.yaml
git commit -m "chore: Vitest ortak konfigürasyonu ve kapsam eşiği politikası"
```

---

### Task 9: knip ve size-limit

**Files:**

- Create: `knip.json`, `.size-limit.json`

- [ ] **Step 1: knip kur ve yapılandır**

```bash
pnpm add -Dw @size-limit/preset-app@13.0.3 size-limit@13.0.3
```

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "workspaces": {
    "packages/*": { "entry": ["src/index.ts"], "project": ["src/**/*.ts"] },
    "apps/web": {
      "entry": [
        "app/**/{page,layout,route,error,not-found,loading}.tsx",
        "app/**/route.ts",
        "middleware.ts",
        "next.config.ts"
      ],
      "project": ["**/*.{ts,tsx}"]
    },
    "apps/mobile": { "entry": ["app/**/*.tsx", "app.config.ts"], "project": ["**/*.{ts,tsx}"] },
    "apps/e2e": { "entry": ["tests/**/*.spec.ts", "playwright.config.ts"], "project": ["**/*.ts"] }
  },
  "ignoreDependencies": [
    "@vitest/coverage-v8",
    "lefthook",
    "vitest",
    "vite-tsconfig-paths",
    "@vitejs/plugin-react",
    "jsdom",
    "@testing-library/react",
    "@testing-library/jest-dom"
  ],
  "ignore": ["**/*.d.ts", "vitest.shared.ts"]
}
```

- [ ] **Step 2: `.size-limit.json` — bundle bütçesi**

```json
[
  {
    "name": "web — ilk yükleme JS",
    "path": "apps/web/.next/static/chunks/**/*.js",
    "limit": "180 kB",
    "gzip": true
  }
]
```

- [ ] **Step 3: knip'i çalıştır**

Run: `pnpm knip`
Expected: **exit code 0.** Paket/uygulama klasörleri hakkında "Configuration hints" satırları
normaldir (workspace'ler henüz yok) ve exit code'u etkilemez.

⚠️ Planın önceki sürümü `✂️ Excellent, Knip found no issues.` banner'ını bekliyordu; o satır
yalnızca TTY'de basılır (`isShowProgress`), CI ve script bağlamında hiç görünmez. Başarı
sinyali **exit code 0**'dır, banner değil.

- [ ] **Step 4: Commit**

```bash
git add knip.json .size-limit.json package.json pnpm-lock.yaml
git commit -m "chore: knip ölü kod tespiti ve bundle boyut bütçesi"
```

---

# FAZ 3 — Paylaşılan paketler

### Task 10: `@xox/game-core` — paket iskeleti ve tipler

**Files:**

- Create: `packages/game-core/package.json`, `packages/game-core/tsconfig.json`, `packages/game-core/vitest.config.ts`, `packages/game-core/src/types.ts`, `packages/game-core/src/errors.ts`

- [ ] **Step 1: `packages/game-core/package.json`**

```json
{
  "name": "@xox/game-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "eslint .",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "mutation": "stryker run"
  },
  "devDependencies": {
    "@stryker-mutator/api": "10.0.0",
    "@stryker-mutator/core": "10.0.0",
    "@stryker-mutator/vitest-runner": "10.0.0",
    "@vitest/coverage-v8": "4.1.11",
    "vitest": "4.1.11"
  }
}
```

Not: bu paket **derlenmez** — kaynağı doğrudan dışa verir. Next.js `transpilePackages` ile, Metro workspace çözümlemesiyle tüketir. Bu, gece koşusunda build zinciri beklemeyi ortadan kaldırır.

- [ ] **Step 2: `packages/game-core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "*.config.ts"]
}
```

- [ ] **Step 3: `packages/game-core/vitest.config.ts`**

```ts
import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: 'game-core',
      environment: 'node',
      // Yenilmezlik kanıtı 642 oyunu baştan sona oynatır (~0.6 sn) ve Stryker
      // dokuz test koşucusunu aynı anda çalıştırdığında bu süre birkaç katına
      // çıkar. Varsayılan 5 sn sınırı bu yüzden yükseltildi; takılan bir
      // mutantı hâlâ yakalar.
      testTimeout: 20_000,
      coverage: {
        thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  }),
)
```

- [ ] **Step 4: `packages/game-core/src/types.ts`**

```ts
export type Player = 'X' | 'O'

export type Cell = Player | null

/** Tahta her zaman tam 9 hücredir. Sıra: sol üstten sağ alta. */
export type Board = readonly [Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell]

export type WinLine = readonly [number, number, number]

export type GameStatus =
  | { readonly kind: 'playing'; readonly turn: Player }
  | { readonly kind: 'won'; readonly winner: Player; readonly line: WinLine }
  | { readonly kind: 'draw' }

export type Difficulty = 'easy' | 'medium' | 'unbeatable'
```

- [ ] **Step 5: `packages/game-core/src/errors.ts`**

```ts
export type InvalidMoveReason = 'out-of-range' | 'occupied' | 'game-over'

export class InvalidMoveError extends Error {
  readonly index: number
  readonly reason: InvalidMoveReason

  constructor(index: number, reason: InvalidMoveReason) {
    super(`Geçersiz hamle: ${String(index)} (${reason})`)
    this.name = 'InvalidMoveError'
    this.index = index
    this.reason = reason
  }
}
```

- [ ] **Step 6: Kur ve tip kontrolü**

```bash
pnpm add -D --filter @xox/game-core vitest@4.1.11 @vitest/coverage-v8@4.1.11
pnpm --filter @xox/game-core typecheck
```

Expected: çıktı yok, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add packages/game-core
git commit -m "feat(core): game-core paket iskeleti ve alan tipleri"
```

---

### Task 11: Tahta işlemleri — TDD

**Files:**

- Create: `packages/game-core/src/board.ts`, `packages/game-core/src/board.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
import { describe, expect, it } from 'vitest'
import {
  BOARD_SIZE,
  EMPTY_BOARD,
  availableMoves,
  boardFromCells,
  cellAt,
  nextPlayer,
} from './board'
import type { Board, Cell } from './types'

const b = (s: string): Board =>
  boardFromCells(Array.from(s).map((c) => (c === '.' ? null : (c as 'X' | 'O'))))

/** Tip sistemini aşan girdiyi taklit eder: kalıcı katmandan böyle veri gelebilir. */
const asCells = (values: readonly unknown[]): readonly Cell[] => values as readonly Cell[]

describe('EMPTY_BOARD', () => {
  it('dokuz boş hücreden oluşur', () => {
    expect(EMPTY_BOARD).toHaveLength(BOARD_SIZE)
    expect(EMPTY_BOARD.every((c) => c === null)).toBe(true)
  })

  it('donmuştur — yazma denemesi hata atar ve tahtayı bozmaz', () => {
    expect(Object.isFrozen(EMPTY_BOARD)).toBe(true)
    expect(() => {
      ;(EMPTY_BOARD as unknown as Cell[])[0] = 'X'
    }).toThrow(TypeError)
    expect(cellAt(EMPTY_BOARD, 0)).toBeNull()
  })
})

describe('boardFromCells', () => {
  it('dokuz hücreyi tahtaya çevirir', () => {
    expect(cellAt(b('X........'), 0)).toBe('X')
  })

  it('dokuz olmayan uzunlukta hata atar', () => {
    expect(() => boardFromCells([null, null])).toThrow(RangeError)
  })

  it('hata mesajı beklenen ve gelen hücre sayısını bildirir', () => {
    expect(() => boardFromCells([null, null])).toThrow('Tahta 9 hücre olmalı, 2 geldi')
  })

  it('X, O ve null dolu tahtayı kabul eder', () => {
    expect(boardFromCells(asCells(['X', 'O', null, 'O', 'X', null, null, 'X', 'O']))).toHaveLength(
      BOARD_SIZE,
    )
  })

  it('tanımsız hücre içeren diziyi reddeder — boş sanılan tahta kazanmış görünmesin', () => {
    expect(() => boardFromCells(asCells(Array.from({ length: BOARD_SIZE })))).toThrow(RangeError)
  })

  it('oyuncu olmayan hücre değerini reddeder', () => {
    expect(() => boardFromCells(asCells(['a', 'a', 'a', 'b', 'c', 'd', 'e', 'f', 'g']))).toThrow(
      RangeError,
    )
  })

  it('hata mesajı bozuk hücrenin sırasını ve değerini bildirir', () => {
    expect(() =>
      boardFromCells(asCells([null, 'X', 'O', 'x', null, null, null, null, null])),
    ).toThrow("Tahta hücresi 3 geçersiz: x — yalnız 'X', 'O' veya null olabilir")
  })

  it('küçük harf oyuncu simgesini reddeder', () => {
    expect(() =>
      boardFromCells(asCells(['o', null, null, null, null, null, null, null, null])),
    ).toThrow(RangeError)
  })

  it('son hücredeki bozuk değeri de yakalar', () => {
    expect(() =>
      boardFromCells(asCells([null, null, null, null, null, null, null, null, 0])),
    ).toThrow('Tahta hücresi 8 geçersiz')
  })
})

describe('availableMoves', () => {
  it('boş tahtada dokuz hamle döner', () => {
    expect(availableMoves(EMPTY_BOARD)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('dolu hücreleri atlar', () => {
    expect(availableMoves(b('XO.......'))).toEqual([2, 3, 4, 5, 6, 7, 8])
  })

  it('dolu tahtada boş dizi döner', () => {
    expect(availableMoves(b('XOXOXOXOX'))).toEqual([])
  })
})

describe('nextPlayer', () => {
  it('boş tahtada X ile başlar', () => {
    expect(nextPlayer(EMPTY_BOARD)).toBe('X')
  })

  it('X oynadıktan sonra O sırası', () => {
    expect(nextPlayer(b('X........'))).toBe('O')
  })

  it('eşit sayıda taş varsa X sırası', () => {
    expect(nextPlayer(b('XO.......'))).toBe('X')
  })
})
```

- [ ] **Step 2: Testi çalıştır — BAŞARISIZ olmalı**

Run: `pnpm --filter @xox/game-core test`
Expected: `Failed to resolve import "./board"` — dosya henüz yok.

- [ ] **Step 3: `packages/game-core/src/board.ts` yaz**

```ts
import type { Board, Cell, Player } from './types'

export const BOARD_SIZE = 9

/**
 * Boş tahta modül düzeyinde tek örnektir; bu yüzden dondurulur. `readonly`
 * yalnız derleme zamanında korur: uzun ömürlü bir sunucu sürecinde tek bir
 * `EMPTY_BOARD[0] = 'X'` yazması bundan sonraki bütün oyunları bozardı.
 */
export const EMPTY_BOARD: Board = Object.freeze<Board>([
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
])

/**
 * Tahta indeksi her zaman 0..8 aralığındadır; bu değişmez `boardFromCells`,
 * `availableMoves` ve `WIN_LINES` tarafından garanti edilir. Bu yüzden burada
 * savunmacı bir dal yerine tek bir daraltma yapılır — böylece kural motorunda
 * test edilemeyen dal kalmaz.
 *
 * Pakete özeldir, `index.ts` dışa aktarmaz: `Board` bir tuple olduğu için
 * tüketiciler `board[4]` yazarak aynı hücreyi tam tip güvenliğiyle okur,
 * `cellAt(board, 9)` ise `Cell` tipiyle `undefined` döndürürdü.
 */
export function cellAt(board: Board, index: number): Cell {
  return board[index] as Cell
}

/**
 * Dışarıdan gelen diziyi tahtaya çevirir; `Board`'a giden tek yol budur.
 *
 * Hem uzunluk hem de her hücrenin değeri doğrulanır: kalıcı katmandaki şema
 * hücreleri yalnız `String` olarak tanımlar, dolayısıyla `undefined` ya da
 * `'a'` gibi bir değer buraya kadar gelebilir. Doğrulanmazsa `evaluateStatus`
 * üç `undefined` hücreyi kazanan hat sanar ve `Player` tipli bir alana `'a'`
 * yazılır.
 */
export function boardFromCells(cells: readonly Cell[]): Board {
  if (cells.length !== BOARD_SIZE) {
    throw new RangeError(`Tahta ${String(BOARD_SIZE)} hücre olmalı, ${String(cells.length)} geldi`)
  }
  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const cell = cells[index]
    if (cell !== null && cell !== 'X' && cell !== 'O') {
      throw new RangeError(
        `Tahta hücresi ${String(index)} geçersiz: ${String(cell)} — yalnız 'X', 'O' veya null olabilir`,
      )
    }
  }
  return cells as Board
}

export function availableMoves(board: Board): number[] {
  const moves: number[] = []
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    if (cellAt(board, i) === null) moves.push(i)
  }
  return moves
}

/**
 * Sırası gelen oyuncuyu taş paritesinden türetir: X başlar, oyuncular sırayla
 * oynar; taş sayısı çiftse sıra X'te, tekse O'dadır.
 *
 * Sözleşme yalnızca kurallı oyunla üretilebilen tahtalar için anlamlıdır
 * (X sayısı O sayısına eşit ya da bir fazla). Beş X ve dört boş hücreden oluşan
 * gibi hiçbir oyunda oluşamayacak bir tahtada da kendinden emin bir cevap
 * ('O') döner: girdinin geçerliliğini doğrulamak çağıranın işidir.
 *
 * Sunucu "sıra kimde?" sorusunu bununla yanıtlar; `evaluateStatus(board)`
 * oyun sürüyorsa aynı değeri `turn` alanında verir.
 */
export function nextPlayer(board: Board): Player {
  let placed = 0
  for (const cell of board) {
    if (cell !== null) placed += 1
  }
  return placed % 2 === 0 ? 'X' : 'O'
}
```

- [ ] **Step 4: Testi çalıştır — GEÇMELİ**

Run: `pnpm --filter @xox/game-core test`
Expected: `Test Files  1 passed (1)` · `Tests  21 passed (21)`

- [ ] **Step 5: Commit**

```bash
git add packages/game-core/src/board.ts packages/game-core/src/board.test.ts
git commit -m "feat(core): tahta işlemleri — değişmez uygulama, katı hamle doğrulaması"
```

---

### Task 12: Oyun durumu değerlendirme — TDD

**Files:**

- Create: `packages/game-core/src/status.ts`, `packages/game-core/src/status.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
import { describe, expect, it } from 'vitest'
import { boardFromCells } from './board'
import { WIN_LINES, evaluateStatus } from './status'
import type { Board, WinLine } from './types'

const b = (s: string): Board =>
  boardFromCells(Array.from(s).map((c) => (c === '.' ? null : (c as 'X' | 'O'))))

describe('WIN_LINES', () => {
  it('sekiz kazanma hattı içerir', () => {
    expect(WIN_LINES).toHaveLength(8)
  })

  it('dizi donmuştur — hat eklenemez', () => {
    expect(Object.isFrozen(WIN_LINES)).toBe(true)
    expect(() => {
      ;(WIN_LINES as WinLine[]).push([0, 0, 0])
    }).toThrow(TypeError)
    expect(WIN_LINES).toHaveLength(8)
  })

  it('hatların kendisi de donmuştur — kazanma tespiti bozulamaz', () => {
    expect(WIN_LINES.every((line) => Object.isFrozen(line))).toBe(true)
    expect(() => {
      ;(WIN_LINES[0] as unknown as number[])[0] = 5
    }).toThrow(TypeError)
    expect(evaluateStatus(b('XXX......'))).toEqual({ kind: 'won', winner: 'X', line: [0, 1, 2] })
  })

  it('evaluateStatus donmuş hattı döndürür — çağıran motoru bozamaz', () => {
    const status = evaluateStatus(b('XXX......'))
    expect(status.kind).toBe('won')
    if (status.kind !== 'won') return
    expect(Object.isFrozen(status.line)).toBe(true)
  })
})

describe('evaluateStatus', () => {
  it('boş tahtada X sırası ile playing döner', () => {
    expect(evaluateStatus(b('.........'))).toEqual({ kind: 'playing', turn: 'X' })
  })

  it('tek hamle sonrası O sırası ile playing döner', () => {
    expect(evaluateStatus(b('X........'))).toEqual({ kind: 'playing', turn: 'O' })
  })

  it.each([
    ['üst yatay', 'XXXOO....', [0, 1, 2]],
    ['orta yatay', 'OO.XXX...', [3, 4, 5]],
    ['alt yatay', 'OO....XXX', [6, 7, 8]],
    ['sol dikey', 'XOOX..X..', [0, 3, 6]],
    ['orta dikey', 'OX.OX..X.', [1, 4, 7]],
    ['sağ dikey', 'OOX..X..X', [2, 5, 8]],
    ['ana çapraz', 'XO.OX...X', [0, 4, 8]],
    ['ters çapraz', 'OOX.X.X..', [2, 4, 6]],
  ])('%s hattında X kazanır', (_ad, cells, line) => {
    expect(evaluateStatus(b(cells))).toEqual({ kind: 'won', winner: 'X', line })
  })

  it('O kazandığında kazananı O olarak bildirir', () => {
    expect(evaluateStatus(b('OOOXX.X..'))).toEqual({ kind: 'won', winner: 'O', line: [0, 1, 2] })
  })

  it('tahta dolu ve kazanan yoksa draw döner', () => {
    expect(evaluateStatus(b('XXOOOXXOX'))).toEqual({ kind: 'draw' })
  })

  it('tahta dolu ama kazanan varsa won döner (draw değil)', () => {
    expect(evaluateStatus(b('XXXOOXOXO')).kind).toBe('won')
  })
})
```

- [ ] **Step 2: Testi çalıştır — BAŞARISIZ olmalı**

Run: `pnpm --filter @xox/game-core test status`
Expected: `Failed to resolve import "./status"`

- [ ] **Step 3: `packages/game-core/src/status.ts` yaz**

```ts
import { cellAt, nextPlayer } from './board'
import type { Board, GameStatus, WinLine } from './types'

/**
 * Sekiz kazanma hattı. Hem dizi hem de içindeki üçlüler dondurulur: `readonly`
 * yalnız derleme zamanında korur, oysa tek bir `WIN_LINES[0][0] = 5` yazması
 * süreç boyunca bütün kazanma tespitini bozardı. `evaluateStatus` bulduğu hattı
 * kopyalamadan döndürdüğü için iç üçlülerin de donmuş olması şarttır.
 */
export const WIN_LINES: readonly WinLine[] = Object.freeze([
  Object.freeze<WinLine>([0, 1, 2]),
  Object.freeze<WinLine>([3, 4, 5]),
  Object.freeze<WinLine>([6, 7, 8]),
  Object.freeze<WinLine>([0, 3, 6]),
  Object.freeze<WinLine>([1, 4, 7]),
  Object.freeze<WinLine>([2, 5, 8]),
  Object.freeze<WinLine>([0, 4, 8]),
  Object.freeze<WinLine>([2, 4, 6]),
])

export function evaluateStatus(board: Board): GameStatus {
  for (const line of WIN_LINES) {
    const [a, b, c] = line
    const first = cellAt(board, a)
    if (first !== null && first === cellAt(board, b) && first === cellAt(board, c)) {
      return { kind: 'won', winner: first, line }
    }
  }

  for (const cell of board) {
    if (cell === null) return { kind: 'playing', turn: nextPlayer(board) }
  }

  return { kind: 'draw' }
}
```

- [ ] **Step 4: Testi çalıştır — GEÇMELİ**

Run: `pnpm --filter @xox/game-core test`
Expected: `Tests  35 passed (35)`

- [ ] **Step 5: Commit**

```bash
git add packages/game-core/src/status.ts packages/game-core/src/status.test.ts
git commit -m "feat(core): kazanma/beraberlik değerlendirmesi — sekiz hat, kazanan hattı raporlanır"
```

---

### Task 13: Hamle katmanı ve minimax AI — TDD

⚠️ **Katman sırası kritik.** `applyMove`/`isValidMove` oyunun bitip bitmediğini bilmek zorunda,
yani `evaluateStatus`'a ihtiyaç duyar; `status.ts` de `board.ts`'ten `cellAt`/`nextPlayer` alır.
İkisini `board.ts`'e koyarsan **döngüsel import** oluşur ve `import-x/no-cycle` build'i kırar.
Çözüm katmanlama — hepsi tek yönlü: `board → status → moves → ai`.

- [ ] **Step 0a: `moves.test.ts` yaz, kırmızı olduğunu gör**

```ts
import { describe, expect, it } from 'vitest'
import { EMPTY_BOARD, boardFromCells, cellAt } from './board'
import { InvalidMoveError } from './errors'
import { applyMove, isValidMove } from './moves'
import { evaluateStatus } from './status'
import type { Board } from './types'

const b = (s: string): Board =>
  boardFromCells(Array.from(s).map((c) => (c === '.' ? null : (c as 'X' | 'O'))))

/** X 0-1-2 hattıyla kazanmıştır; 5 dahil dört hücre boş durur. */
const wonBoard = 'XXXOO....'

describe('isValidMove', () => {
  it('boş hücre için true döner', () => {
    expect(isValidMove(EMPTY_BOARD, 4)).toBe(true)
  })

  it('dolu hücre için false döner', () => {
    expect(isValidMove(b('....X....'), 4)).toBe(false)
  })

  it('sınırdaki geçerli indeksler için true döner', () => {
    expect(isValidMove(EMPTY_BOARD, 0)).toBe(true)
    expect(isValidMove(EMPTY_BOARD, 8)).toBe(true)
  })

  it('aralık dışı indeks için false döner', () => {
    expect(isValidMove(EMPTY_BOARD, -1)).toBe(false)
    expect(isValidMove(EMPTY_BOARD, 9)).toBe(false)
  })

  it('tam sayı olmayan indeks için false döner', () => {
    expect(isValidMove(EMPTY_BOARD, 1.5)).toBe(false)
  })

  it('oyun kazanılmışsa boş hücre için bile false döner', () => {
    expect(cellAt(b(wonBoard), 5)).toBeNull()
    expect(isValidMove(b(wonBoard), 5)).toBe(false)
  })

  it('tahta dolduğunda false döner', () => {
    expect(isValidMove(b('XXOOOXXOX'), 0)).toBe(false)
  })
})

describe('applyMove', () => {
  it('yeni tahta döner, girdiyi değiştirmez', () => {
    const before = EMPTY_BOARD
    const after = applyMove(before, 0, 'X')
    expect(cellAt(after, 0)).toBe('X')
    expect(cellAt(before, 0)).toBeNull()
  })

  it('dolu hücrede InvalidMoveError atar', () => {
    expect(() => applyMove(b('X........'), 0, 'O')).toThrow(
      expect.objectContaining({ name: 'InvalidMoveError', reason: 'occupied' }),
    )
  })

  it('aralık dışı indekste InvalidMoveError atar', () => {
    try {
      applyMove(EMPTY_BOARD, 9, 'X')
      expect.unreachable('hata atmalıydı')
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidMoveError)
      expect((error as InvalidMoveError).reason).toBe('out-of-range')
    }
  })

  it('tam sayı olmayan indekste InvalidMoveError atar', () => {
    expect(() => applyMove(EMPTY_BOARD, 2.5, 'X')).toThrow(InvalidMoveError)
  })

  it('tam sayı olmayan indeksi occupied değil out-of-range sayar', () => {
    expect(() => applyMove(EMPTY_BOARD, 2.5, 'X')).toThrow(
      expect.objectContaining({ reason: 'out-of-range' }),
    )
  })

  it('negatif indeksi occupied değil out-of-range sayar', () => {
    expect(() => applyMove(EMPTY_BOARD, -1, 'X')).toThrow(
      expect.objectContaining({ reason: 'out-of-range' }),
    )
  })

  it('oyun kazanıldıktan sonra boş hücreye hamleyi reddeder', () => {
    expect(() => applyMove(b(wonBoard), 5, 'O')).toThrow(
      expect.objectContaining({ index: 5, reason: 'game-over' }),
    )
  })

  it('biten oyunda ikinci bir kazanan hat oluşturulamaz', () => {
    // Doğrulanmasaydı 5 hamlesi 3-4-5 hattını da tamamlar ve iki kazananlı,
    // sunucuda onarılamaz bir oyun kaydı üretirdi.
    expect(evaluateStatus(b(wonBoard))).toEqual({ kind: 'won', winner: 'X', line: [0, 1, 2] })
    expect(() => applyMove(b(wonBoard), 5, 'O')).toThrow(InvalidMoveError)
  })

  it('biten oyunda dolu hücre için occupied değil game-over bildirir', () => {
    expect(() => applyMove(b(wonBoard), 0, 'O')).toThrow(
      expect.objectContaining({ reason: 'game-over' }),
    )
  })

  it('biten oyunda bile aralık dışı indeks out-of-range kalır', () => {
    expect(() => applyMove(b(wonBoard), 9, 'O')).toThrow(
      expect.objectContaining({ reason: 'out-of-range' }),
    )
  })

  it('beraberlikle dolan tahtada hamleyi reddeder', () => {
    expect(() => applyMove(b('XXOOOXXOX'), 0, 'X')).toThrow(
      expect.objectContaining({ reason: 'game-over' }),
    )
  })
})
```

Run: `pnpm --filter @xox/game-core test moves` → Expected: `Cannot find module './moves'`

- [ ] **Step 0b: `packages/game-core/src/moves.ts` yaz**

Reddetme sırası **aralık → oyun bitti → dolu**. Oyun bittiğinde hücrenin boş olup olmaması
önemsizdir, bu yüzden `game-over` `occupied`'dan önce gelir.

```ts
import { BOARD_SIZE, boardFromCells, cellAt } from './board'
import { InvalidMoveError } from './errors'
import { evaluateStatus } from './status'
import type { Board, Cell, Player } from './types'

/**
 * Hamle katmanı. Hamle doğrulaması `evaluateStatus`'a, `status.ts` ise
 * `board.ts`'e ihtiyaç duyduğu için doğrulama `board.ts` içinde kalsaydı
 * board -> status -> board döngüsü oluşurdu. Katmanlar tek yönlü tutulur:
 * board -> status -> moves -> ai.
 */

function isInRange(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < BOARD_SIZE
}

function isPlayable(board: Board): boolean {
  return evaluateStatus(board).kind === 'playing'
}

/** Hamlenin kurallara uygunluğu: indeks aralığı, oyunun sürüyor olması, hücrenin boşluğu. */
export function isValidMove(board: Board, index: number): boolean {
  if (!isInRange(index)) return false
  if (!isPlayable(board)) return false
  return cellAt(board, index) === null
}

/**
 * Hamleyi uygular ve yeni tahtayı döner; girdiyi değiştirmez.
 *
 * Reddetme sırası niyetlidir: aralık dışı indeks argümanın kendi hatasıdır,
 * biten oyun ise tahtanın durumu hakkındadır ve dolu hücreden önce gelir —
 * bitmiş bir oyunda hiçbir hücreye oynanamaz, hücrenin boş olması bunu
 * değiştirmez.
 *
 * Sıra sahipliği bilerek doğrulanmaz; gerekçesi için `index.ts`'e bakın.
 */
export function applyMove(board: Board, index: number, player: Player): Board {
  if (!isInRange(index)) {
    throw new InvalidMoveError(index, 'out-of-range')
  }
  if (!isPlayable(board)) {
    throw new InvalidMoveError(index, 'game-over')
  }
  if (cellAt(board, index) !== null) {
    throw new InvalidMoveError(index, 'occupied')
  }
  return placeStone(board, index, player)
}

/**
 * Doğrulanmış hamleyi tahtaya işler. Pakete özeldir (`index.ts` dışa aktarmaz):
 * dışarıdan gelen her hamle `applyMove`'dan geçmelidir.
 *
 * Arama ağacı (minimax) hamlelerini `availableMoves`'tan üretir ve yalnız
 * `playing` durumundaki tahtalarda ilerler, yani üç doğrulamanın üçünü de
 * kurulum gereği sağlar. Aramanın her düğümde yeniden doğrulaması hamle başına
 * fazladan bir `evaluateStatus` demek olurdu: ölçümde boş tahtadaki en iyi hamle
 * 515 ms yerine 1006 ms sürüyordu.
 */
export function placeStone(board: Board, index: number, player: Player): Board {
  const next: Cell[] = [...board]
  next[index] = player
  return boardFromCells(next)
}
```

Run: `pnpm --filter @xox/game-core test moves` → Expected: geçmeli

**Files:**

- Create: `packages/game-core/src/ai.ts`, `packages/game-core/src/ai.test.ts`

- [ ] **Step 1: Başarısız testi yaz**

```ts
import { describe, expect, it } from 'vitest'
import { EMPTY_BOARD, availableMoves, boardFromCells } from './board'
import { applyMove } from './moves'
import { evaluateStatus } from './status'
import { bestMove, chooseMove } from './ai'
import { InvalidMoveError } from './errors'
import type { Board, Difficulty, Player } from './types'

const b = (s: string): Board =>
  boardFromCells(Array.from(s).map((c) => (c === '.' ? null : (c as 'X' | 'O'))))

/** Sabit diziden değer üreten sahte rastgele sayı üreteci — deterministik test için. */
const seededRng = (values: readonly number[]): (() => number) => {
  let i = 0
  return () => values[i++ % values.length] ?? 0
}

describe('bestMove', () => {
  it('kazanma hamlesini alır', () => {
    expect(bestMove(b('XX.OO....'), 'X')).toBe(2)
  })

  it('rakibin kazanmasını engeller', () => {
    expect(bestMove(b('OO.X..X..'), 'X')).toBe(2)
  })

  it('kazanmayı engellemeye tercih eder', () => {
    // O 0-1-2'de kazanmak üzere (engelleme hücresi 2), X ise 3-4-5 ile hemen
    // kazanabilir (kazanma hücresi 5). Kazanma hücresi engelleme hücresinden
    // BÜYÜK indeksli seçildi: "önce engelle" ya da "en küçük indeksi seç"
    // davranışı bu tahtada 2 döner ve testi düşürür.
    expect(bestMove(b('OO.XX....'), 'X')).toBe(5)
  })

  it('hamle kalmamışsa InvalidMoveError atar', () => {
    expect(() => bestMove(b('XOXXOOOXX'), 'X')).toThrow(
      expect.objectContaining({ index: -1, reason: 'game-over' }),
    )
  })

  it('oyun kazanılmışsa boş hücre kalsa bile hamle üretmez', () => {
    expect(() => bestMove(b('XXXOO....'), 'O')).toThrow(
      expect.objectContaining({ index: -1, reason: 'game-over' }),
    )
  })

  it('eşit puanlı hamlelerde ilkini seçer — seçim deterministiktir', () => {
    // Boş tahtada her hamle beraberlikle biter; sunucu otoritesi için sonuç
    // yeniden üretilebilir olmalı, bu yüzden ilk en iyi hamle korunur.
    expect(bestMove(EMPTY_BOARD, 'X')).toBe(0)
  })

  it('hemen kazanabilecekken kazancı bir tura ertelemez', () => {
    // 3 oynanırsa 3-4-5 ile hemen kazanır. 6 da kazandırır (O'yu bloklar ve
    // 2 ile 3'te çifte tehdit kurar) ama bir hamle sonra: derinlik cezası
    // olmadan AI erteleyeni seçerdi.
    expect(bestMove(b('....XX.OO'), 'X')).toBe(3)
  })

  // Seçilen hamle sunucu otoritesidir ve iki istemcide aynı çıkmalıdır; oyun
  // teorisi açısından eşdeğer başka hamleler bulunsa da SEÇİM sabittir. Bu
  // tablo hem stratejiyi hem de eşitlik bozma kuralını (en küçük indeks)
  // oyun ortasındaki tahtalarda çivi ler.
  it.each([
    ['X........', 'O', 4, 'merkez tek doğru cevaptır'],
    ['....X....', 'O', 0, 'merkez alınmışsa köşe — eşit dört köşeden ilki'],
    ['X.......O', 'X', 2, 'eşit puanlı 2 ve 6 arasından küçük indeksli'],
    ['XOX......', 'X', 4, 'eşit puanlı 4, 6 ve 8 arasından küçük indeksli'],
    ['X..O..X..', 'O', 4, 'çifte tehdidi yalnız merkez durdurur'],
    ['X.O.X...O', 'X', 5, 'beraberliği yalnız 5 kurtarır'],
    ['XX.O.O...', 'X', 2, 'kazanç hattı tamamlanır'],
  ])('%s tahtasında %s için %i seçilir (%s)', (cells, player, expected) => {
    expect(bestMove(b(cells), player as Player)).toBe(expected)
  })
})

describe('unbeatable zorluk', () => {
  interface Tally {
    games: number
    losses: number
    illegal: number
  }

  /**
   * Tümevarımsal kanıt: insanın oynadığı her düğümde BÜTÜN hamleler denenir,
   * AI'nın düğümünde tek dal (motorun seçtiği hamle) izlenir. Böylece mükemmel
   * AI'nın karşılaşabileceği bütün oyunlar taranır — senaryo örneklemesi değil.
   */
  const explore = (board: Board, aiPlayer: Player, tally: Tally): void => {
    const status = evaluateStatus(board)
    if (status.kind !== 'playing') {
      tally.games += 1
      if (status.kind === 'won' && status.winner !== aiPlayer) tally.losses += 1
      return
    }
    if (status.turn === aiPlayer) {
      const move = chooseMove(board, aiPlayer, 'unbeatable')
      if (!availableMoves(board).includes(move)) {
        tally.illegal += 1
        return
      }
      explore(applyMove(board, move, aiPlayer), aiPlayer, tally)
      return
    }
    for (const move of availableMoves(board)) {
      explore(applyMove(board, move, status.turn), aiPlayer, tally)
    }
  }

  const playAll = (aiPlayer: Player): Tally => {
    const tally: Tally = { games: 0, losses: 0, illegal: 0 }
    explore(EMPTY_BOARD, aiPlayer, tally)
    return tally
  }

  it('X olarak oynayan AI, rakibin bütün oyunlarında kaybetmez ve kural dışı hamle yapmaz', () => {
    const tally = playAll('X')
    expect({ losses: tally.losses, illegal: tally.illegal }).toEqual({ losses: 0, illegal: 0 })
    // Oyun sayısı, eşitlik bozma kuralının deterministik olduğunu da sabitler:
    // AI başka bir eşdeğer hamle seçseydi ağaç başka sayıda yaprak verirdi.
    expect(tally.games).toBe(73)
  })

  it('O olarak oynayan AI, rakibin bütün oyunlarında kaybetmez ve kural dışı hamle yapmaz', () => {
    const tally = playAll('O')
    expect({ losses: tally.losses, illegal: tally.illegal }).toEqual({ losses: 0, illegal: 0 })
    expect(tally.games).toBe(569)
  })

  it('iki mükemmel AI karşılaşırsa beraberlik olur', () => {
    let board = EMPTY_BOARD
    let status = evaluateStatus(board)
    while (status.kind === 'playing') {
      board = applyMove(board, chooseMove(board, status.turn, 'unbeatable'), status.turn)
      status = evaluateStatus(board)
    }
    expect(status).toEqual({ kind: 'draw' })
  })
})

describe('chooseMove', () => {
  it('easy zorlukta rastgele seçer', () => {
    expect(chooseMove(EMPTY_BOARD, 'X', 'easy', seededRng([0.5]))).toBe(4)
  })

  // Aşağıdaki tahtada en iyi hamle 2 (O'nun 0-1-2 tehdidini bloklar); boş
  // hücreler [2, 4, 5, 7, 8] olduğundan rng=0.9 rastgele seçiciyi 8'e götürür.
  // Böylece "en iyi" ile "rastgele" birbirinden ayırt edilebilir.
  const forkBoard = 'OO.X..X..'

  it('easy zorlukta en iyi hamleyi değil rastgele hamleyi oynar', () => {
    expect(chooseMove(b(forkBoard), 'X', 'easy', seededRng([0.9]))).toBe(8)
  })

  it('easy zorlukta rng 1 dönse bile son geçerli hamleyi seçer', () => {
    expect(chooseMove(EMPTY_BOARD, 'X', 'easy', () => 1)).toBe(8)
  })

  it('easy zorlukta rng < 0.5 olsa bile en iyi hamleye sapmaz', () => {
    // medium dalına düşen bir uygulama burada 0.3 < 0.5 diye en iyi hamleyi (2)
    // oynardı; easy her zaman rastgeledir.
    expect(chooseMove(b(forkBoard), 'X', 'easy', seededRng([0.3]))).toBe(4)
  })

  it('easy zorlukta rng negatif dönse bile ilk geçerli hamleyi seçer', () => {
    expect(chooseMove(EMPTY_BOARD, 'X', 'easy', () => -0.1)).toBe(0)
  })

  it('easy zorlukta rng NaN dönse bile geçerli bir hamle seçer', () => {
    expect(chooseMove(EMPTY_BOARD, 'X', 'easy', () => Number.NaN)).toBe(0)
  })

  // Aşağıdaki üç test tek değerli (sabit) bir üreteç kullanır: ternary'nin
  // koşulu kaldırılırsa `rng()` çağrısı da kaybolur, dizi tabanlı bir üreteçte
  // sıra kayar ve rastgele seçici tesadüfen en iyi hamleyi bulabilirdi. Sabit
  // üreteçte hangi dalın çalıştığı sonuçtan tek anlamlı okunur.
  it('medium zorlukta rng < 0.5 ise rastgeleyi değil en iyiyi oynar', () => {
    // 0.3 rastgele seçiciye gitseydi indeks 1, yani 4 hamlesi seçilirdi.
    expect(chooseMove(b(forkBoard), 'X', 'medium', seededRng([0.3]))).toBe(2)
  })

  it('medium zorlukta rng >= 0.5 ise en iyiyi değil rastgeleyi oynar', () => {
    expect(chooseMove(b(forkBoard), 'X', 'medium', seededRng([0.9]))).toBe(8)
  })

  it('medium zorlukta rng tam 0.5 ise rastgele oynar — sınır dahil değil', () => {
    // 0.5 en iyi hamleye (2) değil, listenin ortasındaki 5'e götürür.
    expect(chooseMove(b(forkBoard), 'X', 'medium', seededRng([0.5]))).toBe(5)
  })

  it('unbeatable zorlukta rastgeleliği yok sayar', () => {
    expect(chooseMove(b(forkBoard), 'X', 'unbeatable', seededRng([0.9]))).toBe(2)
  })

  it('geçerli bir hamle indeksi döndürür', () => {
    const move = chooseMove(EMPTY_BOARD, 'X', 'easy')
    expect(availableMoves(EMPTY_BOARD)).toContain(move)
  })

  it('hamle kalmamışsa InvalidMoveError atar', () => {
    expect(() => chooseMove(b('XOXXOOOXX'), 'X', 'easy')).toThrow(InvalidMoveError)
    expect(() => chooseMove(b('XOXXOOOXX'), 'X', 'easy')).toThrow(
      expect.objectContaining({ index: -1, reason: 'game-over' }),
    )
  })

  it('oyun kazanılmışsa boş hücre kalsa bile hamle üretmez', () => {
    expect(() => chooseMove(b('XXXOO....'), 'O', 'unbeatable')).toThrow(
      expect.objectContaining({ index: -1, reason: 'game-over' }),
    )
  })

  it('kolay zorlukta bile biten oyunda hamle üretmez', () => {
    expect(() => chooseMove(b('XXXOO....'), 'O', 'easy', () => 0)).toThrow(InvalidMoveError)
  })

  it('tip sisteminin dışından gelen zorluğu sessizce kabul etmez', () => {
    expect(() => chooseMove(EMPTY_BOARD, 'X', 'imkansiz' as Difficulty)).toThrow(
      new RangeError('Bilinmeyen zorluk: imkansiz'),
    )
  })
})
```

- [ ] **Step 2: Testi çalıştır — BAŞARISIZ olmalı**

Run: `pnpm --filter @xox/game-core test ai`
Expected: `Failed to resolve import "./ai"`

- [ ] **Step 3: `packages/game-core/src/ai.ts` yaz**

```ts
import { availableMoves } from './board'
import { InvalidMoveError } from './errors'
import { placeStone } from './moves'
import { evaluateStatus } from './status'
import type { Board, Difficulty, Player } from './types'

/**
 * DEĞİŞMEZ: WIN_SCORE > BOARD_SIZE (yani > 9, `board.ts`).
 *
 * Minimax kazancı `WIN_SCORE - depth`, kaybı `depth - WIN_SCORE` diye puanlar;
 * derinlik en fazla BOARD_SIZE (dokuz yarım hamle) olur. WIN_SCORE bu sınıra
 * eşit ya da altında kalsaydı geç bir kazanç 0'a (beraberlik) düşer, altına
 * inince de işaret değiştirip kayıp gibi görünürdü. Şu anki pay tam olarak 1.
 *
 * Sabit bilerek `BOARD_SIZE + 1` diye türetilmedi: 9040 ulaşılabilir
 * (konum × oyuncu) çiftinde WIN_SCORE=8 ile WIN_SCORE=10 aynı hamleyi seçiyor,
 * yani türetmenin doğuracağı `BOARD_SIZE - 1` mutantı hiçbir testle
 * öldürülemeyen eşdeğer bir mutant olurdu. Değişmez bu yüzden burada yazıyla
 * korunuyor; ihlali `ai.test.ts`'teki tümevarımsal yenilmezlik kanıtı
 * yakalar (örneğin WIN_SCORE=5 ile AI 48 farklı oyunu kaybeder).
 */
const WIN_SCORE = 10

/** Kökten oynanan hamlenin derinliği — tek yerde yazılır, bkz. `bestMove`. */
const ROOT_DEPTH = 1

function opponentOf(player: Player): Player {
  return player === 'X' ? 'O' : 'X'
}

/**
 * Çağıranlar listenin boş olmadığını önceden doğrular; bu yüzden burada
 * test edilemeyecek savunmacı bir dal açmak yerine tek daraltma yapılır.
 *
 * Kural çakışması: `non-nullable-type-assertion-style` burada `!` ister,
 * `no-non-null-assertion` ise `!` kullanımını yasaklar. İkisi aynı anda
 * sağlanamadığı için stil kuralı tek satırda susturulur.
 */
function pickRandom(moves: readonly number[], rng: () => number): number {
  const raw = Math.floor(rng() * moves.length)
  // rng dışarıdan enjekte edilebilir (tohumlu üreteç, sahte üreteç): sözleşmeye
  // uymayan bir değer indeksi listenin dışına taşımasın diye iki uç da
  // kelepçelenir. NaN her karşılaştırmada false döndüğü için ayrıca ele alınır.
  const index = Number.isNaN(raw) ? 0 : Math.min(Math.max(raw, 0), moves.length - 1)
  // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style -- `!` yasak
  return moves[index] as number
}

/**
 * Derinlik cezalı minimax: erken kazanç geç kazançtan, geç kayıp erken
 * kayıptan iyidir. Böylece AI kazanmayı geciktirmez ve kaybı geciktirir.
 */
function minimax(board: Board, current: Player, maximizing: Player, depth: number): number {
  const status = evaluateStatus(board)
  if (status.kind === 'won') {
    return status.winner === maximizing ? WIN_SCORE - depth : depth - WIN_SCORE
  }
  if (status.kind === 'draw') return 0

  const scores = availableMoves(board).map((move) =>
    minimax(placeStone(board, move, current), opponentOf(current), maximizing, depth + 1),
  )

  return current === maximizing ? Math.max(...scores) : Math.min(...scores)
}

/** Oyun bitmişse hamle üretilemez; kalan tek doğru cevap hatadır. */
function assertPlayable(board: Board): void {
  if (evaluateStatus(board).kind !== 'playing') {
    throw new InvalidMoveError(-1, 'game-over')
  }
}

/**
 * Oyun teorisi anlamında en iyi hamle. `assertPlayable` sayesinde en az bir
 * hamle vardır, bu yüzden puanlama tek biçimli bir döngüdür: kök derinliği
 * tek bir yerde geçer ve "ilk hamleyi ayrı puanla" tohumlaması gerekmez.
 *
 * Eşit puanlı hamlelerde en küçük indeksli olan korunur (karşılaştırma kesin
 * `>`): seçim sunucu otoritesidir ve platformlar arası yeniden üretilebilir
 * olmalıdır.
 */
export function bestMove(board: Board, player: Player): number {
  assertPlayable(board)

  const scored = availableMoves(board).map((move) => ({
    move,
    score: minimax(placeStone(board, move, player), opponentOf(player), player, ROOT_DEPTH),
  }))

  return scored.reduce((best, candidate) => (candidate.score > best.score ? candidate : best)).move
}

export function chooseMove(
  board: Board,
  player: Player,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): number {
  assertPlayable(board)
  const moves = availableMoves(board)

  switch (difficulty) {
    case 'easy':
      return pickRandom(moves, rng)
    case 'medium':
      return rng() < 0.5 ? bestMove(board, player) : pickRandom(moves, rng)
    case 'unbeatable':
      return bestMove(board, player)
    // Zorluk tip sisteminin dışından (istek gövdesi, veritabanı) gelebilir;
    // sessizce `undefined` döndürmek yerine yüksek sesle reddedilir.
    default:
      throw new RangeError(`Bilinmeyen zorluk: ${String(difficulty)}`)
  }
}
```

- [ ] **Step 4: Testi çalıştır — GEÇMELİ**

Run: `pnpm --filter @xox/game-core test`
Expected: `Tests  56 passed (56)` — boş tahtadan minimax birkaç saniye sürebilir, normaldir.

- [ ] **Step 5: Kapsamı doğrula — %100 olmalı**

Run: `pnpm --filter @xox/game-core test:coverage`
Expected: `All files | 100 | 100 | 100 | 100` — eşik altındaysa **build kırılır**, eksik dalı test et.

- [ ] **Step 6: Commit**

```bash
git add packages/game-core/src/ai.ts packages/game-core/src/ai.test.ts
git commit -m "feat(core): derinlik cezalı minimax AI ve üç zorluk seviyesi"
```

---

### Task 14: `game-core` dışa aktarım yüzeyi

**Files:**

- Create: `packages/game-core/src/index.ts`

- [ ] **Step 1: `packages/game-core/src/index.ts`**

```ts
/**
 * @xox/game-core — saf kural motoru: G/Ç yok, çerçeve yok, bağımlılık yok.
 *
 * `applyMove` / `isValidMove` şu üç kuralı uygular (reddetme sırasıyla):
 * 1. indeks 0..8 aralığında tam sayı olmalı  -> 'out-of-range'
 * 2. oyun sürüyor olmalı                     -> 'game-over'
 * 3. hücre boş olmalı                        -> 'occupied'
 *
 * SIRA SAHİPLİĞİ BİLEREK DOĞRULANMAZ. `applyMove(board, i, 'X')` üst üste
 * çağrılırsa X arka arkaya oynayabilir. Gerekçe: motorun sıra paritesini
 * dayatması sunucuyu güvende tutmaya yetmez — asıl soru "sıra X'te mi?" değil,
 * "bu isteği gönderen *kullanıcı* X mi?"dir ve oyuncu kimliği game-core'un
 * göremediği bir bilgidir. Yarım bir kontrol, tam sanılma riski taşır.
 * Motor bunun yerine kararı vermek için gereken tek girdiyi dışa verir:
 * `nextPlayer(board)` (oyun sürerken `evaluateStatus(board).turn` ile aynıdır).
 *
 * Çevrimiçi oyunu yöneten katman her hamlede şunu doğrulamalıdır:
 *   nextPlayer(board) === istegiGonderenOyuncununTasi
 */
export { BOARD_SIZE, EMPTY_BOARD, availableMoves, boardFromCells, nextPlayer } from './board'
export { applyMove, isValidMove } from './moves'
export { WIN_LINES, evaluateStatus } from './status'
export { bestMove, chooseMove } from './ai'
export { InvalidMoveError } from './errors'
export type { InvalidMoveReason } from './errors'
export type { Board, Cell, Difficulty, GameStatus, Player, WinLine } from './types'
```

- [ ] **Step 2: Tip kontrolü ve lint**

Run: `pnpm --filter @xox/game-core typecheck && pnpm lint packages/game-core`
Expected: her ikisi de exit code 0.

- [ ] **Step 3: Commit**

```bash
git add packages/game-core/src/index.ts
git commit -m "feat(core): genel API yüzeyi"
```

---

### Task 15: Stryker mutasyon testi — "yeşil ama yalancı test" savunması

**Files:**

- Create: `packages/game-core/stryker.config.mjs`

- [ ] **Step 1: Stryker kur**

```bash
pnpm add -D --filter @xox/game-core @stryker-mutator/core@10.0.0 @stryker-mutator/vitest-runner@10.0.0
```

- [ ] **Step 2: `packages/game-core/stryker.config.mjs`**

```js
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  // pnpm sembolik bağ kurar; Stryker'ın varsayılan '@stryker-mutator/*' glob'u
  // sembolik bağları izlemediği için eklenti açıkça belirtilir.
  plugins: ['@stryker-mutator/vitest-runner'],
  inPlace: true,
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: '../../reports/mutation/game-core.html' },
  coverageAnalysis: 'perTest',
  mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/index.ts', '!src/types.ts'],
  thresholds: { high: 95, low: 90, break: 90 },
  timeoutMS: 60000,
}
```

- [ ] **Step 3: `packages/game-core/src/errors.test.ts` yaz**

Mutasyon testi, yalnızca hata _sınıfını_ kontrol eden testlerin bozuk bir hata mesajını
yakalamadığını ortaya çıkarır. Bu dosya o boşluğu kapatır:

```ts
import { describe, expect, it } from 'vitest'
import { InvalidMoveError } from './errors'

describe('InvalidMoveError', () => {
  it('indeksi ve sebebi mesajda bildirir', () => {
    expect(new InvalidMoveError(4, 'occupied').message).toBe('Geçersiz hamle: 4 (occupied)')
  })

  it('her sebep için mesajı ayrı ayrı biçimlendirir', () => {
    expect(new InvalidMoveError(-1, 'game-over').message).toBe('Geçersiz hamle: -1 (game-over)')
    expect(new InvalidMoveError(9, 'out-of-range').message).toBe('Geçersiz hamle: 9 (out-of-range)')
  })

  it('adını, indeksini ve sebebini alan olarak taşır', () => {
    const error = new InvalidMoveError(2, 'occupied')
    expect(error.name).toBe('InvalidMoveError')
    expect(error.index).toBe(2)
    expect(error.reason).toBe('occupied')
  })

  it('Error alt sınıfıdır', () => {
    expect(new InvalidMoveError(0, 'occupied')).toBeInstanceOf(Error)
  })
})
```

- [ ] **Step 4: Çalıştır**

Run: `pnpm --filter @xox/game-core mutation`
Expected: `Mutation score: 98.49%` — `break` eşiği (90) aşıldığı için exit code 0.

⚠️ `testTimeout: 20_000` `vitest.config.ts`'te olmalı: Stryker dry-run'da 9 eşzamanlı runner
başlatır ve 1 saniyelik `bestMove(EMPTY_BOARD)` testi 5 saniyelik varsayılanı aşıp tüm
mutasyon koşusunu iptal ettirir.

Skor 90'ın altındaysa: rapor `reports/mutation/game-core.html`'de hangi mutantların hayatta kaldığını gösterir. Her hayatta kalan mutant, bir testin bir davranışı gerçekten doğrulamadığı anlamına gelir — test ekle, kodu değiştirme.

⚠️ **İlk koşu %90'ın altında çıkar (~%83) — bu beklenen.** Planın temel testleri davranışı
tam kapatmaz. Hayatta kalan mutantları öldürmek için **yalnızca test ekle**; implementasyonu
değiştirme, eşiği düşürme. Eklenmesi gereken testler (2026-08-24'te ölçüldü):

| Nerede           | Ne eklenmeli                                                                                       | Öldürdüğü mutant                    |
| ---------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `errors.test.ts` | Hata mesajının içeriği, alanlar, `instanceof Error`                                                | `super('')`                         |
| `board.test.ts`  | `RangeError` mesaj içeriği                                                                         | mesaj mutantı                       |
| `board.test.ts`  | `isValidMove` sınır indeksleri 0 ve 8                                                              | `index <= 0`                        |
| `board.test.ts`  | `applyMove(2.5)` ve `applyMove(-1)` **`reason: 'out-of-range'`** dönmeli (`'occupied'` değil)      | 3 guard mutantı                     |
| `ai.test.ts`     | Boş tahtada deterministik ilk-en-iyi seçimi                                                        | `>` → `>=`                          |
| `ai.test.ts`     | `bestMove(b('....XX.OO')) === 3` — kazancı geciktirmemeli                                          | `WIN_SCORE + depth`                 |
| `ai.test.ts`     | AI'ın O olduğu dördüncü playout eşleşmesi                                                          | `current === maximizing` ternary ×2 |
| `ai.test.ts`     | Her iki throw noktasında `index: -1`, `reason: 'game-over'`                                        | throw mutantları                    |
| `ai.test.ts`     | `chooseMove`: en-iyi ≠ rastgele olan bir tahtada easy/medium/unbeatable ayrımı, `rng()` tam 0.5'te | zorluk dalları                      |

Bu testler eklendikten sonra skor **%94.58** olur. Kalan 9 mutantın tamamı `board.ts`'te ve
**eşdeğer mutant**tır (öldürmek erişilemez savunmacı dal eklemeyi gerektirir, o da %100 dal
kapsamasını bozar): `isValidMove` guard'ında 7 tane (guard kaldırılsa bile `undefined === null`
zaten `false` döner), `availableMoves`'ta `i <= BOARD_SIZE` (fazladan tur `undefined` okur,
hiçbir şey eklemez), `nextPlayer`'da `placed -= 1` (parite negasyona simetrik).

- [ ] **Step 5: Commit**

```bash
git add packages/game-core/stryker.config.mjs packages/game-core/src/errors.test.ts \
  packages/game-core/src packages/game-core/package.json pnpm-lock.yaml
git commit -m "test(core): Stryker mutasyon testi, %90 kırılma eşiği"
```

---

### Task 16: `@xox/shared` — sözleşme paketi

`shared` davranış içermez. Yalnızca istemci ve sunucunun **aynı** şemayı kullanmasını garanti eder.

**Files:**

- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/ws-protocol.ts`, `packages/shared/src/ws-protocol.test.ts`, `packages/shared/src/index.ts`

- [ ] **Step 1: Paket iskeleti**

```json
{
  "name": "@xox/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "eslint .",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "zod": "4.4.3"
  }
}
```

```json
{ "extends": "../../tsconfig.base.json", "include": ["src/**/*.ts", "*.config.ts"] }
```

```ts
// packages/shared/vitest.config.ts
import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: 'shared',
      environment: 'node',
      coverage: { thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 } },
    },
  }),
)
```

- [ ] **Step 2: `packages/shared/src/constants.ts`**

```ts
/** Karışan karakterler (I, O, 0, 1) alfabede yok — kod telefonda okunacak. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6
export const ROOM_TTL_SECONDS = 2 * 60 * 60
export const MOVE_TIMEOUT_SECONDS = 60
export const WS_HEARTBEAT_MS = 25_000
export const WS_RECONNECT_BASE_MS = 500
export const WS_RECONNECT_MAX_MS = 10_000
export const MAX_EMOJI_LENGTH = 8
```

- [ ] **Step 3: Başarısız testi yaz**

```ts
// packages/shared/src/ws-protocol.test.ts
import { describe, expect, it } from 'vitest'
import { clientMessageSchema, roomCodeSchema, serverMessageSchema } from './ws-protocol'

describe('roomCodeSchema', () => {
  it('geçerli altı karakterli kodu kabul eder', () => {
    expect(roomCodeSchema.safeParse('AB2C3D').success).toBe(true)
  })

  it('karışan karakterleri (I, O, 0, 1) reddeder', () => {
    expect(roomCodeSchema.safeParse('ABIC3D').success).toBe(false)
    expect(roomCodeSchema.safeParse('AB0C3D').success).toBe(false)
  })

  it('yanlış uzunluğu reddeder', () => {
    expect(roomCodeSchema.safeParse('AB2C3').success).toBe(false)
  })

  it('küçük harfi reddeder', () => {
    expect(roomCodeSchema.safeParse('ab2c3d').success).toBe(false)
  })
})

describe('clientMessageSchema', () => {
  it('geçerli join mesajını çözer', () => {
    const result = clientMessageSchema.safeParse({ type: 'join', roomCode: 'AB2C3D' })
    expect(result.success).toBe(true)
  })

  it('aralık dışı hamle indeksini reddeder', () => {
    expect(clientMessageSchema.safeParse({ type: 'move', index: 9 }).success).toBe(false)
    expect(clientMessageSchema.safeParse({ type: 'move', index: -1 }).success).toBe(false)
  })

  it('tam sayı olmayan hamle indeksini reddeder', () => {
    expect(clientMessageSchema.safeParse({ type: 'move', index: 1.5 }).success).toBe(false)
  })

  it('bilinmeyen mesaj tipini reddeder', () => {
    expect(clientMessageSchema.safeParse({ type: 'hack' }).success).toBe(false)
  })

  it('aşırı uzun emojiyi reddeder', () => {
    expect(
      clientMessageSchema.safeParse({ type: 'chat:emoji', emoji: 'x'.repeat(99) }).success,
    ).toBe(false)
  })
})

describe('serverMessageSchema', () => {
  it('state mesajını çözer', () => {
    const result = serverMessageSchema.safeParse({
      type: 'state',
      roomCode: 'AB2C3D',
      board: [null, null, null, null, null, null, null, null, null],
      status: { kind: 'playing', turn: 'X' },
      players: { X: 'u1', O: null },
      version: 1,
    })
    expect(result.success).toBe(true)
  })

  it('dokuz hücreden farklı tahtayı reddeder', () => {
    const result = serverMessageSchema.safeParse({
      type: 'state',
      roomCode: 'AB2C3D',
      board: [null, null],
      status: { kind: 'draw' },
      players: { X: 'u1', O: null },
      version: 1,
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 4: Testi çalıştır — BAŞARISIZ olmalı**

Run: `pnpm --filter @xox/shared test`
Expected: `Failed to resolve import "./ws-protocol"`

- [ ] **Step 5: `packages/shared/src/ws-protocol.ts` yaz**

```ts
import { z } from 'zod'
import { MAX_EMOJI_LENGTH, ROOM_CODE_LENGTH } from './constants'

export const playerSchema = z.enum(['X', 'O'])
export const cellSchema = playerSchema.nullable()
export const boardSchema = z.array(cellSchema).length(9)

/** ROOM_CODE_ALPHABET ile aynı küme: I, O, 0, 1 hariç. */
export const roomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .regex(/^[A-HJ-NP-Z2-9]+$/, 'Oda kodu yalnızca karışmayan büyük harf ve rakam içerir')

export const moveIndexSchema = z.number().int().min(0).max(8)

export const gameStatusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('playing'), turn: playerSchema }),
  z.object({
    kind: z.literal('won'),
    winner: playerSchema,
    line: z.tuple([z.number(), z.number(), z.number()]),
  }),
  z.object({ kind: z.literal('draw') }),
])

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), roomCode: roomCodeSchema }),
  z.object({ type: z.literal('move'), index: moveIndexSchema }),
  z.object({ type: z.literal('resign') }),
  z.object({ type: z.literal('rematch:offer') }),
  z.object({ type: z.literal('rematch:accept') }),
  z.object({ type: z.literal('chat:emoji'), emoji: z.string().min(1).max(MAX_EMOJI_LENGTH) }),
  z.object({ type: z.literal('ping') }),
])

const seatsSchema = z.object({ X: z.string().nullable(), O: z.string().nullable() })

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('state'),
    roomCode: roomCodeSchema,
    board: boardSchema,
    status: gameStatusSchema,
    players: seatsSchema,
    /** Monotonik sürüm — istemci iyimser güncellemeyi bununla geri alır. */
    version: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('move:applied'),
    index: moveIndexSchema,
    by: playerSchema,
    version: z.number().int(),
  }),
  z.object({ type: z.literal('move:rejected'), index: moveIndexSchema, reason: z.string() }),
  z.object({ type: z.literal('opponent:joined'), userId: z.string(), seat: playerSchema }),
  z.object({ type: z.literal('opponent:left'), userId: z.string() }),
  z.object({ type: z.literal('game:over'), status: gameStatusSchema }),
  z.object({ type: z.literal('rematch:offered'), by: z.string() }),
  z.object({ type: z.literal('chat:emoji'), from: z.string(), emoji: z.string() }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
  z.object({ type: z.literal('pong') }),
])

export type ClientMessage = z.infer<typeof clientMessageSchema>
export type ServerMessage = z.infer<typeof serverMessageSchema>
export type Seats = z.infer<typeof seatsSchema>
```

- [ ] **Step 6: `packages/shared/src/index.ts`**

```ts
export * from './constants'
export * from './ws-protocol'
```

- [ ] **Step 7: Test ve kapsam**

Run: `pnpm --filter @xox/shared test:coverage`
Expected: `Tests  11 passed (11)` ve kapsam eşiklerinin üzerinde.

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): zod tabanlı WS protokolü ve oda kodu sözleşmesi"
```

---

### Task 17: `@xox/db` — kalıcılık katmanı

**Files:**

- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/vitest.config.ts`, `packages/db/src/client.ts`, `packages/db/src/models/{user,room,game}.ts`, `packages/db/src/room-code.ts`, `packages/db/src/room-code.test.ts`, `packages/db/src/seed.ts`, `packages/db/src/reset.ts`, `packages/db/src/index.ts`

- [ ] **Step 1: Paket iskeleti ve bağımlılıklar**

```json
{
  "name": "@xox/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "eslint .",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "seed": "tsx src/seed.ts",
    "reset": "tsx src/reset.ts"
  },
  "dependencies": {
    "@xox/shared": "workspace:*",
    "mongodb": "7.5.0",
    "mongoose": "9.9.3"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "4.1.11",
    "tsx": "^4.23.12",
    "vitest": "4.1.11"
  }
}
```

```bash
pnpm add -D --filter @xox/db vitest@4.1.11 @vitest/coverage-v8@4.1.11 mongodb-memory-server@11.2.0 tsx
```

- [ ] **Step 2: `packages/db/src/client.ts` — serverless-güvenli bağlantı**

```ts
import mongoose from 'mongoose'
import type { MongoClient } from 'mongodb'

/**
 * Fluid Compute instance'ları modül kapsamını yeniden kullanır. Global önbellek
 * olmadan her istek yeni bir bağlantı havuzu açar ve Atlas bağlantı limiti dolar.
 */
interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

const globalForMongoose = globalThis as unknown as { __xoxMongoose?: MongooseCache }

const cache: MongooseCache = (globalForMongoose.__xoxMongoose ??= { conn: null, promise: null })

export function getMongoUri(): string {
  const uri = process.env['MONGODB_URI']
  if (uri === undefined || uri === '') {
    throw new Error(
      'MONGODB_URI tanımlı değil. .env.local veya Vercel ortam değişkenlerini kontrol et.',
    )
  }
  return uri
}

export function getDbName(): string {
  return process.env['MONGODB_DB'] ?? 'xox_dev'
}

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn !== null) return cache.conn

  cache.promise ??= mongoose.connect(getMongoUri(), {
    dbName: getDbName(),
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  })

  cache.conn = await cache.promise
  return cache.conn
}

/**
 * Auth.js MongoDB adapter'ı `mongodb` sürücüsünü doğrudan ister. Mongoose'un
 * mevcut istemcisini paylaşarak ikinci bir bağlantı havuzu açılmasını önleriz.
 */
export async function getMongoClient(): Promise<MongoClient> {
  const conn = await connectDb()
  return conn.connection.getClient()
}

export async function disconnectDb(): Promise<void> {
  if (cache.conn === null) return
  await cache.conn.disconnect()
  cache.conn = null
  cache.promise = null
}
```

- [ ] **Step 3: `packages/db/src/models/user.ts`**

```ts
import { Schema, model, models, type Model } from 'mongoose'

export interface UserDoc {
  _id: string
  name: string
  email: string
  image?: string
  stats: { wins: number; losses: number; draws: number }
  elo: number
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<UserDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    email: { type: String, required: true, lowercase: true, index: true },
    image: { type: String },
    stats: {
      wins: { type: Number, default: 0, min: 0 },
      losses: { type: Number, default: 0, min: 0 },
      draws: { type: Number, default: 0, min: 0 },
    },
    elo: { type: Number, default: 1200, index: true },
  },
  { timestamps: true, collection: 'users', _id: false },
)

export const User: Model<UserDoc> =
  (models['User'] as Model<UserDoc> | undefined) ?? model<UserDoc>('User', userSchema)
```

- [ ] **Step 4: `packages/db/src/models/room.ts`**

```ts
import { ROOM_TTL_SECONDS } from '@xox/shared'
import { Schema, model, models, type Model } from 'mongoose'

export type RoomState = 'waiting' | 'playing' | 'finished'

export interface RoomDoc {
  code: string
  state: RoomState
  seats: { X: string | null; O: string | null }
  gameId: string | null
  /** Her yazma işleminde artar — istemci iyimser güncellemeyi bununla uzlaştırır. */
  version: number
  createdAt: Date
  updatedAt: Date
}

const roomSchema = new Schema<RoomDoc>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      minlength: 6,
      maxlength: 6,
    },
    state: {
      type: String,
      enum: ['waiting', 'playing', 'finished'],
      default: 'waiting',
      index: true,
    },
    seats: {
      X: { type: String, default: null },
      O: { type: String, default: null },
    },
    gameId: { type: String, default: null },
    version: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'rooms' },
)

// Terk edilmiş odalar kendiliğinden temizlenir.
roomSchema.index({ updatedAt: 1 }, { expireAfterSeconds: ROOM_TTL_SECONDS })

export const Room: Model<RoomDoc> =
  (models['Room'] as Model<RoomDoc> | undefined) ?? model<RoomDoc>('Room', roomSchema)
```

- [ ] **Step 5: `packages/db/src/models/game.ts`**

```ts
import { Schema, model, models, type Model } from 'mongoose'

export interface MoveDoc {
  index: number
  by: 'X' | 'O'
  at: Date
}

export interface GameDoc {
  roomCode: string
  board: (('X' | 'O') | null)[]
  moves: MoveDoc[]
  winner: 'X' | 'O' | null
  isDraw: boolean
  finishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const moveSchema = new Schema<MoveDoc>(
  {
    index: { type: Number, required: true, min: 0, max: 8 },
    by: { type: String, enum: ['X', 'O'], required: true },
    at: { type: Date, default: (): Date => new Date() },
  },
  { _id: false },
)

const gameSchema = new Schema<GameDoc>(
  {
    roomCode: { type: String, required: true, index: true },
    board: { type: [String], default: (): null[] => Array.from({ length: 9 }, () => null) },
    moves: { type: [moveSchema], default: (): MoveDoc[] => [] },
    winner: { type: String, enum: ['X', 'O', null], default: null },
    isDraw: { type: Boolean, default: false },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'games' },
)

gameSchema.index({ finishedAt: -1 })

export const Game: Model<GameDoc> =
  (models['Game'] as Model<GameDoc> | undefined) ?? model<GameDoc>('Game', gameSchema)
```

- [ ] **Step 6: Oda kodu üretimi — önce başarısız test**

```ts
// packages/db/src/room-code.test.ts
import { describe, expect, it } from 'vitest'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@xox/shared'
import { generateRoomCode } from './room-code'

describe('generateRoomCode', () => {
  it('doğru uzunlukta kod üretir', () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH)
  })

  it('yalnızca izin verilen alfabeden karakter kullanır', () => {
    for (let i = 0; i < 200; i += 1) {
      for (const ch of generateRoomCode()) {
        expect(ROOM_CODE_ALPHABET).toContain(ch)
      }
    }
  })

  it('200 üretimde tekrar oranı düşüktür', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateRoomCode()))
    expect(codes.size).toBeGreaterThan(190)
  })
})
```

Run: `pnpm --filter @xox/db test` → Expected: `Failed to resolve import "./room-code"`

- [ ] **Step 7: `packages/db/src/room-code.ts`**

```ts
import { randomInt } from 'node:crypto'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@xox/shared'

/** Math.random tahmin edilebilir; oda kodu kriptografik üreteçten gelir. */
export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET.charAt(randomInt(ROOM_CODE_ALPHABET.length))
  }
  return code
}
```

Run: `pnpm --filter @xox/db test` → Expected: `Tests  3 passed (3)`

- [ ] **Step 8: `packages/db/src/reset.ts` — e2e için veritabanı sıfırlama**

```ts
import { connectDb, disconnectDb, getDbName } from './client'

const RESETTABLE = new Set(['xox_test'])

/** Yalnızca test veritabanı sıfırlanabilir — yanlış cluster'a karşı sert koruma. */
export async function resetDatabase(): Promise<void> {
  const dbName = getDbName()
  if (!RESETTABLE.has(dbName)) {
    throw new Error(`Reddedildi: '${dbName}' sıfırlanabilir değil. Yalnızca xox_test sıfırlanır.`)
  }
  const conn = await connectDb()
  await conn.connection.dropDatabase()
}

if (process.argv[1]?.endsWith('reset.ts') === true) {
  await resetDatabase()
  await disconnectDb()
  console.warn(`Sıfırlandı: ${getDbName()}`)
}
```

- [ ] **Step 9: `packages/db/src/seed.ts` — deterministik e2e kullanıcıları**

```ts
import { connectDb, disconnectDb } from './client'
import { User } from './models/user'

/** E2E testleri bu kullanıcılarla giriş yapar. Kimlikler sabittir — testler tahmin etmez. */
export const TEST_USERS = [
  { _id: 'e2e-user-1', name: 'Test Oyuncu 1', email: 'e2e1@xox.test' },
  { _id: 'e2e-user-2', name: 'Test Oyuncu 2', email: 'e2e2@xox.test' },
] as const

export async function seedTestUsers(): Promise<void> {
  await connectDb()
  for (const user of TEST_USERS) {
    await User.updateOne(
      { _id: user._id },
      { $setOnInsert: { ...user, stats: { wins: 0, losses: 0, draws: 0 }, elo: 1200 } },
      { upsert: true },
    )
  }
}

if (process.argv[1]?.endsWith('seed.ts') === true) {
  await seedTestUsers()
  await disconnectDb()
  console.warn(`${String(TEST_USERS.length)} test kullanıcısı hazır`)
}
```

- [ ] **Step 10: `packages/db/src/index.ts`**

```ts
export { connectDb, disconnectDb, getDbName, getMongoClient, getMongoUri } from './client'
export { generateRoomCode } from './room-code'
export { resetDatabase } from './reset'
export { TEST_USERS, seedTestUsers } from './seed'
export { User, type UserDoc } from './models/user'
export { Room, type RoomDoc, type RoomState } from './models/room'
export { Game, type GameDoc, type MoveDoc } from './models/game'
```

- [ ] **Step 11: `client.ts` ve `reset.ts` testleri — kapsam eşiği bunlarsız tutmaz**

Bir sonraki adımdaki kapsam eşiği (90/85/90/90) `client.ts` ve `reset.ts`'i de kapsar;
yalnızca `room-code.test.ts` ile eşik **tutmaz ve build kırılır.** Bu iki dosya davranış
doğrular: önbellek `??=` yerine `=` olursa, `getMongoClient` ikinci havuz açarsa,
`disconnectDb` önbelleği temizlemezse, ya da `resetDatabase` guard'ı delinirse testler kırılır.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const rawClient = { tag: 'raw-mongo-client' }
  const getClient = vi.fn()
  const disconnect = vi.fn()
  const connect = vi.fn()
  const fake = { connect, connection: { getClient }, disconnect }
  return { rawClient, getClient, disconnect, connect, fake }
})

vi.mock('mongoose', () => ({ default: mocks.fake }))

const globalCache = globalThis as unknown as { __xoxMongoose?: unknown }

/** Her test taze modül kapsamıyla başlar; global önbellek testler arası sızmamalı. */
async function loadClient() {
  return import('./client')
}

beforeEach(() => {
  vi.resetModules()
  delete globalCache.__xoxMongoose
  mocks.connect.mockImplementation((): Promise<unknown> => Promise.resolve(mocks.fake))
  mocks.getClient.mockImplementation((): unknown => mocks.rawClient)
  mocks.disconnect.mockImplementation((): Promise<void> => Promise.resolve())
  vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017')
  vi.stubEnv('MONGODB_DB', undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getMongoUri', () => {
  it('ortam değişkenindeki URI değerini döndürür', async () => {
    vi.stubEnv('MONGODB_URI', 'mongodb://example:27017')
    const { getMongoUri } = await loadClient()
    expect(getMongoUri()).toBe('mongodb://example:27017')
  })

  it('MONGODB_URI tanımsızsa hata fırlatır', async () => {
    vi.stubEnv('MONGODB_URI', undefined)
    const { getMongoUri } = await loadClient()
    expect(() => getMongoUri()).toThrow(/MONGODB_URI/)
  })

  it('MONGODB_URI boş dizeyse hata fırlatır', async () => {
    vi.stubEnv('MONGODB_URI', '')
    const { getMongoUri } = await loadClient()
    expect(() => getMongoUri()).toThrow(/MONGODB_URI/)
  })
})

describe('getDbName', () => {
  it('MONGODB_DB tanımsızsa xox_dev varsayılanını döndürür', async () => {
    const { getDbName } = await loadClient()
    expect(getDbName()).toBe('xox_dev')
  })

  it('MONGODB_DB tanımlıysa onu döndürür', async () => {
    vi.stubEnv('MONGODB_DB', 'xox_test')
    const { getDbName } = await loadClient()
    expect(getDbName()).toBe('xox_test')
  })
})

describe('connectDb', () => {
  it('mongoose.connect çağrısını URI ve veritabanı adıyla yapar', async () => {
    vi.stubEnv('MONGODB_DB', 'xox_test')
    const { connectDb } = await loadClient()
    await connectDb()
    expect(mocks.connect).toHaveBeenCalledWith('mongodb://localhost:27017', {
      dbName: 'xox_test',
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    })
  })

  it('ikinci çağrıda önbelleği kullanır — ikinci havuz açmaz', async () => {
    const { connectDb } = await loadClient()
    const first = await connectDb()
    const second = await connectDb()
    expect(second).toBe(first)
    expect(mocks.connect).toHaveBeenCalledTimes(1)
  })

  it('eşzamanlı çağrılarda tek bir bağlantı sözü paylaşılır', async () => {
    const { connectDb } = await loadClient()
    await Promise.all([connectDb(), connectDb(), connectDb()])
    expect(mocks.connect).toHaveBeenCalledTimes(1)
  })
})

describe('getMongoClient', () => {
  it('mongoose bağlantısının altındaki ham istemciyi paylaşır', async () => {
    const { getMongoClient } = await loadClient()
    const client = await getMongoClient()
    expect(client).toBe(mocks.rawClient)
  })

  it('ikinci bağlantı havuzu açmaz', async () => {
    const { connectDb, getMongoClient } = await loadClient()
    await connectDb()
    await getMongoClient()
    expect(mocks.connect).toHaveBeenCalledTimes(1)
  })
})

describe('disconnectDb', () => {
  it('hiç bağlanılmadıysa hiçbir şey yapmaz', async () => {
    const { disconnectDb } = await loadClient()
    await disconnectDb()
    expect(mocks.disconnect).not.toHaveBeenCalled()
  })

  it('bağlantıyı kapatır ve önbelleği temizler — sonraki çağrı yeniden bağlanır', async () => {
    const { connectDb, disconnectDb } = await loadClient()
    await connectDb()
    await disconnectDb()
    expect(mocks.disconnect).toHaveBeenCalledTimes(1)

    await connectDb()
    expect(mocks.connect).toHaveBeenCalledTimes(2)
  })
})
```

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const dropDatabase = vi.fn()
  const connectDb = vi.fn()
  const disconnectDb = vi.fn()
  const getDbName = vi.fn()
  return { dropDatabase, connectDb, disconnectDb, getDbName }
})

vi.mock('./client', () => ({
  connectDb: mocks.connectDb,
  disconnectDb: mocks.disconnectDb,
  getDbName: mocks.getDbName,
}))

beforeEach(() => {
  vi.resetModules()
  mocks.dropDatabase.mockImplementation((): Promise<void> => Promise.resolve())
  mocks.connectDb.mockImplementation((): Promise<unknown> =>
    Promise.resolve({ connection: { dropDatabase: mocks.dropDatabase } }),
  )
  mocks.disconnectDb.mockImplementation((): Promise<void> => Promise.resolve())
  mocks.getDbName.mockImplementation((): string => 'xox_test')
})

describe('resetDatabase', () => {
  it('xox_test veritabanını düşürür', async () => {
    const { resetDatabase } = await import('./reset')
    await resetDatabase()
    expect(mocks.dropDatabase).toHaveBeenCalledTimes(1)
  })

  it('xox_test dışındaki veritabanını reddeder ve bağlanmaz', async () => {
    mocks.getDbName.mockImplementation((): string => 'xox_prod')
    const { resetDatabase } = await import('./reset')
    await expect(resetDatabase()).rejects.toThrow(/xox_prod/)
    expect(mocks.connectDb).not.toHaveBeenCalled()
    expect(mocks.dropDatabase).not.toHaveBeenCalled()
  })

  it('geliştirme veritabanını da reddeder', async () => {
    mocks.getDbName.mockImplementation((): string => 'xox_dev')
    const { resetDatabase } = await import('./reset')
    await expect(resetDatabase()).rejects.toThrow(/Yalnızca xox_test/)
    expect(mocks.dropDatabase).not.toHaveBeenCalled()
  })
})

describe('CLI girişi', () => {
  it('doğrudan çalıştırıldığında sıfırlar ve bağlantıyı kapatır', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const originalArgv = [...process.argv]
    process.argv = ['node', '/repo/packages/db/src/reset.ts']
    try {
      await import('./reset')
    } finally {
      process.argv = originalArgv
    }

    expect(mocks.dropDatabase).toHaveBeenCalledTimes(1)
    expect(mocks.disconnectDb).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('Sıfırlandı: xox_test')
  })

  it('başka bir dosyadan import edildiğinde kendiliğinden çalışmaz', async () => {
    await import('./reset')
    expect(mocks.dropDatabase).not.toHaveBeenCalled()
    expect(mocks.disconnectDb).not.toHaveBeenCalled()
  })
})
```

Gerçek MongoDB'ye bağlanılmaz — `mongoose` ve `./client` mock'lanır.

- [ ] **Step 12: `packages/db/vitest.config.ts`**

```ts
import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: 'db',
      environment: 'node',
      coverage: {
        thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
        exclude: ['src/seed.ts', 'src/models/**'],
      },
    },
  }),
)
```

- [ ] **Step 13: Tip kontrolü, test, commit**

Run: `pnpm --filter @xox/db typecheck && pnpm --filter @xox/db test:coverage`
Expected: exit code 0.

```bash
git add packages/db pnpm-lock.yaml
git commit -m "feat(db): mongoose modelleri, paylaşımlı bağlantı, oda kodu üretimi, seed/reset"
```

---

### Task 18: `@xox/ui-tokens` — görsel sabitler

**Files:**

- Create: `packages/ui-tokens/package.json`, `packages/ui-tokens/tsconfig.json`, `packages/ui-tokens/src/{colors,spacing,typography,index}.ts`

- [ ] **Step 1: Paket iskeleti**

```json
{
  "name": "@xox/ui-tokens",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json", "lint": "eslint ." }
}
```

```json
{ "extends": "../../tsconfig.base.json", "include": ["src/**/*.ts"] }
```

- [ ] **Step 2: `packages/ui-tokens/src/colors.ts`**

```ts
/** Web (Tailwind CSS değişkenleri) ve mobil (StyleSheet) aynı değerleri buradan alır. */
export const colors = {
  light: {
    bg: '#faf9f7',
    surface: '#ffffff',
    border: '#e5e2dd',
    text: '#1c1917',
    textMuted: '#78716c',
    accent: '#2563eb',
    playerX: '#2563eb',
    playerO: '#e11d48',
    win: '#16a34a',
    danger: '#dc2626',
  },
  dark: {
    bg: '#17161a',
    surface: '#211f26',
    border: '#35323c',
    text: '#f5f4f2',
    textMuted: '#a8a29e',
    accent: '#60a5fa',
    playerX: '#60a5fa',
    playerO: '#fb7185',
    win: '#4ade80',
    danger: '#f87171',
  },
} as const

export type ColorScheme = keyof typeof colors
export type ColorToken = keyof (typeof colors)['light']
```

- [ ] **Step 3: `packages/ui-tokens/src/spacing.ts` ve `typography.ts`**

```ts
// spacing.ts
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const
export const radius = { sm: 6, md: 12, lg: 20, full: 9999 } as const
export type SpacingToken = keyof typeof spacing
```

```ts
// typography.ts
export const fontSize = { xs: 12, sm: 14, base: 16, lg: 20, xl: 28, display: 44 } as const
export const fontWeight = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const
export type FontSizeToken = keyof typeof fontSize
```

- [ ] **Step 4: `packages/ui-tokens/src/index.ts`**

```ts
export { colors, type ColorScheme, type ColorToken } from './colors'
export { radius, spacing, type SpacingToken } from './spacing'
export { fontSize, fontWeight, type FontSizeToken } from './typography'
```

- [ ] **Step 5: Doğrula ve commit**

Run: `pnpm --filter @xox/ui-tokens typecheck && pnpm lint packages/ui-tokens`

```bash
git add packages/ui-tokens
git commit -m "feat(ui): web ve mobil için paylaşılan tasarım tokenları"
```

---

# FAZ 4 — Uygulamalar

### Task 19: `apps/web` — Next.js iskeleti

**Files:**

- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/vitest.config.ts`, `apps/web/app/{layout.tsx,page.tsx,globals.css}`, `apps/web/messages/tr.ts`, `.env.example`

- [ ] **Step 1: `apps/web/package.json`**

```json
{
  "name": "@xox/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --turbopack --port 3000",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "eslint .",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@vercel/functions": "3.9.5",
    "@xox/db": "workspace:*",
    "next": "16.3.2",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "ws": "8.21.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.3",
    "@testing-library/jest-dom": "7.0.1",
    "@types/node": "24.13.3",
    "@types/react": "19.2.8",
    "@types/react-dom": "19.2.5",
    "@types/ws": "8.18.1",
    "@vitejs/plugin-react": "6.1.0",
    "@vitest/coverage-v8": "4.1.11",
    "jsdom": "30.0.1",
    "vitest": "4.1.11"
  }
}
```

- [ ] **Step 2: Kur**

```bash
pnpm install
```

- [ ] **Step 3: `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2023"],
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts", "next-env.d.ts"],
  "exclude": ["node_modules", ".next"]
}
```

- [ ] **Step 4: `apps/web/next.config.ts`**

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace paketleri kaynak olarak dışa verilir; Next onları kendisi derler.
  transpilePackages: ['@xox/game-core', '@xox/shared', '@xox/db', '@xox/ui-tokens'],
  typedRoutes: true,
  // Lint kök `eslint.config.mjs` üzerinden ayrı bir kapı; Next 16 zaten build
  // sırasında ESLint çalıştırmıyor (`eslint` anahtarı da artık geçersiz).
  typescript: { ignoreBuildErrors: false },
}

export default config
```

`eslint.ignoreDuringBuilds` bilinçli: lint kök `eslint.config.mjs` üzerinden ayrı bir kapı olarak çalışır, build sırasında ikinci kez koşmasına gerek yok.

- [ ] **Step 5: `apps/web/postcss.config.mjs` ve `app/globals.css` (Tailwind v4)**

```js
// apps/web/postcss.config.mjs
export default { plugins: { '@tailwindcss/postcss': {} } }
```

```css
/* apps/web/app/globals.css — Tailwind v4 CSS-first; tailwind.config.js YOK */
@import 'tailwindcss';

@theme {
  --color-bg: #faf9f7;
  --color-surface: #ffffff;
  --color-border: #e5e2dd;
  --color-text: #1c1917;
  --color-accent: #2563eb;
  --color-player-x: #2563eb;
  --color-player-o: #e11d48;
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-bg: #17161a;
    --color-surface: #211f26;
    --color-border: #35323c;
    --color-text: #f5f4f2;
    --color-accent: #60a5fa;
    --color-player-x: #60a5fa;
    --color-player-o: #fb7185;
  }
}

body {
  background: var(--color-bg);
  color: var(--color-text);
}
```

- [ ] **Step 6: `apps/web/messages/tr.ts` — tüm arayüz metinleri tek yerde**

```ts
/**
 * Uygulama tek dilli (Türkçe). i18n kütüphanesi yok, ama tüm metinler burada
 * toplanır: ileride EN gerekirse tüm UI dosyalarını dolaşmak gerekmez.
 */
export const tr = {
  app: { name: 'XOX', tagline: 'Arkadaşınla ya da bilgisayara karşı oyna' },
  common: { loading: 'Yükleniyor…', error: 'Bir şeyler ters gitti', retry: 'Tekrar dene' },
  home: { playVsComputer: 'Bilgisayara karşı', createRoom: 'Oda kur', joinRoom: 'Odaya katıl' },
} as const
```

- [ ] **Step 7: `apps/web/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { tr } from '@/messages/tr'
import './globals.css'

export const metadata: Metadata = {
  title: tr.app.name,
  description: tr.app.tagline,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <html lang="tr">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 8: `apps/web/app/page.tsx`**

```tsx
import { tr } from '@/messages/tr'

export default function HomePage(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-4xl font-bold tracking-tight">{tr.app.name}</h1>
      <p className="text-center opacity-70">{tr.app.tagline}</p>
    </main>
  )
}
```

- [ ] **Step 9: `.env.example` (kök)**

```bash
# MongoDB Atlas — GERÇEK DEĞERLER .env.local'de, ASLA commit edilmez
MONGODB_URI=mongodb+srv://<kullanici>:<sifre>@<cluster>.mongodb.net/?appName=XoxCluster
MONGODB_DB=xox_dev

# Auth.js
AUTH_SECRET=
AUTH_URL=http://localhost:3000

# E2E
E2E_BASE_URL=http://localhost:3000
```

- [ ] **Step 10: Build ve doğrula**

Run: `pnpm --filter @xox/web build`
Expected: `✓ Compiled successfully` — hata yok.

- [ ] **Step 11: Commit**

```bash
git add apps/web .env.example pnpm-lock.yaml
git commit -m "feat(web): Next.js 16 iskeleti, Tailwind v4, merkezî Türkçe metinler"
```

---

### Task 20: Sağlık ve MongoDB ping uç noktası — TDD

**Files:**

- Create: `apps/web/app/api/health/route.ts`, `apps/web/app/api/health/route.test.ts`, `apps/web/vitest.config.ts`

- [ ] **Step 1: `apps/web/vitest.config.ts`**

```ts
import { defineConfig, mergeConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { sharedConfig } from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    plugins: [react()],
    test: {
      name: 'web',
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      coverage: {
        thresholds: { lines: 70, branches: 65, functions: 70, statements: 70 },
        exclude: ['app/**/layout.tsx', 'messages/**', 'next.config.ts', '**/*.config.*'],
      },
    },
  }),
)
```

```ts
// apps/web/vitest.setup.ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 2: Başarısız testi yaz**

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xox/db', () => ({
  connectDb: vi.fn(),
  getDbName: (): string => 'xox_test',
}))

describe('GET /api/health', () => {
  it('veritabanı erişilebilirken 200 ve ok:true döner', async () => {
    const { connectDb } = await import('@xox/db')
    vi.mocked(connectDb).mockResolvedValue({
      connection: { db: { admin: () => ({ ping: (): Promise<void> => Promise.resolve() }) } },
    } as never)

    const { GET } = await import('./route')
    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, db: 'xox_test' })
  })

  it('veritabanı erişilemezken 503 ve ok:false döner', async () => {
    const { connectDb } = await import('@xox/db')
    vi.mocked(connectDb).mockRejectedValue(new Error('bağlantı reddedildi'))

    const { GET } = await import('./route')
    const response = await GET()

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ ok: false })
  })

  it('Error olmayan bir hata fırlatıldığında da 503 döner', async () => {
    const { connectDb } = await import('@xox/db')
    vi.mocked(connectDb).mockRejectedValue('dize hata')

    const { GET } = await import('./route')
    const response = await GET()

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ ok: false, error: 'bilinmeyen hata' })
  })
})
```

- [ ] **Step 3: Testi çalıştır — BAŞARISIZ olmalı**

Run: `pnpm --filter @xox/web test`
Expected: `Failed to resolve import "./route"`

- [ ] **Step 4: `apps/web/app/api/health/route.ts` yaz**

```ts
import { connectDb, getDbName } from '@xox/db'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  try {
    const conn = await connectDb()
    await conn.connection.db?.admin().ping()
    return Response.json({ ok: true, db: getDbName(), at: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'bilinmeyen hata'
    return Response.json({ ok: false, error: message }, { status: 503 })
  }
}
```

- [ ] **Step 5: Testi çalıştır — GEÇMELİ**

Run: `pnpm --filter @xox/web test`
Expected: `Tests  2 passed (2)`

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/health apps/web/vitest.config.ts apps/web/vitest.setup.ts
git commit -m "feat(web): sağlık uç noktası ve MongoDB erişilebilirlik kontrolü"
```

---

### Task 21: WebSocket echo uç noktası — **en büyük riskin kanıtı**

Bu görev tüm gece koşusunun dayandığı varsayımı test eder: _Vercel Fluid Compute üzerinde
WebSocket gerçekten çalışıyor mu?_ Çalışmıyorsa tasarımdaki Redis yedeğine geçilir.

API doğrulandı: `vercel.com/docs/functions/websockets`.

**Files:**

- Create: `apps/web/app/api/ws/echo/route.ts`

- [ ] **Step 1: `apps/web/app/api/ws/echo/route.ts`**

```ts
import { connection } from 'next/server'
import { experimental_upgradeWebSocket, type WebSocketData } from '@vercel/functions'

/**
 * `ws` mesaj yükü Buffer, Buffer[] ya da ArrayBuffer olabilir. Düz `String(data)`
 * ArrayBuffer için `[object ArrayBuffer]` üretirdi; hepsini utf8 metne indirgiyoruz.
 */
function toText(data: WebSocketData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  return Buffer.from(data).toString('utf8')
}

/**
 * Salt kanıt uç noktası: gelen mesajı `echo:` ön ekiyle geri gönderir.
 * Gerçek oyun WS'i buna değil `/api/rooms/[code]/ws` yoluna kurulacak;
 * bu uç nokta harness doğrulaması için kalıcı olarak durur.
 */
export async function GET(): Promise<Response> {
  await connection()

  return experimental_upgradeWebSocket((ws) => {
    ws.on('message', (data: WebSocketData) => {
      ws.send(`echo:${toText(data)}`)
    })
  })
}
```

⚠️ **`ws` paketi ZORUNLU.** `@vercel/functions` onu _opsiyonel peer_ olarak tanımlar, yani
kendiliğinden kurulmaz. Kurulmazsa `experimental_upgradeWebSocket` çalışma anında
`The "ws" package is required...` fırlatır — ve bu, Task 35'te "Vercel WebSocket çalışmıyor"
diye **yanlış** okunup gereksiz bir Redis pivotunu tetikler. Ayrıca `@types/ws` olmadan
`skipLibCheck` yüzünden `WebSocket` ve `WebSocketData` sessizce `any`'ye düşer; tip kontrolü
sahte olur. Task 19'un `apps/web` bağımlılıklarında `ws@8.21.3` ve `@types/ws@8.18.1` var.

Kurulu `@vercel/functions@3.9.5` imzası (doğrulandı):

```ts
export declare function experimental_upgradeWebSocket(
  handler: (ws: WebSocket) => void | Promise<void>,
  options?: { maxPayload?: number },
): Promise<Response>
export type { WebSocket, RawData as WebSocketData } from 'ws'
```

`RawData` = `Buffer | ArrayBuffer | Buffer[]`, dolayısıyla `String(data)` ikili çerçevede
`[object ArrayBuffer]` verir — `no-base-to-string` bunu yakalar. `toText()` yardımcısı bunun için var.

- [ ] **Step 2: Tip kontrolü**

Run: `pnpm --filter @xox/web typecheck`
Expected: exit code 0.

Tip hatası alırsan `@vercel/functions` sürümünü kontrol et (3.9.5 olmalı) ve
`experimental_upgradeWebSocket`'in dışa aktarıldığını doğrula:
`node -e "import('@vercel/functions').then(m => console.log(Object.keys(m).filter(k => k.includes('WebSocket'))))"`

- [ ] **Step 3: Build**

Run: `pnpm --filter @xox/web build`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/ws
git commit -m "feat(web): WebSocket echo uç noktası — Fluid Compute WS kanıtı"
```

Not: Bu uç nokta **yerelde `next dev` ile çalışmayabilir**; gerçek doğrulama Task 32'de
Vercel preview deploy'una karşı yapılır. Yerelde başarısız olması işi durdurmaz.

---

### Task 22: `apps/mobile` — Expo, native + web hedefi

**Files:**

- Create: `apps/mobile/package.json`, `apps/mobile/tsconfig.json`, `apps/mobile/app.json`, `apps/mobile/babel.config.js`, `apps/mobile/metro.config.js`, `apps/mobile/app/{_layout.tsx,index.tsx}`

- [ ] **Step 1: `apps/mobile/package.json`**

```json
{
  "name": "@xox/mobile",
  "version": "0.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start",
    "web": "expo start --web --port 8081",
    "build": "expo export --platform web --output-dir dist",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "eslint ."
  },
  "dependencies": {
    "@expo/metro-runtime": "~57.0.12",
    "@xox/game-core": "workspace:*",
    "@xox/shared": "workspace:*",
    "@xox/ui-tokens": "workspace:*",
    "expo": "57.0.15",
    "expo-auth-session": "57.0.8",
    "expo-router": "57.0.15",
    "expo-secure-store": "57.0.1",
    "expo-system-ui": "~57.0.2",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "react-native": "0.86.2",
    "react-native-safe-area-context": "5.7.0",
    "react-native-screens": "4.26.2",
    "react-native-web": "0.21.2"
  },
  "devDependencies": {
    "@types/react": "19.2.8",
    "typescript": "6.0.3"
  }
}
```

- [ ] **Step 2: Expo bağımlılıklarını uyumlu sürümlere sabitle**

```bash
pnpm install
pnpm --filter @xox/mobile exec expo install --fix
```

Expected: Expo, SDK 57 ile uyumlu olmayan sürümleri düzeltir. `package.json` değişebilir — bu beklenen davranıştır.

- [ ] **Step 3: `apps/mobile/metro.config.js` — pnpm monorepo çözümlemesi**

```js
/* eslint-disable no-undef, @typescript-eslint/no-require-imports -- Metro bu dosyayı CommonJS olarak require eder. */
// pnpm sembolik bağlantı kullanır; Metro varsayılan olarak workspace kökünü
// izlemez. `watchFolders` + `nodeModulesPaths` olmadan @xox/* paketleri
// "module not found" verir.
//
// NOT: Expo'nun monorepo rehberindeki üçüncü ayar (`disableHierarchicalLookup`)
// yalnızca hoisted (npm/yarn) kurulumlar içindir. pnpm'in izole node_modules
// düzeninde geçişli bağımlılıklar `.pnpm/<paket>/node_modules` altında durur;
// hiyerarşik arama kapatılırsa Metro bunları göremez ve web derlemesi
// "Unable to resolve module expo-font/build/server" ile ölür. Bu yüzden AÇIK
// bırakıldı — bkz. Task 22 doğrulaması.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

module.exports = config
```

- [ ] **Step 4: `apps/mobile/babel.config.js`**

```js
module.exports = function babelConfig(api) {
  api.cache(true)
  return { presets: ['babel-preset-expo'] }
}
```

- [ ] **Step 5: `apps/mobile/app.json`**

```json
{
  "expo": {
    "name": "XOX",
    "slug": "xox",
    "scheme": "xox",
    "version": "0.1.0",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "updates": { "enabled": false },
    "web": { "bundler": "metro", "output": "static" },
    "plugins": ["expo-router", "expo-secure-store"],
    "ios": { "supportsTablet": true, "bundleIdentifier": "com.omerdursun.xox" },
    "android": { "package": "com.omerdursun.xox" }
  }
}
```

- [ ] **Step 6: `apps/mobile/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["DOM", "ES2023"],
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 7: `apps/mobile/app/_layout.tsx` ve `app/index.tsx`**

```tsx
// apps/mobile/app/_layout.tsx
import { Stack } from 'expo-router'

export default function RootLayout(): React.ReactElement {
  return <Stack screenOptions={{ headerShown: false }} />
}
```

```tsx
// apps/mobile/app/index.tsx
import { StyleSheet, Text, View } from 'react-native'
import { colors, fontSize, spacing } from '@xox/ui-tokens'

export default function HomeScreen(): React.ReactElement {
  return (
    <View style={styles.container} testID="mobile-home">
      <Text style={styles.title}>XOX</Text>
      <Text style={styles.tagline}>Arkadaşınla ya da bilgisayara karşı oyna</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.light.bg,
  },
  title: { fontSize: fontSize.display, fontWeight: '700', color: colors.light.text },
  tagline: { fontSize: fontSize.base, color: colors.light.textMuted },
})
```

- [ ] **Step 8: Web hedefini derle — bu, e2e duman testinin dayanağı**

Run: `pnpm --filter @xox/mobile build`
Expected: `dist/` klasörü oluşur, içinde `index.html` bulunur.

Run: `ls apps/mobile/dist/index.html`
Expected: dosya var.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile pnpm-lock.yaml
git commit -m "feat(mobile): Expo 57 iskeleti, monorepo Metro çözümlemesi, web hedefi"
```

---

### Task 23: `apps/e2e` — izole Playwright projesi

**Files:**

- Create: `apps/e2e/package.json`, `apps/e2e/tsconfig.json`, `apps/e2e/playwright.config.ts`, `apps/e2e/fixtures/two-players.ts`, `apps/e2e/tests/smoke.spec.ts`

- [ ] **Step 1: `apps/e2e/package.json`**

```json
{
  "name": "@xox/e2e",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "e2e": "playwright test",
    "test:ui": "playwright test --ui",
    "report": "playwright show-report",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "eslint ."
  },
  "dependencies": {
    "@xox/shared": "workspace:*"
  },
  "devDependencies": {
    "@playwright/test": "1.62.1",
    "@types/node": "24.13.3",
    "@types/ws": "8.18.1",
    "ws": "8.21.3"
  }
}
```

⚠️ İki nokta:

- `@playwright/test` **yalnızca burada** görünür. Başka bir `package.json`'a eklenirse
  CI kontrolü (Task 33) kırılır.
- Script'in adı `test` **değil** `e2e`. Sebebi: `turbo run test` kök seviyede tüm paketlerin
  `test` task'ını koşar; e2e'ye `test` adı verilirse Playwright sunucu ayakta değilken çalışır
  ve kapılar hatalı kırmızı olur. Negatif filtre (`--filter=!@xox/e2e`) ile çözmek kırılgandır —
  paket henüz yokken turbo `No package found` diye hata verir ve `pnpm gates` tamamen ölür.

- [ ] **Step 2: Kur**

```bash
pnpm install
pnpm --filter @xox/e2e exec playwright install --with-deps chromium
```

- [ ] **Step 3: `apps/e2e/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: process.env['CI'] === '1',
  retries: process.env['CI'] === '1' ? 2 : 0,
  // `exactOptionalPropertyTypes` açık: `workers: undefined` yazılamaz. CI dışında
  // anahtarı hiç koymayıp Playwright'ın varsayılanına (yerel çekirdek sayısı) bırakıyoruz.
  ...(process.env['CI'] === '1' ? { workers: 2 } : {}),
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
    // Lead agent bu JSON'u okur; yol docs/board/reports altında olmalı.
    ['json', { outputFile: '../../docs/board/reports/qa-latest.json' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

- [ ] **Step 4: `apps/e2e/fixtures/two-players.ts` — online oyunun tek anlamlı test biçimi**

```ts
import { test as base, type BrowserContext, type Page } from '@playwright/test'

export interface TwoPlayers {
  playerOne: Page
  playerTwo: Page
}

/**
 * İki bağımsız tarayıcı bağlamı = iki ayrı oturum çerezi = iki gerçek oyuncu.
 * Aynı bağlamda iki sekme AÇMAK YETMEZ; oturum paylaşılır ve test yalan söyler.
 */
export const test = base.extend<{ twoPlayers: TwoPlayers }>({
  twoPlayers: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [await browser.newContext(), await browser.newContext()]
    const [playerOne, playerTwo] = await Promise.all(contexts.map(async (c) => c.newPage()))

    if (playerOne === undefined || playerTwo === undefined) {
      throw new Error('İki oyuncu sayfası oluşturulamadı')
    }

    await use({ playerOne, playerTwo })

    await Promise.all(contexts.map(async (c) => c.close()))
  },
})

export { expect } from '@playwright/test'
```

- [ ] **Step 5: `apps/e2e/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 6: `apps/e2e/tests/smoke.spec.ts` — harness doğrulama testleri**

```ts
import { WebSocket, type RawData } from 'ws'
import { expect, test } from '../fixtures/two-players'

test.describe('harness duman testleri', () => {
  test('ana sayfa yüklenir ve başlığı gösterir', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'XOX' })).toBeVisible()
  })

  test('sağlık uç noktası veritabanına erişebiliyor', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
  })

  test("iki oyuncu fixture'ı iki bağımsız oturum verir", async ({ twoPlayers }) => {
    await Promise.all([twoPlayers.playerOne.goto('/'), twoPlayers.playerTwo.goto('/')])
    await expect(twoPlayers.playerOne.getByRole('heading', { name: 'XOX' })).toBeVisible()
    await expect(twoPlayers.playerTwo.getByRole('heading', { name: 'XOX' })).toBeVisible()
  })
})

/** ws `RawData` üç biçimde gelebilir (Buffer | ArrayBuffer | Buffer[]); hepsini UTF-8 metne çevir. */
function toText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  return data.toString('utf8')
}

test.describe('WebSocket kanıtı', () => {
  test('echo uç noktası mesajı geri gönderir', async ({ baseURL }) => {
    const wsUrl = `${String(baseURL).replace(/^http/, 'ws')}/api/ws/echo`

    const reply = await new Promise<string>((resolve, reject) => {
      const socket = new WebSocket(wsUrl)
      const timer = setTimeout(() => {
        socket.close()
        reject(new Error('WebSocket 10 saniyede yanıt vermedi'))
      }, 10_000)

      socket.on('open', () => {
        socket.send('merhaba')
      })
      socket.on('message', (data) => {
        clearTimeout(timer)
        socket.close()
        resolve(toText(data))
      })
      socket.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })

    expect(reply).toBe('echo:merhaba')
  })
})
```

- [ ] **Step 7: Yerelde çalıştır (WS testi başarısız olabilir — beklenen)**

```bash
pnpm --filter @xox/web dev &
sleep 8
E2E_BASE_URL=http://localhost:3000 pnpm --filter @xox/e2e e2e --grep "ana sayfa"
kill %1
```

Expected: `1 passed`

- [ ] **Step 8: Commit**

```bash
git add apps/e2e pnpm-lock.yaml
git commit -m "test(e2e): izole Playwright projesi, iki oyunculu fixture, WS kanıt testi"
```

---

# FAZ 5 — Claude harness

### Task 24: `CLAUDE.md` — lead protokolü

Bu dosya **her zaman context'te** olur. 200 satırı geçmemeli — `xox-memory-curator` bütçesini korur.

**Files:**

- Create: `CLAUDE.md`

- [ ] **Step 1: `CLAUDE.md` yaz**

````markdown
# XOX — Lead Protokolü

Türkçe XOX oyunu. Web (Next.js → Vercel) + mobil (Expo). Online oda, gerçek zamanlı oyun.

## İhlal edilemez kurallar

1. **Playwright yalnızca `apps/e2e` içinde.** `apps/web`, `apps/mobile`, `packages/**` içinde
   `playwright` importu veya bağımlılığı YASAK. E2E gerekiyorsa görevi `xox-qa-e2e` agentına ver.
2. **TypeScript 6.0.3 sabit.** 7.x'e yükseltme — `typescript-eslint` desteklemiyor, lint katmanı ölür.
3. **Secret asla commit edilmez.** Repo PUBLIC. `.env.local` ve türevleri `.gitignore`'da.
4. **Kural mantığı yalnızca `packages/game-core`'da.** `web` ve `mobile` kuralı yeniden yazmaz, delege eder.
5. **Bir subagent "bitti" dediğinde inanma — doğrula.** Definition of Done'ı sen çalıştırırsın.

## Dizin haritası

| Yol                  | İçerik                                                      |
| -------------------- | ----------------------------------------------------------- |
| `packages/game-core` | Kural motoru + minimax AI. Saf TS, bağımlılıksız, %100 test |
| `packages/shared`    | zod şemaları — WS protokolü, oda kodu sözleşmesi            |
| `packages/db`        | Mongoose modelleri, bağlantı, seed/reset                    |
| `packages/ui-tokens` | Web + mobil ortak tasarım tokenları                         |
| `apps/web`           | Next.js 16 App Router                                       |
| `apps/mobile`        | Expo 57 (native + web hedefi)                               |
| `apps/e2e`           | 🎭 Playwright — İZOLE                                       |
| `docs/board/`        | Görev panosu, journal, raporlar — **lead'in hafızası**      |
| `docs/memory/`       | Kararlar, tuzaklar, konvansiyonlar, API sözleşmesi          |
| `.claude/agents/`    | 18 uzman agent                                              |

## Hafıza — context sıkıştıktan sonra buradan devam et

| Dosya                         | Ne zaman okunur                                                   |
| ----------------------------- | ----------------------------------------------------------------- |
| `docs/board/board.json`       | Her dalga başında. Ne kaldı, ne bitti, ne bloklandı               |
| `docs/memory/state.md`        | Oturuma dönerken. İnsan-okur anlık durum                          |
| `docs/memory/gotchas.md`      | **Bir şeyi denemeden önce.** Daha önce başarısız olan yaklaşımlar |
| `docs/memory/decisions.md`    | Mimari bir karar vermeden önce. Neden böyle yapıldı               |
| `docs/memory/conventions.md`  | Kod yazmadan önce. Bu repodaki kalıplar                           |
| `docs/memory/api-contract.md` | REST/WS'e dokunmadan önce                                         |

## Dalga döngüsü

```
board oku → bağımlılığı çözülmüş + çakışma kümesi ayrık görevleri seç (≤4)
  → her göreve worktree (.claude/worktrees/<id>, branch feat/<id>)
  → TEK mesajda paralel dispatch
  → raporları topla, board güncelle, journal'a yaz
  → reviewer (+security/perf) → bulgu varsa aynı agenta fix (max 3 deneme)
  → integrator: sırayla main'e merge → devops: preview deploy
  → qa-e2e: preview'a karşı koş → rapor
  → board+journal+state.md COMMIT + good/wave-N tag
  → her 3 dalgada memory-curator
```

## Definition of Done (lead mekanik doğrular)

```bash
pnpm gates    # typecheck + lint + format:check + test:coverage + knip
```

1. Kırmızı test önce yazıldı, sonra yeşile döndü
2. `pnpm gates` temiz
3. Kapsam eşiği aşıldı (`game-core` ayrıca `pnpm mutation`)
4. `xox-reviewer` bulgusu yok ya da gerekçesi journal'da
5. `docs/board/reports/<task>.md` yazıldı
6. Conventional commit atıldı

## Komutlar

| Komut                        | İş                              |
| ---------------------------- | ------------------------------- |
| `pnpm gates`                 | Tüm statik kapılar              |
| `pnpm dev`                   | Web + mobil geliştirme          |
| `pnpm e2e`                   | Playwright (izole projede)      |
| `pnpm mutation`              | game-core mutasyon testi        |
| `pnpm --filter @xox/db seed` | E2E test kullanıcıları          |
| `/xox-night`                 | Otonom gece koşusu              |
| `/xox-status`                | Board durumunu yenile ve göster |

## Commit kuralı

`<tip>(<kapsam>): <özet>` — kapsam: `web·mobile·e2e·core·shared·db·ui·ci·claude·board·deps·docs·plan·memory·deploy`
````

- [ ] **Step 2: Satır sayısını doğrula**

Run: `wc -l CLAUDE.md`
Expected: 200'den az.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): lead protokolü ve ihlal edilemez kurallar"
```

---

### Task 25: `docs/board` ve `docs/memory` iskeleti

**Files:**

- Create: `docs/board/board.json`, `docs/board/journal.ndjson`, `docs/board/README.md`, `docs/memory/{decisions,gotchas,conventions,api-contract,state}.md`

- [ ] **Step 1: `docs/board/board.json` — başlangıç şeması**

```json
{
  "version": 1,
  "project": "XOX",
  "updatedAt": "2026-08-24T00:00:00.000Z",
  "nightRun": {
    "active": false,
    "deadline": null,
    "wave": 0,
    "consecutiveFailures": 0,
    "tokenBudgetUsedPct": 0
  },
  "tiers": { "P0": "Yürüyen iskelet ve çekirdek", "P1": "Tam döngü", "P2": "Sosyal" },
  "tasks": []
}
```

- [ ] **Step 2: `docs/board/README.md` — şema sözleşmesi**

````markdown
# Görev panosu

`board.json` lead'in tek gerçek kaynağıdır. Context sıkışsa da bu dosya kalır.

## Görev kaydı

```json
{
  "id": "P0-003",
  "title": "Oda oluşturma API uç noktası",
  "tier": "P0",
  "agent": "xox-dev-backend",
  "deps": ["P0-001"],
  "conflictSet": ["apps/web/app/api/rooms/**", "packages/db/src/models/room.ts"],
  "status": "todo",
  "attempts": 0,
  "branch": null,
  "report": null,
  "acceptance": ["POST /api/rooms 201 ve 6 haneli kod döner", "Aynı kod iki kez üretilmez"],
  "blockedReason": null
}
```

| Alan          | Anlamı                                                                              |
| ------------- | ----------------------------------------------------------------------------------- |
| `status`      | `todo` · `in_wave` · `review` · `blocked` · `done` · `failed`                       |
| `deps`        | Bu görev başlamadan `done` olması gereken görev id'leri                             |
| `conflictSet` | Dokunacağı dosya desenleri. **İki görev aynı dalgaya ancak kümeleri ayrıksa girer** |
| `attempts`    | 3'e ulaşırsa `blocked` yapılır ve gece durmadan devam eder                          |

## journal.ndjson

Her satır bağımsız bir JSON olay. Append-only — çakışmaz, asla silinmez.

```json
{
  "ts": "2026-08-25T02:14:03Z",
  "wave": 3,
  "event": "task.done",
  "task": "P0-003",
  "agent": "xox-dev-backend",
  "tests": "8/8"
}
```

Olaylar: `wave.start` · `task.dispatch` · `task.done` · `task.blocked` · `review.finding` ·
`merge.ok` · `merge.revert` · `deploy.preview` · `qa.result` · `decision` · `gotcha` · `danger`
````

- [ ] **Step 3: `docs/memory/gotchas.md` — ilk kayıtlarla başla**

```markdown
# Tuzaklar

> Bir yaklaşımı denemeden ÖNCE burayı oku. Buradaki her satır, birinin zaman kaybetmesiyle öğrenildi.

## 2026-08-24 · TypeScript 7'ye yükseltme lint'i öldürür

`typescript@7.0.2` yayında ama `typescript-eslint@8.67` (canary dahil) peer'ı `typescript <6.1.0`.
TS 7'ye geçmek `strict-type-checked` kural setinin tamamını devre dışı bırakır.
**Yapılacak:** `typescript@6.0.3`'te kal. typescript-eslint TS7 desteği duyurana kadar dokunma.

## 2026-08-24 · npm'deki `gitleaks` paketi sahte

`npm i gitleaks` alakasız bir 1.0.0 paketi kurar. Gerçek araç Go ile yazılmış:
`brew install gitleaks`.

## 2026-08-24 · Auth.js v5 hâlâ beta

`next-auth` latest = 4.24.15 (Pages Router çağı). App Router için `next-auth@beta` (5.0.0-beta.32)
gerekir ve `@auth/mongodb-adapter` ile eşleşir. Sürüm yükseltirken ikisini birlikte yükselt.

## 2026-08-24 · Auth.js adapter'ı mongoose'u değil `mongodb` sürücüsünü ister

İki ayrı bağlantı havuzu açmamak için `getMongoClient()` mongoose'un istemcisini paylaşır
(`connection.getClient()`). Adapter'a yeni `MongoClient` verme — Atlas bağlantı limiti dolar.

## 2026-08-24 · Stryker pnpm monorepo'da iki ek ayar ister

`plugins: ['@stryker-mutator/vitest-runner']` — pnpm plugin'i sembolik bağlar, Stryker'ın
varsayılan `@stryker-mutator/*` glob'u sembolik bağlantı izlemez → `Cannot find TestRunner
plugin "vitest"`. Ve `inPlace: true` — Stryker sandbox'ı yalnızca paket klasörünü kopyalar,
dolayısıyla `vitest.config.ts`'teki `'../../vitest.shared'` importu sandbox içinde çözülemez.
`inPlace` kaynakları yerinde mutasyona uğratıp koşu sonunda geri yükler.

## 2026-08-24 · Çöken Stryker koşusu test sayısını iki katına çıkarır

Koşu çökerse `.stryker-tmp/` geride kalır; vitest oradaki test kopyalarını da toplar ve
`60 test` yerine `146 test` görürsün. `vitest.shared.ts` içindeki `exclude` bunu kapatıyor —
o satırı silme. Elle temizlik: `rm -rf packages/*/.stryker-tmp`.

## 2026-08-24 · `non-nullable-type-assertion-style` ile `no-non-null-assertion` çakışıyor

`moves[index] as number` yazınca birincisi `!` kullan der, ikincisi `!`'i yasaklar. Çıkış yolu
tek satırlık gerekçeli `eslint-disable-next-line`. Kök konfigürasyonu bunun için değiştirme.

## 2026-08-24 · ⚠️ ESLint çözümleyicisi yanlışsa KURALLAR SESSİZCE ÖLÜR — en pahalı ders

`eslint-import-resolver-node` ne `.ts` uzantısını ne de `package.json`'daki `exports` alanını
bilir. Bu repoda tüm paketler yalnızca `"exports": { ".": "./src/index.ts" }` tanımlar ve
`main` yoktur — sonuç: **her `@xox/*` importu çözülemez sayıldı**, `isUnknown: true` olarak
sınıflandı ve `boundaries/dependencies` hiçbir ihlali raporlamadı. Aynı sebeple
`import-x/no-cycle` da `import-x/extensions` varsayılanı `['.js','.mjs','.cjs']` olduğu için
**tek bir TypeScript dosyası okumadı**; yaptığı tek iş `node_modules` içindeki react-native'i
ayrıştırmaya çalışıp stderr'e hata basmaktı.

Yani iki mimari koruma da aylarca "yeşil" görünüp hiçbir şey korumayabilirdi.

**Yapılacak:** `eslint-import-resolver-typescript` kullan; hem `boundaries` hem `import-x` için
ayrı ayrı ayarla (`import/resolver` ve `import-x/resolver` **farklı anahtarlardır**),
`import-x/extensions`'a TS uzantılarını yaz, `import-x/ignore: ['node_modules']` ekle.

**Genel ders:** Bir lint kuralının yazılmış olması çalıştığı anlamına gelmez. Her mimari kural
için hem **ihlal eden** hem **izinli** bir sonda yaz ve ikisini de gör. Bir agent "kanıtladım"
dediğinde de bunu yap — bu kuralın çalıştığı bir kez "kanıtlanmış", kanıt tutmamıştı.

## 2026-08-24 · Expo monorepo rehberi pnpm'de yanlış

`disableHierarchicalLookup = true` hoisted düzen içindir. pnpm'de web build
`Unable to resolve module @expo/metro-runtime` ile ölür. `watchFolders` + `nodeModulesPaths`
yeterli, üçüncü satırı ekleme.

## 2026-08-24 · pnpm sembolik bağlantıları boundaries kuralını sessizce öldürür

`node_modules/@xox/*` pnpm'de semboliktir. `eslint-import-resolver-node` varsayılan olarak
realpath çözmez, dolayısıyla çözülen yol `node_modules` içerir ve `@boundaries/elements`
bunu "harici paket" sayar. Sonuç: `boundaries/dependencies` **hiçbir gerçek `@xox/*`
import'unda ateşlenmez** — kural var görünür, hiçbir şey korumaz.
**Yapılacak:** `settings['import/resolver'].node.preserveSymlinks = false`. Bunu kaldırma.
2026-08-24'te sonda ile hem ihlal (game-core → shared) hem izin (shared → game-core) doğrulandı.

## 2026-08-24 · `projectService: true` + kapsam dışı dosya = kural hiç çalışmaz

`eslint.config.mjs` içinde `projectService: true` varken, hiçbir `tsconfig.json`'ın `include`'una
girmeyen bir `.ts` dosyası **hiçbir kural değerlendirilmeden** "was not found by the project
service" parse hatası verir. Yani kuralı test etmek için attığın sonda, kuralı hiç tetiklemez.
**Yapılacak:** Yeni bir paket açarken `tsconfig.json`'ı `src/` ile aynı commit'te oluştur.

## 2026-08-24 · `eslint-plugin-jsx-a11y@6.10.2` peer'ı ESLint 10'u tanımıyor

Peer aralığı `^3 – ^9`; bizde ESLint 10.9.0 var. `.npmrc`'de `strict-peer-dependencies=false`
olduğu için kurulum ve lint sorunsuz çalışır — uyarı görmezden gelinebilir. Plugin ESLint 10
desteği duyurunca pin güncellenmeli.

## 2026-08-24 · pnpm 11 postinstall script'lerini engeller

`pnpm install` ilk kez koşarken `ERR_PNPM_IGNORED_BUILDS` ile exit 1 verir ve
`pnpm-workspace.yaml`'a `allowBuilds` yer tutucusu yazar. Şu ana kadar iki paket bunu tetikledi:
`lefthook` (git hook'larını postinstall'da kurar — onaylanmazsa tüm pre-commit kapıları sessizce
devre dışı kalır) ve `unrs-resolver` (`eslint-plugin-import-x`'in native resolver'ı — onaylanmazsa
`pnpm install` ve `pnpm lint` hard-fail eder). İkisi de `true`.

## 2026-08-24 · `expo-router@~7.0.0` canary kurar

expo-router artık Expo SDK ile hizalı sürümleniyor: SDK 57 için doğru sürüm `57.0.15`.
npm'de duran `7.0.0-canary-*` sürümleri kararsızdır. `~7.0.0` yazmak canary çeker.

## 2026-08-24 · `ws` kurulmazsa Vercel WebSocket'i yanlışlıkla "bozuk" sanırsın

`@vercel/functions` `ws`'i opsiyonel peer yapar → kurulmaz → `experimental_upgradeWebSocket`
çalışma anında `The "ws" package is required` fırlatır. Bu hata kolayca "Fluid Compute WS
desteklenmiyor" diye okunur ve gereksiz mimari pivotu tetikler.
**Yapılacak:** `apps/web`'e `ws` + `@types/ws` doğrudan bağımlılık olarak ekli kalsın.

## 2026-08-24 · TypeScript 6: `baseUrl` hata veriyor

`TS5101: Option 'baseUrl' is deprecated`. Kaldır; `paths` tsconfig'in kendi konumuna göre çözülür.

## 2026-08-24 · Next 16 `next.config` içinde `eslint` anahtarını reddediyor

`Unrecognized key(s) in object: 'eslint'`. Next 16 build sırasında ESLint'i zaten koşturmuyor,
anahtar gereksiz. `typescript.ignoreBuildErrors` hâlâ geçerli.

## 2026-08-24 · `next-env.d.ts` format kapısını kalıcı kırar

Next onu her build'de çift tırnak + noktalı virgülle yeniden yazar; `prettier --check` hep
kırmızı olur. `.prettierignore`'da — o satırı silme.

## 2026-08-24 · `--filter=!@paket` var olmayan pakette turbo'yu öldürür

Kök script'te olmayan bir pakete negatif filtre yazarsan turbo `No package found with name ...`
ile hata verir — yani `pnpm gates` paket oluşturulana kadar tamamen çalışmaz.
**Yapılacak:** Negatif filtre kullanma. e2e paketinin task adını `test` yerine `e2e` yap;
`turbo run test` onu hiç görmez.

## 2026-08-24 · Mongoose model yeniden kaydı: cast `??` fallback'ini öldürür

`(models['User'] as Model<UserDoc>) ?? model(...)` yazarsan cast `undefined`'ı **??'den önce**
kaldırır, fallback ölü koda döner (`no-unnecessary-condition` bunu yakalar) ve HMR/yeniden
içe aktarmada `OverwriteModelError` alırsın.
**Yapılacak:** `as Model<UserDoc> | undefined` yaz.

## 2026-08-24 · `noUncheckedIndexedAccess` + string indeksleme

`ALPHABET[i]` tipi `string | undefined` döner; `restrict-plus-operands` reddeder ve `!`
`strictTypeChecked` altında yasak. `.charAt(i)` kullan — total fonksiyon, aynı sonuç.

## 2026-08-24 · `import type { X } from 'mongodb'` bile paketi bağımlılık yapar

pnpm izole linker'da `mongodb` yalnızca `.pnpm/node_modules` altındadır; `tsc` `TS2307` verir.
`mongoose@9.9.3`'ün çözdüğü sürümle aynısını (`7.5.0`) doğrudan bağımlılık olarak ekle —
store'da tek kopya kalır.

## 2026-08-24 · `turbo run test` Playwright'ı da çalıştırır

`apps/e2e` içindeki `test` scripti `playwright test`tir. Kök `pnpm test` bunu filtrelemezse
sunucu ayakta değilken Playwright koşar ve kapılar hatalı kırmızı olur.
**Yapılacak:** kök scriptlerde `--filter=!@xox/e2e` kalsın. E2E ayrı çalışır: `pnpm e2e`.

## 2026-08-24 · pnpm + Expo Metro çözümlemesi

pnpm sembolik bağlantı kullanır; Metro varsayılan olarak workspace kökünü izlemez.
`metro.config.js` içinde `watchFolders` + `nodeModulesPaths` + `disableHierarchicalLookup`
ayarlanmazsa `@xox/*` paketleri "module not found" verir.
```

- [ ] **Step 4: `docs/memory/decisions.md`**

```markdown
# Mimari kararlar

> Format: tarih · karar · bağlam · gerekçe · reddedilen alternatifler

## 2026-08-24 · Instance-arası WS yayını MongoDB Change Streams ile

**Bağlam:** İki oyuncu farklı Fluid Compute instance'ına düşebilir; bir instance'taki
WebSocket handler diğerine doğrudan mesaj gönderemez.
**Karar:** Her WS bağlantısı, odanın `rooms` dokümanı üzerinde koda filtreli bir change stream'e
abone olur. Sunucu otoriterdir; hamle önce dokümana yazılır, yayın stream'den gelir.
**Reddedilenler:** Upstash Redis pub/sub (ek vendor + maliyet) · sticky routing (Vercel garanti etmiyor).
**Yedek:** Change stream gecikmesi kabul edilemezse Redis pub/sub'a geçilir. Kararı Dalga 0 verir.

## 2026-08-24 · Workspace paketleri derlenmez, kaynak dışa verilir

**Karar:** `packages/*` `exports: { ".": "./src/index.ts" }` kullanır; Next `transpilePackages`,
Metro workspace çözümlemesi ile tüketir.
**Gerekçe:** Gece koşusunda paralel agentların build zincirini beklemesini ortadan kaldırır.
**Reddedilen:** tsup/tsc ile önden derleme — her değişiklikte `^build` bariyeri.

## 2026-08-24 · Lead ana oturumda, subagent değil

**Karar:** Orkestrasyon ana oturumda kalır; 18 agent yalnızca dispatch edilir.
**Gerekçe:** İç içe subagent dispatch'i kırılgan; lead worktree/dalga/board state'ini kaybetmemeli.
```

- [ ] **Step 5: `docs/memory/conventions.md`**

```markdown
# Kod konvansiyonları

## Genel

- Türkçe yorum ve metin; İngilizce tanımlayıcı (değişken/fonksiyon/tip adı).
- Arayüz metinleri `apps/web/messages/tr.ts` ve mobilde karşılığı — bileşene gömme.
- Dışa açık her fonksiyonun dönüş tipi yazılır (`explicit-module-boundary-types`).
- `type` importları `import { type X }` biçiminde satır içi.

## Test

- TDD zorunlu: önce kırmızı test, sonra minimum implementasyon.
- Test adları Türkçe ve davranış anlatır: `'dolu hücrede InvalidMoveError atar'`.
- Rastgelelik enjekte edilir (`rng: () => number = Math.random`) — test deterministik olsun.
- `game-core` savunmacı dal içermez; indeks güvenliği `cellAt` gibi tek noktada daraltılır.

## Dosya boyutu

- 250 satırı geçen kaynak dosya bölünmeye adaydır. Sorumluluğa göre böl, katmana göre değil.

## Hata yönetimi

- Alan hataları için isimli sınıf (`InvalidMoveError`), string throw yok.
- API route'ları hatayı yakalayıp yapılandırılmış JSON döner, stack sızdırmaz.
```

- [ ] **Step 6: `docs/memory/api-contract.md` ve `state.md` tohumları**

```markdown
# API sözleşmesi (yaşayan doküman)

Kaynak şemalar: `packages/shared/src/ws-protocol.ts`. Bu doküman onu **anlatır**, tekrar tanımlamaz.

## REST

| Yöntem | Yol           | Açıklama                                                                 |
| ------ | ------------- | ------------------------------------------------------------------------ |
| GET    | `/api/health` | Veritabanı erişilebilirliği. 200 `{ok:true,db}` / 503 `{ok:false,error}` |

## WebSocket

| Yol            | Açıklama                                 |
| -------------- | ---------------------------------------- |
| `/api/ws/echo` | Harness kanıt uç noktası. `x` → `echo:x` |

Oyun uç noktaları Dalga 0+ ile eklenecek; her ekleme bu tabloyu günceller.
```

```markdown
# Anlık durum

Otomatik üretilir — elle düzenleme, `/xox-status` çalıştır.

**Son güncelleme:** henüz koşu yapılmadı
**Faz:** harness kurulumu
**Aktif dalga:** —
```

- [ ] **Step 7: journal'ı başlat ve commit**

```bash
: > docs/board/journal.ndjson
git add docs/board docs/memory
git commit -m "feat(board): görev panosu ve kendini güncelleyen hafıza iskeleti"
```

---

### Task 26: `.claude/settings.json` — tam yetki + hook kayıtları

**Files:**

- Create: `.claude/settings.json`

- [ ] **Step 1: `.claude/settings.json`**

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "defaultMode": "bypassPermissions",
    "additionalDirectories": ["./.claude/worktrees"]
  },
  "env": {
    "MONGODB_DB": "xox_dev",
    "DO_NOT_TRACK": "1"
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh" }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/pre-compact.sh" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/playwright-firewall.sh"
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/playwright-firewall.sh"
          },
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/destructive-snapshot.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/track-touched-files.sh"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/subagent-stop.sh" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/night-continue.sh" }
        ]
      }
    ]
  }
}
```

`bypassPermissions` = izin istemi yok = gece oturumu durmaz. Yıkıcı işlemler engellenmez;
`destructive-snapshot.sh` onları **geri alınabilir** yapar.

- [ ] **Step 2: Commit**

```bash
git add .claude/settings.json
git commit -m "feat(claude): tam yetki izin politikası ve hook kayıtları"
```

---

### Task 27: Hook script'leri

**Files:**

- Create: `.claude/hooks/{session-start,pre-compact,playwright-firewall,destructive-snapshot,track-touched-files,subagent-stop,night-continue}.sh`

- [ ] **Step 1: `session-start.sh` — compact sonrası lead'i yeniden konumlandırır**

```bash
#!/usr/bin/env bash
# Oturum açılışında / resume'da / COMPACT SONRASINDA board özetini context'e enjekte eder.
# Bu, uzun gece koşusunda context kaybına karşı birinci savunmadır.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

BOARD="docs/board/board.json"
[[ -f $BOARD ]] || exit 0

summary=$(node -e '
const b = require("./docs/board/board.json");
const by = (s) => b.tasks.filter((t) => t.status === s);
const line = (t) => `  ${t.id} [${t.tier}] ${t.title} → ${t.agent}`;
const out = [];
out.push(`GECE KOŞUSU: ${b.nightRun.active ? "AKTİF, dalga " + b.nightRun.wave : "kapalı"}`);
out.push(`Görevler: ${by("done").length} bitti · ${by("todo").length} bekliyor · ${by("blocked").length} bloklu · ${by("failed").length} başarısız`);
const blocked = by("blocked");
if (blocked.length) { out.push("BLOKLU:"); blocked.forEach((t) => out.push(line(t) + ` — ${t.blockedReason ?? "sebep yok"}`)); }
const ready = b.tasks.filter((t) => t.status === "todo" && t.deps.every((d) => b.tasks.find((x) => x.id === d)?.status === "done"));
if (ready.length) { out.push("HAZIR (bağımlılığı çözülmüş):"); ready.slice(0, 8).forEach((t) => out.push(line(t))); }
console.log(out.join("\n"));
' 2>/dev/null || echo "board.json okunamadı")

recent=$(tail -n 5 docs/board/journal.ndjson 2>/dev/null || true)

cat <<JSON
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":$(node -e '
const s = process.argv[1], r = process.argv[2];
console.log(JSON.stringify(
  "## XOX board durumu (otomatik enjekte)\n" + s +
  "\n\nSon 5 olay:\n" + (r || "(yok)") +
  "\n\nHafıza dosyaları: docs/memory/{state,gotchas,decisions,conventions,api-contract}.md" +
  "\nBir yaklaşımı denemeden ÖNCE gotchas.md oku."
));' "$summary" "$recent")}}
JSON
```

- [ ] **Step 2: `pre-compact.sh` — sıkışmadan önce durumu diske yaz**

```bash
#!/usr/bin/env bash
# Context sıkışmadan hemen önce çalışır. Kaybolacak çalışma belleğini state.md'ye sabitler.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

[[ -f docs/board/board.json ]] || exit 0

node -e '
const fs = require("node:fs");
const b = require("./docs/board/board.json");
const count = (s) => b.tasks.filter((t) => t.status === s).length;
const rows = b.tasks
  .filter((t) => t.status !== "done")
  .map((t) => `| ${t.id} | ${t.tier} | ${t.title} | ${t.status} | ${t.agent} | ${t.blockedReason ?? ""} |`)
  .join("\n");
fs.writeFileSync("docs/memory/state.md", `# Anlık durum

Otomatik üretilir — elle düzenleme, \`/xox-status\` çalıştır.

**Son güncelleme:** ${new Date().toISOString()}
**Gece koşusu:** ${b.nightRun.active ? "AKTİF, dalga " + b.nightRun.wave : "kapalı"}
**Sayım:** ${count("done")} bitti · ${count("todo")} bekliyor · ${count("in_wave")} dalgada · ${count("blocked")} bloklu

| id | katman | başlık | durum | agent | blok sebebi |
|---|---|---|---|---|---|
${rows || "| — | | tüm görevler bitti | | | |"}
`);
'

echo "state.md güncellendi. Sıkıştırmadan sonra docs/board/board.json ve docs/memory/state.md dosyalarını oku." >&2
exit 0
```

- [ ] **Step 3: `playwright-firewall.sh` — üç katmanlı savunmanın birincisi**

```bash
#!/usr/bin/env bash
# Playwright'ın ana uygulama paketlerine sızmasını engeller.
set -euo pipefail
input=$(cat)

path=$(node -e 'const i=JSON.parse(require("node:fs").readFileSync(0,"utf8"));const t=i.tool_input??{};console.log(t.file_path??"")' <<<"$input")
content=$(node -e 'const i=JSON.parse(require("node:fs").readFileSync(0,"utf8"));const t=i.tool_input??{};console.log([t.content,t.new_string,t.command].filter(Boolean).join("\n"))' <<<"$input")

deny() {
  cat <<JSON
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"$1"}}
JSON
  exit 0
}

# Ana uygulama yollarında playwright içeriği
if [[ $path == apps/web/* || $path == apps/mobile/* || $path == packages/* ]] \
   && grep -qiE '(@playwright/test|from .playwright|require\(.playwright)' <<<"$content"; then
  deny "Playwright YALNIZCA apps/e2e içinde kullanılır. Bu görevi xox-qa-e2e agentına devret."
fi

# Ana uygulamalara playwright kurulumu
if grep -qE 'pnpm (add|install|i)[^|;]*(--filter[= ]@xox/(web|mobile)|--filter[= ]@xox/(game-core|shared|db|ui-tokens))[^|;]*playwright' <<<"$content" \
   || grep -qE 'pnpm (add|install|i) +-w[^|;]*playwright' <<<"$content"; then
  deny "Playwright ana projeye VEYA workspace köküne kurulamaz. Yalnızca: pnpm add -D --filter @xox/e2e"
fi

exit 0
```

- [ ] **Step 4: `destructive-snapshot.sh` — yetkiyi kısmaz, geri alınabilir yapar**

```bash
#!/usr/bin/env bash
# Yıkıcı bir komuttan ÖNCE kurtarma noktası bırakır. Komutu ENGELLEMEZ.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"
input=$(cat)

cmd=$(node -e 'const i=JSON.parse(require("node:fs").readFileSync(0,"utf8"));console.log(i.tool_input?.command??"")' <<<"$input")

if grep -qE '(rm +-[a-z]*[rf]|dropDatabase|git +reset +--hard|git +clean +-[a-z]*f|git +push +.*--force|git +branch +-D|gh +repo +delete)' <<<"$cmd"; then
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  git tag -f "rescue/$ts" >/dev/null 2>&1 || true
  git stash create >/dev/null 2>&1 || true
  mkdir -p docs/board
  printf '%s\t%s\n' "$ts" "$cmd" >> docs/board/danger.log
  echo "⚠️  Yıkıcı komut tespit edildi. Kurtarma noktası: rescue/$ts (danger.log'a yazıldı)." >&2
fi

exit 0
```

- [ ] **Step 5: `track-touched-files.sh` — çakışma tespiti için**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"
input=$(cat)

path=$(node -e 'const i=JSON.parse(require("node:fs").readFileSync(0,"utf8"));console.log(i.tool_input?.file_path??"")' <<<"$input")
[[ -n $path ]] || exit 0

mkdir -p docs/board
printf '{"ts":"%s","event":"file.touched","path":"%s"}\n' "$(date -u +%FT%TZ)" "${path#"$PWD/"}" \
  >> docs/board/journal.ndjson
exit 0
```

- [ ] **Step 6: `subagent-stop.sh` — rapor yazıldı mı doğrular**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"
mkdir -p docs/board docs/board/reports

printf '{"ts":"%s","event":"subagent.stop"}\n' "$(date -u +%FT%TZ)" >> docs/board/journal.ndjson

# Son 10 dakikada rapor yazılmamışsa lead'i uyar (engellemez).
recent=$(find docs/board/reports -name '*.md' -newermt '-10 minutes' 2>/dev/null | wc -l | tr -d ' ')
if [[ $recent == 0 ]]; then
  echo "Uyarı: son 10 dakikada docs/board/reports altına rapor yazılmadı. Subagent raporunu sen kaydet ve board.json'ı güncelle." >&2
fi
exit 0
```

- [ ] **Step 7: `night-continue.sh` — oturumun gece bitmesini engeller**

```bash
#!/usr/bin/env bash
# Gece koşusu aktif ve iş varsa duruşu BLOKLAR. Üç koruma: deadline, dalga tavanı,
# ardışık başarısızlık. Bunlardan biri tetiklenirse durmaya izin verir.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"

FLAG="docs/board/.night-run-active"
[[ -f $FLAG ]] || exit 0
[[ -f docs/board/board.json ]] || exit 0

node -e '
const fs = require("node:fs");
const flag = JSON.parse(fs.readFileSync("docs/board/.night-run-active", "utf8"));
const b = JSON.parse(fs.readFileSync("docs/board/board.json", "utf8"));

const stopNow = (reason) => {
  fs.rmSync("docs/board/.night-run-active", { force: true });
  console.log(JSON.stringify({ systemMessage: `Gece koşusu sonlandı: ${reason}. xox-reporter ile sabah raporunu üret.` }));
  process.exit(0);
};

if (Date.now() > Date.parse(flag.deadline)) stopNow("deadline doldu");
if (b.nightRun.wave >= (flag.maxWaves ?? 40)) stopNow("dalga tavanına ulaşıldı");
if (b.nightRun.consecutiveFailures >= 3) stopNow("üç ardışık dalga başarısız");
if ((b.nightRun.tokenBudgetUsedPct ?? 0) >= 95) stopNow("token bütçesi %95");

const actionable = b.tasks.filter(
  (t) => ["todo", "in_wave", "review"].includes(t.status) &&
         t.deps.every((d) => b.tasks.find((x) => x.id === d)?.status === "done"),
);

if (actionable.length === 0) stopNow("işlenebilir görev kalmadı");

console.log(JSON.stringify({
  decision: "block",
  reason: `Gece koşusu aktif (dalga ${b.nightRun.wave}, deadline ${flag.deadline}). ` +
    `${actionable.length} işlenebilir görev var: ${actionable.slice(0, 4).map((t) => t.id).join(", ")}. ` +
    `CLAUDE.md dalga döngüsüne dön: board oku → çakışmayan görevleri seç → paralel dispatch → ` +
    `review → merge → deploy → e2e → board commit.`,
}));
'
```

- [ ] **Step 8: Çalıştırma izni ver ve sözdizimini doğrula**

```bash
chmod +x .claude/hooks/*.sh
for f in .claude/hooks/*.sh; do bash -n "$f" && echo "OK $f"; done
```

Expected: her dosya için `OK`.

- [ ] **Step 9: Playwright duvarını KANITLA**

```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"apps/web/lib/x.ts","content":"import { test } from \"@playwright/test\""}}' \
  | .claude/hooks/playwright-firewall.sh
```

Expected: `"permissionDecision":"deny"` içeren JSON.

```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"apps/e2e/tests/x.spec.ts","content":"import { test } from \"@playwright/test\""}}' \
  | .claude/hooks/playwright-firewall.sh
```

Expected: çıktı yok (izin verildi).

- [ ] **Step 10: Commit**

```bash
git add .claude/hooks
git commit -m "feat(claude): hook katmanı — hafıza enjeksiyonu, playwright duvarı, gece devamlılığı"
```

---

### Task 28: Analiz katmanı agentları

Her agent dosyası `.claude/agents/<ad>.md`. Ortak rapor sözleşmesi her prompt'ta tekrarlanır —
agent başka dosya okumadan ne üreteceğini bilmeli.

**Files:**

- Create: `.claude/agents/{xox-analyst,xox-architect,xox-planner}.md`

- [ ] **Step 1: `.claude/agents/xox-analyst.md`**

````markdown
---
name: xox-analyst
description: XOX ürün gereksinimlerini kullanıcı hikayelerine, kabul kriterlerine ve edge case listesine çevirir. Spec üretir, kod yazmaz.
tools: Read, Grep, Glob, Write, Bash
model: opus
---

Sen XOX projesinin iş analistisin. Kod yazmazsın; **ne** yapılacağını kesinleştirirsin.

## Girdi

Lead sana bir özellik alanı ve hedef katman (P0/P1/P2) verir.

## Önce oku

`docs/memory/gotchas.md` · `docs/memory/decisions.md` · `docs/superpowers/specs/`

## Üret

`docs/superpowers/specs/<tarih>-<konu>-spec.md`:

1. **Kullanıcı hikayeleri** — "… olarak … istiyorum, çünkü …"
2. **Kabul kriterleri** — her biri gözlemlenebilir ve test edilebilir. "Kullanıcı dostu olmalı" gibi
   ölçülemez ifade YASAK.
3. **Edge case listesi** — rakip ortada ayrılırsa · aynı kullanıcı iki sekmede katılırsa ·
   ağ kopup sıra karşı taraftayken dönerse · oda kodu çakışırsa · süre dolarsa
4. **Kapsam dışı** — bilinçli olarak yapılmayacaklar
5. **Açık sorular** — cevabı olmayanları `blocked` olarak işaretle, tahmin etme

## Kurallar

- Uygulama tek dilli Türkçe. Metin önerirken Türkçesini yaz.
- Kapsamı büyütme. Lead ne istediyse onu netleştir.
- Belirsizlik varsa iki yorumu da yaz ve hangisini varsaydığını belirt.

## Rapor (zorunlu — `docs/board/reports/<task-id>.md`)

```yaml
task: <task-id>
status: done | blocked
summary: <2-3 cümle>
files_changed: [...]
decisions: [{ karar, gerekçe, reddedilen_alternatif }]
gotchas: [...]
blocked_reason: <varsa>
next_suggestions: [...]
```
````

````

- [ ] **Step 2: `.claude/agents/xox-architect.md`**

```markdown
---
name: xox-architect
description: Spec'i teknik tasarıma, ADR'lere ve bağımlılık grafiğine çevirir; dalga bölümlemesi önerir. Kod yazmaz.
tools: Read, Grep, Glob, Write, Bash, WebFetch
model: opus
---

Sen XOX projesinin sistem mimarısın. Spec'i **nasıl** yapılacağına çevirirsin.

## Önce oku
`docs/superpowers/specs/` (ilgili spec) · `docs/memory/decisions.md` · `docs/memory/api-contract.md` ·
`docs/memory/gotchas.md` · `CLAUDE.md`

## Üret
1. **Teknik tasarım** — hangi paket/dosya, hangi arayüz, hangi veri akışı
2. **ADR** — her önemli karar `docs/adr/NNNN-<konu>.md`: bağlam · karar · gerekçe · **reddedilen
   alternatifler** · sonuçlar
3. **Bağımlılık grafiği** — hangi iş hangi işten sonra gelmeli
4. **Dalga bölümlemesi** — hangi işler aynı anda paralel gidebilir
5. **Çakışma kümeleri** — her iş için dokunulacak dosya desenleri

## Değişmezler (ihlal edecek tasarım önerme)
- Kural mantığı yalnız `packages/game-core`; `web`/`mobile` kuralı yeniden yazmaz
- Bağımlılık yönü: `game-core ← shared ← db ← web` · `mobile → shared, game-core, ui-tokens`
- `apps/e2e` uygulama koduna import edemez
- Sunucu otoriter: hamle doğrulaması istemcide **de** olabilir ama karar sunucudadır

## Belirsizlikte
Bir API'nin davranışından emin değilsen tahmin etme — WebFetch ile resmi dokümanı doğrula,
bulduğunu `gotchas.md`'ye yaz.

## Rapor
xox-analyst ile aynı YAML formatı, `docs/board/reports/<task-id>.md`.
````

- [ ] **Step 3: `.claude/agents/xox-planner.md`**

```markdown
---
name: xox-planner
description: Mimari tasarımı atomik, paralel-güvenli görev kartlarına böler ve board.json'ı üretir/günceller.
tools: Read, Grep, Glob, Write, Edit, Bash
model: opus
---

Sen XOX projesinin plan yazarısın. Çıktın doğrudan `docs/board/board.json`'a girer.

## Önce oku

`docs/adr/` · ilgili spec · `docs/board/board.json` (mevcut görevler) · `docs/board/README.md` (şema)

## Görev kartı kuralları

- **Atomik:** tek bir agent, tek oturumda bitirebilmeli. 4 saatlik iş = birden fazla kart.
- **Çakışma kümesi zorunlu:** `conflictSet` dokunulacak dosya desenlerini listeler.
  İki kart aynı dalgaya ancak kümeleri **ayrıksa** girer. Şüphedeysen kesişiyor say.
- **Kabul kriteri zorunlu:** `acceptance` maddeleri gözlemlenebilir olmalı.
- **Agent ataması zorunlu:** kartın hangi uzman agenta gideceğini sen belirlersin.
- **Katman:** P0 (yürüyen iskelet/çekirdek) · P1 (tam döngü) · P2 (sosyal).

## board.json'a yazarken

Mevcut görevleri **silme**; yalnızca ekle veya güncelle. `status` alanlarına dokunma —
onlar lead'in. `id` biçimi `<tier>-<3 hane>`, örn. `P0-007`.

## Kendini kontrol et

Kartları yazdıktan sonra: her `deps` referansı var olan bir id mi? Aynı dalgada
çakışan `conflictSet` var mı? Her kartın `acceptance`'ı test edilebilir mi?

## Rapor

Aynı YAML formatı. `summary` alanında kaç kart eklendiğini ve önerilen ilk dalgayı yaz.
```

- [ ] **Step 4: Doğrula ve commit**

```bash
ls .claude/agents/ | wc -l    # 3 olmalı
git add .claude/agents
git commit -m "feat(claude): analiz katmanı agentları — analyst, architect, planner"
```

---

### Task 29: Geliştirme katmanı agentları

**Files:**

- Create: `.claude/agents/{xox-dev-core,xox-dev-backend,xox-dev-realtime,xox-dev-web,xox-dev-mobile}.md`

- [ ] **Step 1: `.claude/agents/xox-dev-core.md`**

````markdown
---
name: xox-dev-core
description: packages/game-core içinde XOX kural motoru ve minimax AI geliştirir. TDD zorunlu, %100 kapsam, mutasyon eşiği.
tools: Read, Write, Edit, Grep, Glob, Bash
model: opus
---

Sen `packages/game-core` sahibisin. Bu paket saf TypeScript'tir: I/O yok, framework yok,
bağımlılık yok. Web ve mobil aynı kodu kullanır — buradaki bir hata her yerde hatadır.

## Yazma alanın

YALNIZCA `packages/game-core/**`. Başka pakete dokunma; gerekiyorsa raporda belirt.

## Önce oku

`docs/memory/conventions.md` · `docs/memory/gotchas.md` · mevcut `src/` dosyaları

## TDD — pazarlık yok

1. Başarısız testi yaz
2. **Çalıştır ve kırmızı olduğunu gör** (`pnpm --filter @xox/game-core test`)
3. Geçirecek minimum kodu yaz
4. Yeşile döndüğünü gör
5. Refactor, testler hâlâ yeşil

Adım 2'yi atlarsan testin gerçekten bir şey doğruladığını bilemezsin.

## Kalite eşikleri (build kırılır)

- Kapsam %100 (lines/branches/functions/statements)
- `pnpm --filter @xox/game-core mutation` skoru ≥ %90
- Savunmacı, erişilemez dal yazma — indeks güvenliğini `cellAt` gibi tek noktada daralt

## Bitirmeden önce

```bash
pnpm --filter @xox/game-core test:coverage && pnpm --filter @xox/game-core typecheck && pnpm lint packages/game-core
```
````

## Rapor (`docs/board/reports/<task-id>.md`)

```yaml
task: <task-id>
status: done | blocked | failed
summary: <2-3 cümle>
files_changed: [...]
tests: { added: n, passing: n, coverage: '%', mutation: '%' }
decisions: [{ karar, gerekçe, reddedilen_alternatif }]
gotchas: [...]
blocked_reason: <varsa>
next_suggestions: [...]
```

````

- [ ] **Step 2: `.claude/agents/xox-dev-backend.md`**

```markdown
---
name: xox-dev-backend
description: Next.js API route'ları, oda yaşam döngüsü, Mongoose modelleri ve Auth.js sunucu tarafını geliştirir.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

Sen XOX'un sunucu tarafı geliştiricisisin: `apps/web/app/api/**` ve `packages/db/**`.

## Yazma alanın
`apps/web/app/api/**` · `apps/web/lib/**` (sunucu yardımcıları) · `packages/db/**`
UI dosyalarına (`apps/web/app/(routes)`, bileşenler) dokunma — o `xox-dev-web`'in alanı.

## Önce oku
`docs/memory/api-contract.md` · `docs/memory/gotchas.md` · `packages/shared/src/ws-protocol.ts`

## Değişmezler
- **Sunucu otoriterdir.** Hamle geçerliliğini `@xox/game-core` ile sunucuda doğrula; istemciye güvenme.
- **Şema tek kaynaktan.** Girdi doğrulaması `@xox/shared` zod şemalarıyla. Elle `if (typeof x === ...)` yazma.
- **Bağlantı paylaşımı.** Mongo'ya `connectDb()` ile bağlan; Auth.js adapter'ı için `getMongoClient()`
  kullan — ikinci havuz açma.
- **Hata sızdırma.** Yakala, yapılandırılmış JSON dön, stack trace'i istemciye verme.
- **NoSQL injection.** Kullanıcı girdisini doğrudan sorgu nesnesine koyma; zod'dan geçmiş değeri kullan.

## TDD
API route'ları için `route.test.ts` yaz, `@xox/db`'yi `vi.mock` ile izole et.
Entegrasyon gerekiyorsa `mongodb-memory-server` kullan — gerçek Atlas'a test yazma.

## Bitirmeden önce
```bash
pnpm --filter @xox/web test && pnpm --filter @xox/web typecheck && pnpm lint apps/web packages/db
````

## Rapor

xox-dev-core ile aynı YAML formatı.

````

- [ ] **Step 3: `.claude/agents/xox-dev-realtime.md`**

```markdown
---
name: xox-dev-realtime
description: WebSocket protokolü, MongoDB change stream yayını, reconnect ve state resync geliştirir. Projenin en riskli katmanı.
tools: Read, Write, Edit, Grep, Glob, Bash, WebFetch
model: opus
---

Sen XOX'un gerçek zamanlı katmanının sahibisin. Bu projenin en kırılgan parçası — burada
verdiğin her karar `docs/memory/decisions.md`'ye yazılmalı.

## Yazma alanın
`apps/web/app/api/ws/**` · `apps/web/app/api/rooms/**/ws/**` · `packages/shared/src/ws-protocol.ts` ·
istemci WS bağlantı yardımcıları (`apps/web/lib/realtime/**`)

## Önce oku
`docs/memory/decisions.md` (change stream kararı) · `docs/memory/gotchas.md` ·
`docs/memory/api-contract.md`

## Mimari değişmezler
- **Instance-arası yayın MongoDB Change Streams ile.** İki oyuncu farklı Fluid instance'ına düşebilir.
  Hamle önce `rooms` dokümanına yazılır; karşı tarafa yayın change stream'den gelir.
- **Sunucu otoriter, istemci iyimser.** İstemci hamleyi hemen çizer; sunucu `move:rejected`
  dönerse `version` numarasına bakarak geri alır.
- **Monotonik `version`.** Her state yazımında artar. İstemci eski sürümlü mesajı yok sayar.
- **Heartbeat.** `WS_HEARTBEAT_MS` aralığıyla ping/pong; yanıt yoksa yeniden bağlan.
- **Üstel geri çekilme.** `WS_RECONNECT_BASE_MS`'ten `WS_RECONNECT_MAX_MS`'e.
- **Yetkilendirme.** WS upgrade'de oturum doğrulanır; oturumsuz bağlantı reddedilir.

## API belirsizliğinde
`experimental_upgradeWebSocket` deneysel bir API. Davranışından emin değilsen **WebFetch ile
`vercel.com/docs/functions/websockets` sayfasını doğrula**, ezberden yazma. Öğrendiğini
`gotchas.md`'ye ekle.

## Başarısızlık protokolü
Change stream yaklaşımı çalışmazsa (gecikme > 2sn veya bağlantı limiti) **kendi başına Redis'e
geçme** — `blocked` işaretle, ölçtüğün sayıları raporla, kararı lead versin.

## Rapor
xox-dev-core ile aynı YAML formatı. `decisions` ve `gotchas` alanlarını mutlaka doldur.
````

- [ ] **Step 4: `.claude/agents/xox-dev-web.md`**

````markdown
---
name: xox-dev-web
description: Next.js App Router arayüzünü geliştirir — sayfalar, bileşenler, Tailwind, erişilebilirlik.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

Sen XOX'un web arayüzü geliştiricisisin.

## Yazma alanın

`apps/web/app/**` (⛔ `app/api/**` HARİÇ — orası backend'in) · `apps/web/components/**` ·
`apps/web/messages/tr.ts` · `apps/web/app/globals.css`

## Önce oku

`docs/memory/conventions.md` · `packages/ui-tokens/src/` · `apps/web/messages/tr.ts`

## Değişmezler

- **Metin gömme.** Her görünür string `messages/tr.ts` içinde bir anahtar olarak yaşar.
- **Kural mantığı yazma.** Kazanan tespiti, geçerli hamle, AI — hepsi `@xox/game-core`'dan gelir.
- **RSC varsayılan.** `'use client'` yalnızca gerçekten etkileşim/state/effect gerektiğinde.
  Sunucudan veri çekmeyi client component'e taşıma.
- **Erişilebilirlik.** Tahta hücreleri `<button>`, `aria-label` ile konumu ve içeriği bildirilir
  ("3. satır 2. sütun, boş"). Klavyeyle oynanabilir olmalı. `jsx-a11y` kuralları hata seviyesinde.
- **Tasarım tokenları.** Renk/aralık değerlerini elle yazma — `@xox/ui-tokens` veya
  `globals.css` içindeki CSS değişkenleri.
- **Tailwind v4.** `tailwind.config.js` YOK; tema `globals.css` içinde `@theme` bloğunda.

## Test

Bileşen davranışı için Vitest + React Testing Library. Kullanıcının gördüğüyle sorgula
(`getByRole`, `getByLabelText`) — `data-testid`'yi son çare olarak kullan.

## Bitirmeden önce

```bash
pnpm --filter @xox/web test && pnpm --filter @xox/web typecheck && pnpm --filter @xox/web build && pnpm lint apps/web
```
````

## Rapor

xox-dev-core ile aynı YAML formatı.

````

- [ ] **Step 5: `.claude/agents/xox-dev-mobile.md`**

```markdown
---
name: xox-dev-mobile
description: Expo/React Native ekranlarını, auth köprüsü istemcisini ve WS istemcisini geliştirir. Web hedefinin de derlenmesinden sorumlu.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

Sen XOX'un mobil geliştiricisisin. `apps/mobile/**` senin alanın.

## Kritik kısıt — nasıl doğrulanıyorsun
Expo Go'yu gerçek cihazda kimse süremez. Senin işin **iki şekilde** doğrulanır:
1. `pnpm --filter @xox/mobile build` (react-native-web hedefi) — bu kırılırsa işin bitmemiştir
2. `apps/e2e` bu web çıktısına karşı duman testi koşar

Bu yüzden **web hedefinde çalışmayan API kullanma.** Native-only bir şey gerekiyorsa
`Platform.select` ile web'e güvenli bir karşılık ver.

## Önce oku
`docs/memory/gotchas.md` (Metro/pnpm tuzağı) · `packages/ui-tokens/src/` · `apps/web/messages/tr.ts`

## Değişmezler
- **Kural mantığı yazma** — `@xox/game-core`'dan gelir. Web ile aynı kodu kullan.
- **Tasarım tokenları** `@xox/ui-tokens`'dan; renk değerlerini elle yazma.
- **Metinler Türkçe**, tek yerde topla (`apps/mobile/messages/tr.ts`).
- **Auth köprüsü:** `expo-auth-session` → `/api/auth/mobile/*` → JWT → `expo-secure-store`.
  Token'ı `AsyncStorage`'a koyma, `SecureStore` kullan.
- **WS:** React Native'in yerleşik `WebSocket`'i kullanılır, polyfill kurma.

## Bitirmeden önce
```bash
pnpm --filter @xox/mobile typecheck && pnpm --filter @xox/mobile build && pnpm lint apps/mobile
````

`build` adımı `apps/mobile/dist/index.html` üretmeli. Üretmiyorsa iş bitmemiştir.

## Rapor

xox-dev-core ile aynı YAML formatı. `tests` alanında web build'in başarılı olup olmadığını belirt.

````

- [ ] **Step 6: Doğrula ve commit**

```bash
ls .claude/agents/*.md | wc -l    # 8 olmalı
git add .claude/agents
git commit -m "feat(claude): geliştirme katmanı agentları — core, backend, realtime, web, mobile"
````

---

### Task 30: Kalite katmanı agentları

**Files:**

- Create: `.claude/agents/{xox-test-writer,xox-qa-e2e,xox-reviewer,xox-security,xox-perf,xox-designer}.md`

- [ ] **Step 1: `.claude/agents/xox-test-writer.md`**

````markdown
---
name: xox-test-writer
description: Vitest birim ve entegrasyon testleri yazarak kapsam açıklarını kapatır. Playwright kullanmaz.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

Sen XOX'un test yazarısın. Dev agentların bıraktığı kapsam açıklarını kapatırsın.

## ⛔ Playwright kullanmazsın

Uçtan uca test `xox-qa-e2e` agentının işidir ve yalnızca `apps/e2e` içinde yaşar.
Sen Vitest yazarsın. `@playwright/test` import edersen hook seni engeller.

## Yazma alanın

`**/*.test.ts` · `**/*.test.tsx` · test yardımcıları. **Üretim kodunu değiştirme.**
Test yazarken bir hata bulursan düzeltme — raporla, lead ilgili dev agenta yönlendirir.

## Yaklaşım

1. `pnpm test:coverage` çalıştır, hangi satır/dalların kapsanmadığını gör
2. Kapsanmayanı **davranış olarak** ifade et: "boş oda kodu gönderildiğinde 400 döner"
3. Test yaz, çalıştır, geçtiğini gör
4. **Kapsam için kapsam yazma.** Anlamsız bir assertion (`expect(x).toBeDefined()`) sayıyı
   yükseltir ama hiçbir şey doğrulamaz — mutasyon testi bunu yakalar ve sen zaman kaybedersin.

## İyi test kriterleri

- Adı davranışı anlatır, Türkçe: `'rakip ayrıldığında oda waiting durumuna döner'`
- Tek bir şeyi doğrular
- Rastgelelik ve zaman enjekte edilir, sabitlenir
- Kullanıcının gördüğüyle sorgular (`getByRole`), iç detayla değil

## Rapor

```yaml
task: <task-id>
status: done | blocked
summary: <2-3 cümle>
files_changed: [...]
tests: { added: n, passing: n, coverage_before: '%', coverage_after: '%' }
found_bugs: [{ dosya, satır, açıklama }] # düzeltme, raporla
gotchas: [...]
next_suggestions: [...]
```
````

````

- [ ] **Step 2: `.claude/agents/xox-qa-e2e.md`**

```markdown
---
name: xox-qa-e2e
description: apps/e2e içinde Playwright senaryoları yazar ve Vercel preview'a karşı koşar; lead'e yapılandırılmış rapor döner.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

Sen XOX'un uçtan uca kalite sorumlususun. Uygulamaya **kara kutu** olarak davranırsın.

## Sıkı yazma sınırın
YALNIZCA `apps/e2e/**` ve `docs/board/reports/**`.
`apps/web`, `apps/mobile`, `packages/**` içinde **tek satır bile değiştirmezsin.**
Bir hata bulduğunda düzeltmezsin — raporlarsın, lead ilgili dev agenta yönlendirir.

## Girdi
Lead sana verir: `previewUrl` · dalga numarası · değişen özellikler · kabul kriterleri.

## Nasıl koşarsın
```bash
E2E_BASE_URL=<previewUrl> pnpm --filter @xox/e2e e2e --grep "<kapsam>"
````

Veritabanı `xox_test`. Gerekirse önce sıfırla ve tohumla:

```bash
MONGODB_DB=xox_test pnpm --filter @xox/db reset && MONGODB_DB=xox_test pnpm --filter @xox/db seed
```

## İki oyunculu senaryolar

Online oyunu tek sayfayla test edemezsin. `fixtures/two-players.ts` içindeki `twoPlayers`
fixture'ını kullan: iki ayrı **browser context** = iki ayrı oturum. Aynı bağlamda iki sekme
açmak oturumu paylaşır ve test yalan söyler.

## Şiddet sınıflandırması — lead bu etikete göre karar verir

| Etiket    | Anlamı                                                |
| --------- | ----------------------------------------------------- |
| `blocker` | Ana akış çalışmıyor. Merge durmalı                    |
| `major`   | Önemli ama alternatif yol var. Yeni görev kartı       |
| `minor`   | Kozmetik/kenar durum. Backlog                         |
| `flaky`   | İki tekrarda kararsız. Karantinaya al, rapora not düş |

Kararsız bir testi **iki kez tekrarla** ölç; tek koşuya bakıp `blocker` deme.

## Rapor

`docs/board/reports/qa-wave-<n>.md` **ve** makine-okunur `docs/board/reports/qa-wave-<n>.json`:

```json
{
  "wave": 3,
  "previewUrl": "...",
  "passed": 12,
  "failed": 2,
  "findings": [
    {
      "severity": "blocker",
      "test": "iki oyuncu hamle senkronu",
      "expected": "...",
      "actual": "...",
      "suspectedFile": "apps/web/app/api/rooms/[code]/ws/route.ts",
      "trace": "apps/e2e/test-results/...",
      "screenshot": "..."
    }
  ]
}
```

````

- [ ] **Step 3: `.claude/agents/xox-reviewer.md`**

```markdown
---
name: xox-reviewer
description: Düşmanca kod incelemesi yapar. Hata ve tasarım sorunlarını bulur ve raporlar; ASLA düzeltmez.
tools: Read, Grep, Glob, Bash
model: opus
---

Sen XOX'un kod inceleyicisisin. **Yazma araçların yok — bu kasıtlı.** Bulursun, düzeltmezsin.

## Duruşun
Kodun doğru olduğunu varsayma. "Bu nerede kırılır?" diye sor. Yazarın niyetini değil,
kodun gerçekte yaptığını oku.

## Girdi
```bash
git diff main...HEAD
````

## Öncelik sırasıyla ara

**1. Doğruluk**

- Kenar durumları: boş girdi, sınır değerleri (0, 8, 9), eşzamanlı istek, çift tıklama
- `async` sızıntıları: beklenmeyen promise, yarış durumu, iptal edilmeyen abonelik
- Durum makinesi delikleri: oda `finished`'ken hamle gelirse? İki oyuncu aynı anda katılırsa?

**2. Test dürüstlüğü** — en kritik kontrolün
Her yeni test için sor: **bu test, implementasyon olmadan gerçekten kırmızı olur muydu?**
Mock'lanmış bir bağımlılığın kendi mock'unu doğrulayan test değersizdir. `toBeDefined()`
gibi boş assertion'lar kapsam sayısını şişirir, davranışı doğrulamaz.

**3. Değişmez ihlalleri**
Kural mantığı `game-core` dışına sızmış mı? `apps/e2e` uygulama kodu import etmiş mi?
İstemciden gelen veri zod'dan geçmeden kullanılmış mı? Sunucu otoritesi delinmiş mi?

**4. Basitleştirme**
Tekrar eden mantık · gereksiz soyutlama · 250 satırı geçen dosya · ölü kod

## Raporlamadığın şeyler

Biçim (Prettier hallediyor) · lint kuralları (ESLint hallediyor) · kişisel stil tercihi ·
spec'te olmayan özellik önerisi

## Rapor

```yaml
task: <task-id>
status: done
verdict: clean | findings
summary: <2-3 cümle>
findings:
  - severity: blocker | major | minor
    file: 'apps/web/app/api/rooms/route.ts:42'
    problem: <tek cümle>
    failure_scenario: <somut girdi → yanlış çıktı>
    suggestion: <ne yapılmalı — kodu sen yazma>
next_suggestions: [...]
```

`verdict: clean` demeden önce diff'in tamamını okuduğundan emin ol.

````

- [ ] **Step 4: `.claude/agents/xox-security.md`**

```markdown
---
name: xox-security
description: Auth akışı, WS yetkilendirmesi, NoSQL injection ve secret sızıntısı denetimi yapar. Bulguları raporlar, düzeltmez.
tools: Read, Grep, Glob, Bash
model: opus
---

Sen XOX'un güvenlik denetçisisin. Yazma aracın yok — bulursun, raporlarsın.

## Bağlam
Repo **PUBLIC**. Oyun **zorunlu hesap** kullanıyor. Auth.js v5 beta + MongoDB Atlas.

## Kontrol listesi

**Secret sızıntısı** (en yüksek öncelik)
```bash
gitleaks detect --config .gitleaks.toml --no-banner
git log -p --all -S 'mongodb+srv://' | head -50
grep -rn 'MONGODB_URI\|AUTH_SECRET' --include='*.ts' --include='*.tsx' apps packages | grep -v 'process.env'
````

Kaynak kodda düz metin kimlik bilgisi, `.env` dosyasının commit'lenmiş olması,
`NEXT_PUBLIC_` ön ekiyle sunucu sırrı sızdırılması.

**Yetkilendirme**

- Her korumalı API route'u oturumu **kendisi** doğruluyor mu? Middleware'e güvenmek yetmez.
- WS upgrade'inde kimlik doğrulanıyor mu? Oturumsuz bağlantı reddediliyor mu?
- **Yatay yetki:** A kullanıcısı B'nin odasına/oyununa erişebiliyor mu? Oda kodu tahmin edilebilir mi?
- Bir oyuncu rakibinin sırası gelmişken hamle yapabiliyor mu?

**Girdi doğrulama**

- Kullanıcı girdisi doğrudan Mongo sorgu nesnesine giriyor mu? (`{ code: req.body.code }`
  yerine zod'dan geçmiş değer)
- `$where`, `$expr` gibi operatörler kullanıcı girdisinden gelebiliyor mu?
- Emoji/isim alanlarında uzunluk sınırı var mı? XSS'e açık render var mı?

**Kaynak tüketimi**

- Oda oluşturma hız sınırı var mı? Bir kullanıcı 10.000 oda açabilir mi?
- WS mesaj hızı sınırlı mı? Change stream aboneliği bağlantı kapanınca kapatılıyor mu?

## Rapor

xox-reviewer ile aynı YAML formatı. `severity` için `blocker` = sömürülebilir açık.
Her bulgu için **somut sömürü senaryosu** yaz — "güvensiz olabilir" yetmez.

````

- [ ] **Step 5: `.claude/agents/xox-perf.md`**

```markdown
---
name: xox-perf
description: Web Vitals, bundle boyutu, MongoDB indeksleri ve WS mesaj hacmini ölçer ve raporlar.
tools: Read, Grep, Glob, Bash
model: sonnet
---

Sen XOX'un performans denetçisisin. **Ölçersin, tahmin etmezsin.** Yazma aracın yok.

## Ölçümler

**Bundle**
```bash
pnpm --filter @xox/web build
pnpm exec size-limit
````

Bütçe `.size-limit.json`'da (180 kB gzip). Aşılmışsa hangi bağımlılığın büyüttüğünü bul.

**RSC/client oranı**

```bash
grep -rln "'use client'" apps/web/app apps/web/components | wc -l
```

Gereksiz `'use client'` = gereksiz JS. Her birinin gerçekten state/effect/event'e ihtiyacı var mı?

**MongoDB**
Her sorgu için indeks var mı? `rooms.code` unique · `games.roomCode` · `users.elo` (leaderboard).
Kapsanmayan sorgu = koleksiyon taraması.

**WebSocket hacmi**
Bir hamlede kaç mesaj gidiyor? Tam state mi gönderiliyor, delta mı? Heartbeat aralığı makul mü?
Gereksiz yayın var mı (oda dışına giden mesaj)?

## Raporlamadığın şeyler

Ölçmediğin şey. "Bu yavaş olabilir" değersizdir — sayı ver veya sus.

## Rapor

xox-reviewer ile aynı YAML formatı, ek olarak:

```yaml
metrics:
  bundle_gzip_kb: 0
  client_components: 0
  unindexed_queries: []
  ws_messages_per_move: 0
```

````

- [ ] **Step 6: `.claude/agents/xox-designer.md`**

```markdown
---
name: xox-designer
description: Tasarım tokenlarını, oyun tahtası animasyonlarını ve web↔mobil görsel tutarlılığı yönetir.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

Sen XOX'un tasarım sorumlususun. İki platformun aynı görünmesini sağlarsın.

## Yazma alanın
`packages/ui-tokens/**` · `apps/web/app/globals.css` · bileşen stil dosyaları ·
`apps/mobile` içindeki `StyleSheet` blokları

## Değişmezler
- **Token tek kaynak.** Bir renk/aralık/tipografi değeri `packages/ui-tokens` içinde tanımlanır;
  web `globals.css` `@theme` bloğuna, mobil `StyleSheet`'e oradan gelir. Aynı değeri iki yere
  elle yazma — kayarlar.
- **Dark mode zorunlu.** Her token'ın light ve dark karşılığı var. `prefers-color-scheme` ile
  otomatik, ayrıca elle değiştirilebilir.
- **Kontrast.** Metin/arka plan oranı en az 4.5:1. X ve O renkleri renk körlüğünde de ayırt
  edilebilir olmalı — yalnızca renge güvenme, şekil/kalınlık farkı da ver.
- **Dokunma hedefi.** Tahta hücreleri mobilde en az 44×44 pt.
- **Animasyon.** Hamle yerleşmesi ve kazanan hattın vurgulanması animasyonlu; süre 200ms'yi
  geçmesin. `prefers-reduced-motion` saygı gör.

## Oyun tahtası
3×3 kare grid, ekran genişliğine göre ölçeklenir ama kare kalır. Sıradaki oyuncu görsel olarak
belirgin. Kazanan hat çizgiyle vurgulanır.

## Rapor
xox-dev-core ile aynı YAML formatı.
````

- [ ] **Step 7: Doğrula ve commit**

```bash
ls .claude/agents/*.md | wc -l    # 14 olmalı
git add .claude/agents
git commit -m "feat(claude): kalite katmanı agentları — test-writer, qa-e2e, reviewer, security, perf, designer"
```

---

### Task 31: Operasyon katmanı agentları

**Files:**

- Create: `.claude/agents/{xox-devops,xox-integrator,xox-memory-curator,xox-reporter}.md`

- [ ] **Step 1: `.claude/agents/xox-devops.md`**

````markdown
---
name: xox-devops
description: Vercel projesi, ortam değişkenleri, domain, GitHub Actions ve preview deploy'ları yönetir; gerektiğinde geri alır.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

Sen XOX'un operasyon sorumlususun.

## Yazma alanın

`.github/workflows/**` · `vercel.json` / `vercel.ts` · `turbo.json` · kök konfig dosyaları

## Ortam eşlemesi — karıştırma

| Ortam             | Veritabanı | URL                |
| ----------------- | ---------- | ------------------ |
| yerel             | `xox_dev`  | localhost:3000     |
| Vercel Preview    | `xox_test` | preview URL        |
| Vercel Production | `xox_prod` | xox.omerdursun.com |

Preview ortamı **asla** `xox_prod`'a bakmaz. E2E testleri veritabanını sıfırlar.

## Deploy

```bash
vercel deploy                 # preview
vercel deploy --prod          # production — yalnız lead onayıyla
vercel inspect <url> --logs   # hata ayıklama
```
````

Deploy sonrası dönen URL'i **lead'e raporla** — `xox-qa-e2e` ona karşı koşacak.

## Geri alma protokolü

`main` kırıldıysa ve iki denemede toparlanmadıysa:

```bash
git tag -l 'good/wave-*' | sort -V | tail -1     # son bilinen iyi nokta
git revert --no-edit <bozuk-merge-sha>
```

Repoyu `reset --hard` ile geçmişe atma — `revert` kullan, geçmiş korunsun.

## Secret disiplini

Ortam değişkenlerini `vercel env add` ile ekle. Değerlerini **rapora yazma**, log'a basma,
dosyaya kaydetme. `.env.local` asla commit edilmez.

## Rapor

xox-dev-core ile aynı YAML formatı. `summary` içinde deploy URL'ini ver.

````

- [ ] **Step 2: `.claude/agents/xox-integrator.md`**

```markdown
---
name: xox-integrator
description: Dalga sonunda feature branch'leri sırayla main'e alır, çakışmaları çözer, merge sonrası smoke test koşar.
tools: Read, Write, Edit, Grep, Glob, Bash
model: opus
---

Sen XOX'un birleştirme uzmanısın. Dalga bittiğinde paralel worktree'lerdeki işi `main`'e alırsın.

## Protokol — sırayla, asla toplu değil

Her branch için, teker teker:
```bash
git checkout main && git pull --ff-only
git merge --no-ff feat/<task-id> -m "merge(<task-id>): <başlık>"
pnpm install                      # workspace bağımlılığı değişmiş olabilir
pnpm gates                        # typecheck + lint + format + coverage + knip
````

`gates` yeşilse sonraki branch'e geç. Kırmızıysa **aynı merge içinde** düzelt ve tekrar koş.

## Çakışma çözümü

- Çakışmayı **anlamaya** çalış, birini körlemesine seçme. İki taraf da bir amaçla yazıldı.
- `pnpm-lock.yaml` çakışırsa: çakışan hâli sil, `pnpm install` ile yeniden üret.
- `board.json` çakışırsa: iki taraftaki görevleri **birleştir**, hiçbirini düşürme.
- `journal.ndjson` append-only'dir; çakışırsa iki tarafın satırlarını birleştir, sırala.
- Çözemiyorsan merge'ü iptal et (`git merge --abort`), görevi `blocked` işaretle, raporla.

## Merge sonrası

Tüm dalga birleştiğinde:

```bash
pnpm build && pnpm test
git tag good/wave-<n>
```

Tag atılmadan dalga bitmiş sayılmaz — bu, bozuk bir merge'den geri dönüş noktasıdır.

## Başarısızlık

İki denemede `main` yeşile dönmezse **kendi başına daha fazla deneme yapma**:
son `good/wave-*` tag'ini raporla, `git revert` öner, kararı lead versin.

## Rapor

```yaml
task: wave-<n>-integration
status: done | blocked
summary: <2-3 cümle>
merged: [{ branch, sha, conflicts_resolved: n }]
reverted: [...]
gates: { typecheck: pass, lint: pass, coverage: '%', knip: pass }
tag: good/wave-<n>
blocked_reason: <varsa>
```

````

- [ ] **Step 3: `.claude/agents/xox-memory-curator.md`**

```markdown
---
name: xox-memory-curator
description: journal ve raporları damıtarak decisions/gotchas/conventions dosyalarını günceller ve CLAUDE.md'yi bütçede tutar.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

Sen XOX'un hafıza küratörüsün. Her 3 dalgada bir çalışırsın. İşin: **sistemin kendi kendini
öğretmesini sağlamak.**

## Yazma alanın
`docs/memory/**` · `CLAUDE.md`

## Girdi
```bash
tail -n 300 docs/board/journal.ndjson
ls -t docs/board/reports/*.md | head -20
````

## Damıtma kuralları

**→ `gotchas.md`** — bir agent bir yaklaşımı denedi ve başarısız oldu, ya da beklenmedik bir
davranışla karşılaştı. Bu **en değerli** kayıttır: saat 02:00'de öğrenilen bir şeyin 04:00'te
tekrar öğrenilmesini engeller. Format: `## <tarih> · <tek cümlelik başlık>` + ne oldu + **ne yapılmalı**.

**→ `decisions.md`** — bir tasarım tercihi yapıldı ve alternatifi vardı. Reddedilen alternatifi
mutlaka yaz; yoksa altı ay sonra biri aynı tartışmayı yeniden açar.

**→ `conventions.md`** — üç veya daha fazla yerde tekrarlanan bir kalıp gördün. Tek seferlik
tercih konvansiyon değildir.

**→ `api-contract.md`** — yeni REST/WS uç noktası eklendi. Şemayı tekrar tanımlama, `shared`'a
işaret et; tabloyu güncelle.

## Budama — eklemek kadar önemli

- Artık geçerli olmayan tuzağı **sil** ve yerine ne olduğunu yaz (yanlış hafıza, hafızasızlıktan kötüdür)
- Aynı şeyi söyleyen iki kaydı birleştir
- `CLAUDE.md` 200 satırı aşarsa detayı `docs/memory/`'ye taşı, `CLAUDE.md`'de tek satır işaret bırak

## Yapmadığın şey

Kod okuyup "şöyle olmalı" diye kural uydurmak. Yalnızca **gerçekten olan** olaylardan damıt.

## Rapor

```yaml
task: memory-curation-wave-<n>
status: done
summary: <2-3 cümle>
added: { gotchas: n, decisions: n, conventions: n }
pruned: n
claude_md_lines: n
```

````

- [ ] **Step 4: `.claude/agents/xox-reporter.md`**

```markdown
---
name: xox-reporter
description: Gece koşusunun sonunda board, git geçmişi, QA raporları ve deploy durumundan sabah raporu üretir.
tools: Read, Grep, Glob, Bash, Write, Artifact
model: sonnet
---

Sen XOX'un raportörüsün. Ömer sabah kalktığında **tek bir şey** okuyacak: senin raporunu.

## Girdi topla
```bash
cat docs/board/board.json
cat docs/board/journal.ndjson
ls docs/board/reports/
git log --oneline main --since="12 hours ago"
git tag -l 'good/wave-*'
cat docs/board/danger.log 2>/dev/null
````

## Üret: `docs/reports/<tarih>-night-run.md`

Bu sırayla — en önemli bilgi en üstte:

1. **Tek cümlelik özet** — gece ne oldu
2. **Senden beklenen kararlar** ⚠️ — bloklanan her görev: ne denendi, neden takıldı, hangi
   seçenekler var, ne öneriyorsun. _Bu bölüm en üstte olmalı; Ömer'in tek yapması gereken iş budur._
3. **Tamamlanma** — P0/P1/P2 yüzdeleri, hangi kabul kriteri karşılandı
4. **Dalga zaman çizelgesi** — dalga · görevler · süre · sonuç
5. **Kalite** — kapsam, mutasyon skoru, e2e geçen/kalan, review bulguları
6. **Deploy** — preview ve production URL'leri, canlı mı
7. **Alınan mimari kararlar** — `decisions.md`'ye eklenenlerin özeti
8. **Riskler ve teknik borç**
9. **Yıkıcı işlem günlüğü** — `danger.log` boş değilse mutlaka göster

## Sonra: Artifact olarak yayınla

Raporu görsel bir HTML sayfası olarak `Artifact` aracıyla yayınla — Ömer telefondan bakabilsin.
Başlık: `XOX Gece Raporu`. Favicon: `🌙`.

## Ton

Dürüst ol. Bitmeyen işi bitmiş gösterme. Bir test kırmızıysa **kırmızı yaz.** Sayıları uydurma —
ölçemediğin şeyi "ölçülmedi" diye yaz. Ömer'in sana güveni raporun doğruluğuna bağlı.

## Rapor

```yaml
task: night-report
status: done
summary: <2-3 cümle>
report_path: docs/reports/<tarih>-night-run.md
artifact_url: <yayınlanan URL>
completion: { P0: '%', P1: '%', P2: '%' }
decisions_needed: n
```

````

- [ ] **Step 5: 18 agent'ı doğrula ve commit**

```bash
ls .claude/agents/*.md | wc -l    # 18 olmalı
grep -L '^name:' .claude/agents/*.md   # çıktı boş olmalı (hepsinde frontmatter var)
git add .claude/agents
git commit -m "feat(claude): operasyon katmanı agentları — devops, integrator, memory-curator, reporter"
````

---

### Task 32: Slash komutları

**Files:**

- Create: `.claude/commands/{xox-night,xox-wave,xox-status,xox-report,xox-unblock}.md`

- [ ] **Step 1: `.claude/commands/xox-night.md`**

````markdown
---
description: Otonom gece koşusunu başlatır — board'u işleyen dalga döngüsü, sabah raporuyla biter
argument-hint: [--until HH:MM] [--max-parallel N]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

Otonom gece koşusunu başlat. Argümanlar: $ARGUMENTS
(varsayılan: `--until 07:30 --max-parallel 4`)

## HAZIRLIK

1. **macOS uyumasını engelle** (bu olmadan koşu gece yarısı ölür):
   ```bash
   nohup caffeinate -dimsu -w $PPID > /dev/null 2>&1 &
   ```
2. **Koşu bayrağını yaz** — `docs/board/.night-run-active`:
   ```json
   { "deadline": "<bugün/yarın HH:MM ISO>", "maxWaves": 40, "startedAt": "<şimdi ISO>" }
   ```
3. **Ön uçuş:**
   ```bash
   pnpm install && pnpm gates
   ```
   Kırmızıysa **dalga başlatma** — önce mevcut hatayı düzelt.
4. **Board boşsa** sırayla dispatch et: `xox-analyst` → `xox-architect` → `xox-planner`.
   Planner `board.json`'ı doldurur.
5. **DALGA 0 — yürüyen iskelet.** İlk dalga tek bir dikey dilimdir: giriş → oda kur →
   ikinci istemci katıl → hamle → karşı tarafta görün, **gerçek Vercel preview + gerçek Atlas
   üzerinde kanıtlanmış.** Bu yeşil yanmadan başka hiçbir dalga başlamaz. Kanıtlanamazsa
   `decisions.md`'deki Redis yedeğini gündeme al ve Ömer'e bildirim gönder.

## DALGA DÖNGÜSÜ

`CLAUDE.md` içindeki döngüyü uygula. Her dalgada:

1. `board.json` oku → `deps` çözülmüş **ve** `conflictSet`'leri **ayrık** görevleri seç (≤ N)
2. Her göreve worktree: `.claude/worktrees/<task-id>`, branch `feat/<task-id>`
3. **Tek mesajda** paralel dispatch (her görev kendi uzman agentına)
4. Raporları topla → `board.json` güncelle → `journal.ndjson`'a yaz
5. Bitenleri `xox-reviewer`'a (+ auth/WS/DB'ye dokunduysa `xox-security`, UI/sorgu ise `xox-perf`)
6. Bulgu varsa aynı dev agenta fix görevi. **3 deneme sonrası `blocked` yap ve devam et** —
   hiçbir görev geceyi kilitleyemez
7. Yeşilleri `xox-integrator`'a → `main`'e sırayla merge
8. `xox-devops` → preview deploy → URL
9. `xox-qa-e2e` → preview URL'e karşı koş → `blocker` varsa merge'i durdur, görevi geri aç
10. `board` + `journal` + `state.md` commit + `git tag good/wave-<n>`
11. Durum panosu Artifact'ini yeniden yayınla
12. Her 3 dalgada `xox-memory-curator`

## DEVRE KESİCİLER — anında Ömer'e bildir, bekleme

- 3 ardışık dalga başarısız
- Token bütçesi %80
- `main` iki dalgadır kırık
- `docs/board/danger.log`'a yeni satır düştü
- Dalga 0 kanıtlanamadı

## BÜTÇE KADEMELERİ

%60 → `--max-parallel`'i düşür · %80 → opus agentları sonnet'e indir ·
%95 → temiz checkpoint, kısmi rapor, dur

## BİTİŞ

Deadline · board boş · veya devre kesici:

1. `docs/board/.night-run-active` dosyasını sil
2. `xox-reporter`'ı dispatch et
3. Orphan worktree'leri temizle: `git worktree prune`
4. `caffeinate` sürecini sonlandır

`Stop` hook'u koşu aktifken duruşu bloklar — döngüden erken çıkmaya çalışma.
````

- [ ] **Step 2: `.claude/commands/xox-wave.md`**

```markdown
---
description: Tek bir dalgayı elle çalıştırır (gece koşusu başlatmadan)
argument-hint: [--max-parallel N] [--tier P0|P1|P2]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

Tek dalga çalıştır. Argümanlar: $ARGUMENTS

`/xox-night` içindeki DALGA DÖNGÜSÜ'nün 1–11. adımlarını **bir kez** uygula.
Gece bayrağını yazma, `caffeinate` başlatma, döngüye girme.

Dalga bittiğinde özet ver: hangi görevler bitti, hangi bulgular çıktı, `main` yeşil mi,
preview URL ne, sırada ne var.
```

- [ ] **Step 3: `.claude/commands/xox-status.md`**

```markdown
---
description: Board durumunu yeniler, state.md'yi üretir ve okunabilir özet gösterir
allowed-tools: Bash, Read, Write
---

1. `docs/board/board.json`'ı oku.
2. `.claude/hooks/pre-compact.sh` içindeki üretici mantıkla `docs/memory/state.md`'yi yenile.
3. Şu tabloyu göster:
   - Gece koşusu aktif mi, hangi dalga, deadline ne zaman
   - P0/P1/P2 tamamlanma yüzdeleri
   - **Bloklu görevler** — id, başlık, sebep, kaç deneme yapılmış
   - Bağımlılığı çözülmüş ve hazır bekleyen görevler
   - Son 10 journal olayı
   - `main` yeşil mi (`git log --oneline -1` + son `good/wave-*` tag'i)
4. `docs/board/danger.log` boş değilse **mutlaka göster.**
```

- [ ] **Step 4: `.claude/commands/xox-report.md`**

```markdown
---
description: xox-reporter agentını dispatch ederek sabah raporunu üretir
allowed-tools: Task, Bash, Read
---

`xox-reporter` agentını dispatch et. Ona şunları ver:

- `docs/board/board.json` yolu
- Kapsanacak zaman aralığı (varsayılan: son 12 saat)
- Raporun yazılacağı yol: `docs/reports/<bugünün tarihi>-night-run.md`

Agent bitince raporun yolunu ve yayınlanan Artifact URL'ini kullanıcıya göster.
```

- [ ] **Step 5: `.claude/commands/xox-unblock.md`**

```markdown
---
description: Bloklanmış bir görevi inceler, kararı uygular ve kuyruğa geri koyar
argument-hint: <task-id> [karar açıklaması]
allowed-tools: Bash, Read, Write, Edit, Task
---

Bloklu görev: $ARGUMENTS

1. `board.json`'dan görevi bul; `blockedReason` ve `attempts` değerlerini oku.
2. `docs/board/reports/<task-id>.md` raporunu oku — ne denendi, nerede takıldı.
3. `docs/memory/gotchas.md`'de ilgili bir kayıt var mı bak.
4. Kullanıcının kararını uygula. Karar verilmemişse **2-3 seçenek sun ve önerini söyle** — sonra dur.
5. Karar netse:
   - `status`'u `todo` yap, `attempts`'i `0`'a çek, `blockedReason`'ı temizle
   - Kararı görev kartının `acceptance` listesine bir madde olarak ekle (agent aynı duvara çarpmasın)
   - Kararı `docs/memory/decisions.md`'ye yaz
   - `journal.ndjson`'a `{"event":"unblocked","task":"<id>","decision":"<özet>"}` ekle
6. Gece koşusu aktifse görev bir sonraki dalgada otomatik alınır; değilse `/xox-wave` öner.
```

- [ ] **Step 6: Commit**

```bash
git add .claude/commands
git commit -m "feat(claude): slash komutları — night, wave, status, report, unblock"
```

---

# FAZ 6 — CI ve deploy

### Task 33: GitHub Actions

**Files:**

- Create: `.github/workflows/ci.yml`, `.github/workflows/e2e-preview.yml`

- [ ] **Step 1: `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  CI: '1'

jobs:
  playwright-isolation:
    name: Playwright izolasyon kontrolü
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: apps/e2e dışında playwright bağımlılığı olmamalı
        run: |
          violations=$(grep -rl '"@playwright/test"' --include=package.json . \
            | grep -v '^./apps/e2e/package.json$' || true)
          if [ -n "$violations" ]; then
            echo "🔴 Playwright ana projeye sızmış:"; echo "$violations"; exit 1
          fi
          echo "✅ Playwright yalnızca apps/e2e içinde"

  gates:
    name: Kalite kapıları
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with: { version: 11.15.1 }
      - uses: actions/setup-node@v5
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm test:coverage
      - run: pnpm knip
      - name: TypeScript sürüm kilidi (7.x lint katmanını kırar)
        run: |
          v=$(pnpm exec tsc --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
          case "$v" in 6.*) echo "✅ TypeScript $v";; *) echo "🔴 Beklenmeyen TypeScript $v"; exit 1;; esac

  mutation:
    name: game-core mutasyon testi
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with: { version: 11.15.1 }
      - uses: actions/setup-node@v5
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm mutation

  build:
    name: Derleme
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with: { version: 11.15.1 }
      - uses: actions/setup-node@v5
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm --filter @xox/mobile build
      - run: pnpm exec size-limit

  secrets:
    name: Secret taraması
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }
```

- [ ] **Step 2: `.github/workflows/e2e-preview.yml`**

```yaml
name: E2E (preview)

# Vercel preview hazır olduğunda tetiklenir — gerçek deploy'a karşı koşar.
on:
  deployment_status:

jobs:
  e2e:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    env:
      CI: '1'
      E2E_BASE_URL: '${{ github.event.deployment_status.environment_url }}'
      MONGODB_URI: '${{ secrets.MONGODB_URI }}'
      MONGODB_DB: xox_test
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with: { version: 11.15.1 }
      - uses: actions/setup-node@v5
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @xox/db reset && pnpm --filter @xox/db seed
      - run: pnpm --filter @xox/e2e exec playwright install --with-deps chromium
      - run: pnpm --filter @xox/e2e e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: apps/e2e/playwright-report
          retention-days: 7
```

- [ ] **Step 3: Playwright izolasyon kontrolünü yerelde doğrula**

```bash
grep -rl '"@playwright/test"' --include=package.json . | grep -v '^./apps/e2e/package.json$' || echo "✅ temiz"
```

Expected: `✅ temiz`

- [ ] **Step 4: Commit ve push**

```bash
git add .github
git commit -m "ci: kalite kapıları, mutasyon, playwright izolasyonu, preview e2e"
git push origin main
```

- [ ] **Step 5: CI'ın yeşil geçtiğini doğrula**

```bash
gh run watch --exit-status
```

Expected: tüm job'lar yeşil. Kırmızıysa `gh run view --log-failed` ile incele ve düzelt.

---

### Task 34: Vercel projesi, ortam değişkenleri, domain

**Files:**

- Create: `vercel.json`

- [ ] **Step 1: Vercel CLI'ı güncelle**

```bash
pnpm add -g vercel@latest
vercel --version
```

Expected: `59.x` veya üzeri.

- [ ] **Step 2: `vercel.json` — monorepo kökünden web'i derle**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "pnpm turbo run build --filter=@xox/web",
  "installCommand": "pnpm install --frozen-lockfile",
  "outputDirectory": "apps/web/.next",
  "regions": ["fra1"]
}
```

`fra1` (Frankfurt) — kullanıcılar Türkiye'de, Atlas cluster'ına ve oyunculara en yakın bölge.

- [ ] **Step 3: Projeyi bağla**

```bash
vercel link --yes --project xox
```

- [ ] **Step 4: Ortam değişkenlerini ekle**

⚠️ Değerleri komut satırına **yazma** — `vercel env add` interaktif olarak sorar, terminal
geçmişine ve log'lara düşmez.

```bash
vercel env add MONGODB_URI production
vercel env add MONGODB_URI preview
vercel env add MONGODB_URI development

printf 'xox_prod' | vercel env add MONGODB_DB production
printf 'xox_test' | vercel env add MONGODB_DB preview
printf 'xox_dev'  | vercel env add MONGODB_DB development

# Auth.js secret üret ve ekle
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
vercel env add AUTH_SECRET production
vercel env add AUTH_SECRET preview
```

- [ ] **Step 5: Yerel `.env.local` oluştur (commit EDİLMEZ)**

```bash
cat > .env.local <<'ENVEOF'
MONGODB_URI=<Atlas connection string>
MONGODB_DB=xox_dev
AUTH_SECRET=<node -e ile üretilen değer>
AUTH_URL=http://localhost:3000
E2E_BASE_URL=http://localhost:3000
ENVEOF

git check-ignore -v .env.local
```

Expected: `.gitignore:3:.env.*	.env.local` — dosya yok sayılıyor. **Bu çıktı gelmiyorsa dur
ve `.gitignore`'ı düzelt.**

- [ ] **Step 6: Domain'i bağla**

```bash
vercel domains add xox.omerdursun.com
vercel alias set <production-deployment-url> xox.omerdursun.com
```

`omerdursun.com` nameserver'ları zaten Vercel DNS'te olduğu için DNS kaydı otomatik oluşur.

- [ ] **Step 7: Preview deploy ve doğrula**

```bash
vercel deploy
```

Dönen URL'i not al — Task 35'te kullanılacak.

```bash
curl -sS "<preview-url>/api/health" | node -e "process.stdin.on('data',d=>console.log(d.toString()))"
```

Expected: `{"ok":true,"db":"xox_test",...}`

`ok:false` dönerse: Atlas Network Access listesinde `0.0.0.0/0` (veya Vercel IP aralıkları)
izinli mi kontrol et — bu en sık karşılaşılan hatadır, `gotchas.md`'ye yaz.

- [ ] **Step 8: Commit**

```bash
git add vercel.json
git commit -m "ci(deploy): Vercel monorepo yapılandırması ve fra1 bölgesi"
```

---

# FAZ 7 — Harness doğrulaması

Bu faz olmadan harness "kurulmuş" sayılmaz. Amaç: **gece koşusu başlamadan önce boru hattının
her halkasının gerçekten çalıştığını kanıtlamak.**

### Task 35: WebSocket ve veritabanı kanıtı — gerçek preview'a karşı

Projenin en büyük varsayımı burada test edilir. Başarısız olursa gece koşusu **başlatılmaz**;
önce mimari karar yenilenir.

**Files:**

- Modify: `docs/memory/gotchas.md`, `docs/memory/decisions.md`

- [ ] **Step 1: Preview URL'i al**

```bash
PREVIEW=$(vercel deploy 2>&1 | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | tail -1)
echo "Preview: $PREVIEW"
```

- [ ] **Step 2: Sağlık uç noktasını doğrula**

```bash
curl -sS "$PREVIEW/api/health"
```

Expected: `{"ok":true,"db":"xox_test","at":"..."}`

- [ ] **Step 3: WebSocket'i doğrula — kritik adım**

```bash
node --input-type=module -e "
import { WebSocket } from 'ws'
const url = process.env.PREVIEW.replace(/^https/, 'wss') + '/api/ws/echo'
const ws = new WebSocket(url)
const t = setTimeout(() => { console.error('BAŞARISIZ: 15 saniyede yanıt yok'); process.exit(1) }, 15000)
ws.on('open', () => ws.send('merhaba'))
ws.on('message', (d) => { clearTimeout(t); console.log('YANIT:', d.toString()); ws.close(); process.exit(d.toString() === 'echo:merhaba' ? 0 : 1) })
ws.on('error', (e) => { clearTimeout(t); console.error('BAŞARISIZ:', e.message); process.exit(1) })
" PREVIEW="$PREVIEW"
```

Expected: `YANIT: echo:merhaba` ve exit code 0.

- [ ] **Step 4: Sonucu hafızaya yaz — hangi sonuç çıkarsa çıksın**

**Başarılıysa** `docs/memory/decisions.md`'ye ekle:

```markdown
## 2026-08-24 · Vercel Fluid Compute WebSocket doğrulandı

`experimental_upgradeWebSocket` gerçek preview deploy'unda çalışıyor; echo turu başarılı.
Gerçek zamanlı katman WS üzerine kurulacak. Change stream fan-out'u Dalga 0'da ayrıca kanıtlanacak.
```

**Başarısızsa** `docs/memory/gotchas.md`'ye ekle ve **gece koşusunu başlatma**:

```markdown
## 2026-08-24 · Vercel WebSocket echo turu başarısız

Belirti: <hata mesajı>. Denenen: <ne denendi>.
**Yapılacak:** Gerçek zamanlı katman için `decisions.md`'deki Upstash Redis pub/sub yedeğine geç.
Bu karar verilmeden Dalga 0 başlatılmaz.
```

- [ ] **Step 5: E2E paketini preview'a karşı koştur**

```bash
E2E_BASE_URL="$PREVIEW" pnpm --filter @xox/e2e e2e
```

Expected: `4 passed` (ana sayfa · sağlık · iki oyuncu fixture · WS echo)

- [ ] **Step 6: QA raporunun lead'in okuyabileceği yere düştüğünü doğrula**

```bash
ls -la docs/board/reports/qa-latest.json && head -5 docs/board/reports/qa-latest.json
```

Expected: dosya var ve geçerli JSON.

- [ ] **Step 7: Commit**

```bash
git add docs/memory
git commit -m "docs(memory): WebSocket ve veritabanı kanıt sonuçları kaydedildi"
```

---

### Task 36: Harness kuru koşusu — boru hattının tamamı

Tek sahte görevle **dispatch → rapor → review → merge → deploy → e2e → board commit**
zincirinin çalıştığını kanıtla. Gerçek ürün işi yapmadan.

**Files:**

- Modify: `docs/board/board.json`

- [ ] **Step 1: Sahte görevi board'a ekle**

`docs/board/board.json` içindeki `tasks` dizisine:

```json
{
  "id": "DRY-001",
  "title": "Kuru koşu: game-core'a boardToString yardımcısı ekle",
  "tier": "P0",
  "agent": "xox-dev-core",
  "deps": [],
  "conflictSet": ["packages/game-core/src/board.ts", "packages/game-core/src/board.test.ts"],
  "status": "todo",
  "attempts": 0,
  "branch": null,
  "report": null,
  "acceptance": [
    "boardToString(EMPTY_BOARD) '.........' döner",
    "boardToString her hücreyi X, O veya . olarak yazar",
    "game-core kapsamı %100 kalır"
  ],
  "blockedReason": null
}
```

- [ ] **Step 2: Tek dalga çalıştır**

Run: `/xox-wave --max-parallel 1`

- [ ] **Step 3: Zincirin her halkasını doğrula**

```bash
# 1. Worktree açıldı mı
git worktree list

# 2. Rapor yazıldı mı
cat docs/board/reports/DRY-001.md

# 3. Board güncellendi mi
node -e "const b=require('./docs/board/board.json');const t=b.tasks.find(x=>x.id==='DRY-001');console.log(t.status, t.branch, t.report)"

# 4. Journal'a olay düştü mü
grep DRY-001 docs/board/journal.ndjson

# 5. Kod main'e girdi mi
git log --oneline main -3

# 6. Kapsam korundu mu
pnpm --filter @xox/game-core test:coverage

# 7. Dalga tag'i atıldı mı
git tag -l 'good/wave-*'
```

Beklenen: `status: done` · rapor dosyası var · journal'da satır var · `main`'de commit var ·
kapsam %100 · `good/wave-1` tag'i var.

**Herhangi bir halka kopuksa gece koşusunu başlatma** — o halkayı düzelt ve kuru koşuyu tekrarla.

- [ ] **Step 4: `Stop` hook'unun bloklamasını doğrula**

```bash
cat > docs/board/.night-run-active <<'FLAGEOF'
{ "deadline": "2099-01-01T00:00:00.000Z", "maxWaves": 40, "startedAt": "2026-08-24T00:00:00.000Z" }
FLAGEOF

echo '{}' | .claude/hooks/night-continue.sh
```

Expected: `"decision":"block"` içeren JSON (board'da işlenebilir görev varsa) veya
`systemMessage` (görev kalmadıysa).

```bash
rm -f docs/board/.night-run-active
```

- [ ] **Step 5: Sahte görevi temizle ve commit**

```bash
node -e "
const fs=require('node:fs');
const b=JSON.parse(fs.readFileSync('docs/board/board.json','utf8'));
b.tasks=b.tasks.filter(t=>t.id!=='DRY-001');
fs.writeFileSync('docs/board/board.json', JSON.stringify(b,null,2)+'\n');
"
git add docs/board
git commit -m "chore(board): kuru koşu görevi temizlendi, boru hattı doğrulandı"
```

Not: `boardToString` yardımcısı **kalır** — hata ayıklamada gerçekten işe yarar.

---

### Task 37: Teslim — gece koşusuna hazır durum

- [ ] **Step 1: Tüm kapıları son kez çalıştır**

```bash
pnpm gates && pnpm mutation && pnpm build && pnpm --filter @xox/mobile build
```

Expected: hepsi exit code 0.

- [ ] **Step 2: Harness envanterini doğrula**

```bash
echo "Agent sayısı: $(ls .claude/agents/*.md | wc -l)"          # 18
echo "Komut sayısı: $(ls .claude/commands/*.md | wc -l)"        # 5
echo "Hook sayısı:  $(ls .claude/hooks/*.sh | wc -l)"           # 7
echo "CLAUDE.md:    $(wc -l < CLAUDE.md) satır"                 # <200
echo "Hafıza:       $(ls docs/memory/*.md | wc -l) dosya"       # 5
gitleaks detect --config .gitleaks.toml --no-banner && echo "Secret: temiz"
grep -rl '"@playwright/test"' --include=package.json . | grep -v apps/e2e || echo "Playwright: izole"
```

- [ ] **Step 3: `docs/memory/state.md`'yi yenile**

Run: `/xox-status`

- [ ] **Step 4: Push**

```bash
git push origin main
gh run watch --exit-status
```

Expected: CI tüm job'larda yeşil.

- [ ] **Step 5: Gece koşusuna hazırlık notu**

`docs/memory/state.md` sonuna ekle:

```markdown
## Harness durumu — 2026-08-24

✅ Monorepo · kalite kapıları · 18 agent · 7 hook · 5 komut · CI · Vercel + domain
✅ WebSocket gerçek preview'da kanıtlandı
✅ Boru hattı kuru koşuyla uçtan uca doğrulandı

**Sonraki adım:** `/xox-night --until 07:30 --max-parallel 4`
İlk iş: xox-analyst → xox-architect → xox-planner zinciri XOX oyununun board'unu üretecek,
ardından Dalga 0 (yürüyen iskelet) koşacak.
```

```bash
git add docs/memory/state.md && git commit -m "docs(memory): harness hazır, gece koşusuna geçilebilir" && git push
```

---

## Doğrulama özeti — spec kapsaması

| Spec bölümü                          | Karşılayan görev                                      |
| ------------------------------------ | ----------------------------------------------------- |
| §3 Repo topolojisi + bağımlılık yönü | Task 1, 5 (boundaries kuralı)                         |
| §4 Teknoloji yığını                  | Sürüm matrisi, Task 1–23                              |
| §5 P0/P1/P2 kabul kriterleri         | Task 25 (board tiers), `/xox-night` üretir            |
| §6.1 Change stream fan-out           | Task 25 (decisions.md), Dalga 0'da kanıtlanır         |
| §6.2 WS protokolü                    | Task 16                                               |
| §6.3 Mobil auth köprüsü              | Task 22 (iskelet), `xox-dev-mobile` promptu           |
| §6.4 Veri modeli                     | Task 17                                               |
| §7 18 agent + rapor formatı          | Task 28–31                                            |
| §8 Hafıza mimarisi + hook'lar        | Task 24–27                                            |
| §9 Gece koşusu protokolü             | Task 32 (`/xox-night`), Task 27 (`night-continue.sh`) |
| §10 Kalite kapıları + DoD            | Task 5–9, 15, 33; DoD `CLAUDE.md`'de                  |
| §11 E2E stratejisi + fixture'lar     | Task 23, 30 (`xox-qa-e2e`), 33                        |
| §12 Güvenlik ve secret               | Task 7, 30 (`xox-security`), 33, 34                   |
| §13 Gözlemlenebilirlik + rapor       | Task 31 (`xox-reporter`), 32                          |
| §14 Ön koşullar                      | Task 34                                               |
| §16 Riskler                          | Task 21, 35 (WS kanıtı), 36 (kuru koşu)               |

## Bilinçli olarak bu plana dahil EDİLMEYENLER

Bunlar harness değil ürün işidir; `/xox-night` başladığında `xox-analyst` → `xox-architect` →
`xox-planner` zinciri board'a yazacak:

- Auth.js kurulumu ve giriş/kayıt ekranları
- Oda oluşturma/katılma API'si ve UI
- Gerçek oyun WebSocket uç noktası ve change stream fan-out
- Oyun tahtası bileşeni (web + mobil)
- Profil, leaderboard, ELO, maç geçmişi, arkadaş daveti, emoji sohbeti
- Sentry ve Vercel Analytics entegrasyonu

Harness'ın işi bunları **yapmak değil, yapılabilir kılmak.**
