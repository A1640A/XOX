import { defineConfig, mergeConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { sharedConfig } from '../../vitest.shared'

// CI-005: `game-engine.test.ts`teki 207 oyunluk yenilmezlik sondası CPU-yoğun
// (bkz. dosyanın kendi içindeki yorum). Diğer ~95 web test dosyasıyla aynı
// thread havuzunu paylaşırsa turbo 5 paket paralel + arka planda başka bir
// ajan çalışırken kendiliğinden ek gecikme birikir. Bu tek dosyayı ayrı bir
// projeye alıp tek-iş-parçacıklı/seri koşturmak, apps/web'in KENDİ dosyaları
// arasındaki paylaşımı keser (dış süreçlerin — turbo'nun diğer paketleri,
// başka bir agent — CPU'yu paylaşması bununla ÇÖZÜLMEZ, o yüzden test
// içindeki zaman aşımı ayrıca gerçek ölçümle gerekçelendirilmiş bir payla
// tutuluyor; bkz. docs/board/reports/CI-005.md).
const HEAVY_TEST = 'components/computer/game-engine.test.ts'

const SHARED_EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/.stryker-tmp/**']

export default mergeConfig(
  sharedConfig,
  defineConfig({
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      coverage: {
        thresholds: { lines: 70, branches: 65, functions: 70, statements: 70 },
        exclude: ['app/**/layout.tsx', 'messages/**', 'next.config.ts', '**/*.config.*'],
      },
      projects: [
        {
          extends: true,
          test: {
            name: 'web',
            exclude: [...SHARED_EXCLUDE, HEAVY_TEST],
          },
        },
        {
          extends: true,
          test: {
            name: 'web-yenilmezlik',
            include: [HEAVY_TEST],
            exclude: SHARED_EXCLUDE,
            // `fileParallelism: false` bu projede `maxWorkers`ı 1'e sabitler
            // (Vitest 4: `poolOptions.threads.singleThread` kaldırıldı, bkz.
            // migration guide). Proje zaten TEK dosya içeriyor; niyet, bu
            // dosyanın apps/web'in KENDİ diğer test dosyalarıyla worker
            // paylaşmamasıdır.
            fileParallelism: false,
          },
        },
      ],
    },
  }),
)
