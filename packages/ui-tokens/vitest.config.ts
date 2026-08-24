import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: 'ui-tokens',
      environment: 'node',
      coverage: { thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 } },
    },
  }),
)
