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
