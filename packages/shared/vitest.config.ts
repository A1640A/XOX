import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: 'shared',
      environment: 'node',
      coverage: { thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 } },
    },
  }),
)
