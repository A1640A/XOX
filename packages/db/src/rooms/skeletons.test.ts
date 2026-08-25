import { describe, expect, it } from 'vitest'
import { pushEmoji } from './index'

/**
 * AC10 — `rooms/` barrel'ı henüz doldurulmamış geçişleri **tipli iskelet**
 * olarak dışa verir (tasarım §12, sonraki dalgalar bu dosyaları doldurur).
 * Bu test yalnız "çağrılabilir + açıkça reddediyor" sözleşmesini kilitler;
 * gövde davranışını DEĞİL — o, ilgili dalga görevinin işidir.
 *
 * W1-02 `resign`/`offerRematch`/`acceptRematch`/`finishGame` gövdelerini
 * yazdı; onların iddiaları artık `resign.test.ts`, `rematch.test.ts` ve
 * `finish.test.ts` dosyalarında. Geriye tek iskelet kaldı: `pushEmoji`
 * (W3-03). `settleDeadlines` bilerek FIRLATMIYOR — kendi tetikleyici testi
 * `settle.test.ts`te.
 */
describe('rooms/ iskelet fonksiyonları (henüz uygulanmadı)', () => {
  it('pushEmoji() açık bir hata fırlatır', async () => {
    await expect(pushEmoji('CODE01', 'X', '👋')).rejects.toThrow(/henüz uygulanmadı/)
  })
})
