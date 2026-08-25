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

/**
 * KK-084: web ve mobil aynı renk değerlerini `@xox/ui-tokens`'tan alır; ikisinde de literal
 * hex renk kodu bulunmaz. `no-restricted-syntax` AST düzeyinde çalışır ve ÜÇ ayrı kalıbı
 * yakalar — hepsi hem sıradan string literal'de (`Literal`) hem template literal'in sabit
 * parçasında (`TemplateElement`) test edilir:
 *
 *   1. HEX_COLOR_LITERAL — bütün string TAM OLARAK bir hex kod: `'#2563eb'`, `` `#2563eb` ``,
 *      `'#abc'`, `'#2563eb80'` (3/6/8 haneli, 8. haneli alfa kanalı içindir).
 *   2. TAILWIND_ARBITRARY_HEX — Tailwind v4 keyfi-değer sözdizimi: `'bg-[#2563eb]'`,
 *      `'text-[#fff]/50'`. Bu repo Tailwind v4 CSS-first (config'siz) kullanıyor; ham renk
 *      yazmanın en olası yolu budur, JSX `style={{...}}`'den değil `className`'den girer.
 *   3. CSS_DECLARATION_HEX — bir template literal İÇİNDE gömülü CSS bildirimi:
 *      `` `color: #2563eb` ``. `:` + boşluk + `#hex` dizisi arandığı için "içinde hex geçen
 *      HERHANGİ bir string" gibi genel bir kalıp DEĞİL — git SHA'sı ya da `#anchor` gibi
 *      kimliklerde `:` hemen önünde `#hex` dizisi olağan değildir, yanlış pozitif riski düşük.
 *
 * `packages/ui-tokens/**` bu kuralın MUAF olduğu tek yer — tokenlar zaten orada tanımlanır.
 */
const HEX_COLOR_LITERAL = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const TAILWIND_ARBITRARY_HEX = /-\[#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\]/
const CSS_DECLARATION_HEX = /:\s*#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/
const HEX_BAN_MESSAGE =
  'Literal hex renk kodu yasak (KK-084). Rengi @xox/ui-tokens içindeki themes.acik/themes.koyu üzerinden al.'
const HEX_BAN_PATTERNS = [HEX_COLOR_LITERAL, TAILWIND_ARBITRARY_HEX, CSS_DECLARATION_HEX]
const NO_HEX_COLOR_LITERAL = {
  'no-restricted-syntax': [
    'error',
    ...HEX_BAN_PATTERNS.flatMap((pattern) => [
      { selector: `Literal[value=${pattern.toString()}]`, message: HEX_BAN_MESSAGE },
      { selector: `TemplateElement[value.raw=${pattern.toString()}]`, message: HEX_BAN_MESSAGE },
    ]),
  ],
}

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
      // Worktree'ler repo'nun tam kopyasıdır. Lint'lenirlerse aynı kod N kez taranır ve
      // çapraz-worktree hataları çıkar — gece 4 paralel dalga = 5 kopya.
      '.claude/worktrees/**',
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
      'no-console': [
        'error',
        {
          allow: [
            'warn',
            'error',
            // Worktree'ler repo'nun tam kopyasıdır; lint'lenirlerse aynı kod N kez taranır
            // ve çapraz-worktree hataları çıkar (gece 4 paralel dalga = 5 kopya).
            '.claude/worktrees/**',
          ],
        },
      ],
      'import-x/no-cycle': 'error',
      // v7 API: kural adı 'element-types' -> 'dependencies', seçenek 'rules' -> 'policies'.
      // game-core ve ui-tokens için politika tanımlanmadı: default: 'disallow' zaten
      // hiçbir hedefe izin vermeme davranışını sağlıyor (eski `allow: []` ile eşdeğer).
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            // Bir paketin kendi dosyalarının birbirini import etmesi normaldir.
            // Bunlar olmadan apps/web/app/page.tsx -> apps/web/messages/tr.ts bile
            // "web -> web izinli değil" hatası verir ve UI yazıldığı an her dalga kırılır.
            ...['game-core', 'shared', 'db', 'ui-tokens', 'web', 'mobile', 'e2e'].map((t) => ({
              from: { element: { type: t } },
              allow: { to: { element: { type: t } } },
            })),
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
      ...NO_HEX_COLOR_LITERAL,
    },
  },

  // React Native — yalnız mobil
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules, ...NO_HEX_COLOR_LITERAL },
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
    files: ['**/*.config.{js,mjs,ts}', '**/*.setup.ts', 'vitest.shared.ts', '.size-limit.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
)
