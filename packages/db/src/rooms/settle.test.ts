import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { connectDb } from '../client'
import { Room } from '../models/room'
import { settleDeadlines } from './settle'

const CODE = 'STL001'

/**
 * ⚠️ **TETİKLEYİCİ TEST (W2-01).** `settleDeadlines` bugün koşulsuz `null`
 * dönen bir iskelettir ve — diğer iskeletlerin aksine — FIRLATMAZ, çünkü WS
 * oturumu onu her mesajdan önce çağırıyor (fırlatsa her `ping` bir stack trace
 * ve bir oda kodu log'u üretirdi).
 *
 * Fırlatmayan bir iskelet sessizce yaşayabilir; bu testin görevi buna izin
 * VERMEMEK: W2-01 gövdeyi doldurduğu anda aşağıdaki iddialar kırmızıya döner
 * (süresi geçmiş bir oda artık `null` DÖNMEYECEK ve `version` ARTACAK) ve
 * testin güncellenmesi zorunlu olacak.
 */
describe('settleDeadlines — İSKELET tetikleyicisi (W2-01 doldurunca KIRILIR)', () => {
  beforeEach(async () => {
    await connectDb()
    await Room.deleteOne({ code: CODE })
  })

  afterEach(async () => {
    await Room.deleteOne({ code: CODE })
  })

  it('süresi ÇOKTAN geçmiş bir oyunda bile null döner ve HİÇBİR ŞEY yazmaz', async () => {
    const past = new Date(Date.now() - 10 * 60 * 1000)
    await Room.create({
      code: CODE,
      state: 'playing',
      seats: { X: { userId: 'u1', name: 'Ada' }, O: { userId: 'u2', name: 'Kaan' } },
      turnDeadline: past,
      disconnected: { seat: 'O', at: past, graceEndsAt: past },
      version: 7,
    })

    await expect(settleDeadlines(CODE, Date.now())).resolves.toBeNull()

    const after = await Room.findOne({ code: CODE }).lean()
    // Çıplak sayı bilerek: sabitten türetilmiş beklenti bu dalı göremez.
    expect(after?.version).toBe(7)
    expect(after?.state).toBe('playing')
  })

  it('var olmayan oda için de fırlatmaz — WS oturumu her mesajda çağırıyor', async () => {
    await expect(settleDeadlines('YOKYOK', Date.now())).resolves.toBeNull()
  })
})
