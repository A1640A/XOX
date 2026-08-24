import { defineConfig, mergeConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { sharedConfig } from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    plugins: [react()],
    test: {
      name: 'web',
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      coverage: {
        thresholds: { lines: 70, branches: 65, functions: 70, statements: 70 },
        exclude: ['app/**/layout.tsx', 'messages/**', 'next.config.ts', '**/*.config.*'],
      },
    },
  }),
)
