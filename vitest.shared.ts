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
