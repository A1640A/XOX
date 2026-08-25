import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  // BLOKE EDİCİ ön kontrol (`/api/health`'in `db`si) + iki sabit test
  // kullanıcısının storageState'i (`fixtures/auth.ts`) burada, TÜM test
  // dosyalarından ÖNCE, tek seferde üretilir (kart E2E-001).
  globalSetup: './global-setup.ts',
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
