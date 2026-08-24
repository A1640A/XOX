import { describe, expect, it } from 'vitest'
import {
  acceptRematch,
  finishGame,
  offerRematch,
  pushEmoji,
  resign,
  settleDeadlines,
} from './index'
import type { RoomDoc } from '../models/room'

/**
 * AC10 — `rooms/` barrel'ı henüz doldurulmamış geçişleri **tipli iskelet**
 * olarak dışa verir (tasarım §12, sonraki dalgalar bu dosyaları doldurur).
 * Bu test yalnız "çağrılabilir + açıkça reddediyor" sözleşmesini kilitler;
 * gövde davranışını DEĞİL — o, ilgili dalga görevinin işidir.
 */
describe('rooms/ iskelet fonksiyonları (henüz uygulanmadı)', () => {
  it('resign() açık bir hata fırlatır', async () => {
    await expect(resign('CODE01', 'user-1')).rejects.toThrow(/henüz uygulanmadı/)
  })

  it('offerRematch() açık bir hata fırlatır', async () => {
    await expect(offerRematch('CODE01', 'user-1')).rejects.toThrow(/henüz uygulanmadı/)
  })

  it('acceptRematch() açık bir hata fırlatır', async () => {
    await expect(acceptRematch('CODE01', 'user-1')).rejects.toThrow(/henüz uygulanmadı/)
  })

  it('settleDeadlines() açık bir hata fırlatır', async () => {
    await expect(settleDeadlines('CODE01', Date.now())).rejects.toThrow(/henüz uygulanmadı/)
  })

  it('pushEmoji() açık bir hata fırlatır', async () => {
    await expect(pushEmoji('CODE01', 'X', '👋')).rejects.toThrow(/henüz uygulanmadı/)
  })

  it('finishGame() açık bir hata fırlatır', async () => {
    const room = { code: 'CODE01' } as RoomDoc
    await expect(finishGame(room, { kind: 'draw' })).rejects.toThrow(/henüz uygulanmadı/)
  })
})
