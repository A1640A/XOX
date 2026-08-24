import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: 'db',
      environment: 'node',
      setupFiles: ['./src/vitest.setup.ts'],
      // Beş kardeş test dosyası kendi beforeAll'unda Model.syncIndexes()
      // (drop+create) çağırıyor; paralel worker'larda eşzamanlı koşarlarsa
      // indexes.test.ts'in tam-sayım iddiası bir syncIndexes ortasında
      // ölçüm alabilir (reviewer bulgusu — flake KANITLANMADI ama mekanizma
      // gerçek). Dosyaları sıralı koştur: gerçek Atlas entegrasyon testleri
      // zaten paralellikten fayda görecek kadar yavaş değil.
      fileParallelism: false,
      coverage: {
        thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
        exclude: ['src/seed.ts', 'src/models/**', 'src/vitest.setup.ts'],
      },
    },
  }),
)
