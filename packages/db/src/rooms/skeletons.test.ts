import { describe, expect, it } from 'vitest'
import * as rooms from './index'

/**
 * AC10'un mirası. Bu dosya `rooms/` barrel'ının **tipli iskelet** dönemini
 * kilitliyordu ("çağrılabilir + açıkça reddediyor"); W1-02 `resign`/`rematch:*`/
 * `finishGame`i, **W3-03 sonuncusu olan `pushEmoji`yi** doldurdu — geriye
 * kilitlenecek iskelet KALMADI.
 *
 * Dosya silinmedi, çünkü asıl değerli iki iddia iskeletlerden bağımsız:
 * barrel'ın DONMUŞ dışa aktarım listesi (sonraki dalgalar yalnız gövde
 * değiştirir, liste değişmez) ve "hiçbir gövde iskelet olarak geri dönmedi".
 * Gövde davranışları ilgili dosyaların kendi testlerinde
 * (`emoji.test.ts`, `resign.test.ts`, `rematch.test.ts`, `finish.test.ts` …).
 */
const BEKLENEN_GECISLER = [
  'createRoom',
  'joinRoom',
  'detachConnection',
  'applyMove',
  'resign',
  'offerRematch',
  'acceptRematch',
  'settleDeadlines',
  'pushEmoji',
  'finishGame',
] as const

describe('rooms/ barrel — DONMUŞ liste, iskelet kalmadı', () => {
  it('barrel tam olarak beklenen geçişleri dışa verir ve hepsi fonksiyondur', () => {
    expect(Object.keys(rooms).toSorted()).toStrictEqual([...BEKLENEN_GECISLER].toSorted())

    for (const ad of BEKLENEN_GECISLER) {
      expect(typeof rooms[ad], ad).toBe('function')
    }
  })

  it('hiçbir geçiş "henüz uygulanmadı" iskelet gövdesi taşımıyor', () => {
    const iskeletler = BEKLENEN_GECISLER.filter((ad) =>
      rooms[ad].toString().includes('henüz uygulanmadı'),
    )

    expect(iskeletler).toStrictEqual([])
    // "Yokluk" iddiasının pozitif eşi: liste boş olsaydı yukarısı da yeşildi.
    expect(BEKLENEN_GECISLER).toHaveLength(10)
  })
})
