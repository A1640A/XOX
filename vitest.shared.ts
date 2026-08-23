// vitest.shared.ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export const sharedConfig = defineConfig({
  plugins: [tsconfigPaths()],
  test: {
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
