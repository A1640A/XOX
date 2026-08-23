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
