import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: 'game-core',
      environment: 'node',
      // Yenilmezlik kanıtı 642 oyunu baştan sona oynatır (~0.6 sn) ve Stryker
      // dokuz test koşucusunu aynı anda çalıştırdığında bu süre birkaç katına
      // çıkar. Varsayılan 5 sn sınırı bu yüzden yükseltildi; takılan bir
      // mutantı hâlâ yakalar.
      testTimeout: 20_000,
      coverage: {
        thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  }),
)
