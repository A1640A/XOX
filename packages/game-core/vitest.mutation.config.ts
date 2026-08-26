import { defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from './vitest.config'

/**
 * Stryker'ın koştuğu Vitest konfigürasyonu — `stryker.config.mjs` bunu
 * `vitest.configFile` ile gösterir.
 *
 * TEK farkı: `search-corpus-*.test.ts` dosyaları HARİÇTİR. Gerekçe:
 *
 * - O beş dosya 1000+ tam bütçeli arama koşar (ölçüldü: yaklaşık 280 sn).
 *   `coverageAnalysis: 'perTest'` altında Stryker, mutantı kapsayan testleri
 *   koşar; bu sweep `search.ts`/`evaluate.ts`teki HER mutantı kapsadığı için
 *   erken ölmeyen her mutant onu bir kez daha koşardı — mutasyon süresi
 *   saatlere çıkar ve kapı pratikte koşulamaz hâle gelir.
 * - Sweep'in ÖLDÜRME gücü zaten başka yerde: "düğüm bütçesi aşılmaz" iddiası
 *   `search.test.ts`teki hedefli, çıplak sayılı testlerle (1024 düğüm sınır
 *   testi, donmuş saat testi) sağlanır; sweep bunların üstüne yalnız GENİŞLİK
 *   ekler ("geniş bir örneklemde hiçbir pozisyon patlamıyor").
 * - Kapsam ve eşikler DEĞİŞMEDİ: `pnpm test` ve `pnpm test:coverage` beş
 *   dosyayı da koşar, `thresholds.break` 90'da durur.
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // `mergeConfig` dizileri BİRLEŞTİRİR: taban konfigürasyonun dışlamaları
      // (`node_modules`, `dist`, `.stryker-tmp`) korunur, üstüne sweep eklenir.
      exclude: ['**/search-corpus-*.test.ts'],
    },
  }),
)
