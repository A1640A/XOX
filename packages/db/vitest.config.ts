import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: 'db',
      environment: 'node',
      setupFiles: ['./src/vitest.setup.ts'],
      coverage: {
        thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
        exclude: ['src/seed.ts', 'src/models/**', 'src/vitest.setup.ts'],
      },
    },
  }),
)
