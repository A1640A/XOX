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
  // `search-corpus-*.test.ts` mutasyon koşusundan HARİÇTİR — gerekçesi
  // `vitest.mutation.config.ts`in başındadır. Eşikler DEĞİŞMEDİ.
  vitest: { configFile: 'vitest.mutation.config.ts' },
  // `*.fixture.ts` test donanımıdır, üretim kodu değil: korpus üretecine
  // yapılan mutasyon yalnız korpusu değiştirir, hiçbir iddiayı düşürmez.
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.fixture.ts',
    '!src/index.ts',
    '!src/types.ts',
  ],
  thresholds: { high: 95, low: 90, break: 90 },
  timeoutMS: 60000,
}
