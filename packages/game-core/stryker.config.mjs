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
