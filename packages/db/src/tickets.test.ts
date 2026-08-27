import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectDb, disconnectDb } from './client'
import { WsTicket } from './models/ws-ticket'
import { consumeWsTicket, recordWsTicket, revokeWsTicketsForUser } from './tickets'

describe('WS bileti tek-kullanımlık tüketimi (SEC-003)', () => {
  const createdJtis: string[] = []

  beforeAll(async () => {
    await connectDb()
    await WsTicket.syncIndexes()
  })

  afterEach(async () => {
    if (createdJtis.length > 0) {
      await WsTicket.deleteMany({ jti: { $in: createdJtis } })
      createdJtis.length = 0
    }
  })

  afterAll(async () => {
    await disconnectDb()
  })

  function freshJti(): string {
    return track(randomUUID())
  }

  function track(jti: string): string {
    createdJtis.push(jti)
    return jti
  }

  async function issue(
    overrides: Partial<{ jti: string; userId: string; room: string; ttlMs: number }> = {},
  ) {
    const jti = overrides.jti ?? freshJti()
    const ttlMs = overrides.ttlMs ?? 30_000
    await recordWsTicket({
      jti,
      userId: overrides.userId ?? 'user-1',
      room: overrides.room ?? 'ABC234',
      expiresAt: new Date(Date.now() + ttlMs),
    })
    return jti
  }

  it('ilk tüketim ok:true döner ve dokümanda usedAt dolar', async () => {
    const jti = await issue()

    const result = await consumeWsTicket(jti)

    expect(result).toStrictEqual({ ok: true })
    const found = await WsTicket.findOne({ jti }).lean()
    expect(found?.usedAt).not.toBeNull()
  })

  it('İKİNCİ kullanım reddedilir: aynı bilet iki kez ARDIŞIK tüketilince ilki çalışır, ikincisi ok:false/already-used döner', async () => {
    const jti = await issue()

    const first = await consumeWsTicket(jti)
    const second = await consumeWsTicket(jti)

    expect(first).toStrictEqual({ ok: true })
    expect(second).toStrictEqual({ ok: false, reason: 'already-used' })
  })

  it(
    'YARIŞ KOŞULU ÇEKİRDEĞİ: aynı jti GERÇEKTEN eşzamanlı (Promise.all) iki kez ' +
      'tüketilince TAM OLARAK BİRİ ok:true, DİĞERİ ok:false/already-used döner ' +
      '— atomik findOneAndUpdate sıralı iki çağrıyla değil, GERÇEK eşzamanlılıkla sınanır',
    async () => {
      const jti = await issue()

      const [a, b] = await Promise.all([consumeWsTicket(jti), consumeWsTicket(jti)])

      const succeeded = [a, b].filter((r) => r.ok)
      const failed = [a, b].filter((r) => !r.ok)
      expect(succeeded).toHaveLength(1)
      expect(failed).toHaveLength(1)
      expect(failed[0]).toStrictEqual({ ok: false, reason: 'already-used' })

      // Doküman TEK bir usedAt taşır — iki yazma da geçmiş olsaydı bu hâlâ
      // doğru olurdu, asıl kanıt yukarıdaki 1/1 dağılımı.
      const found = await WsTicket.findOne({ jti }).lean()
      expect(found?.usedAt).not.toBeNull()
    },
  )

  it('var olmayan bir jti ok:false/not-found döner', async () => {
    const result = await consumeWsTicket(randomUUID())
    expect(result).toStrictEqual({ ok: false, reason: 'not-found' })
  })

  it('süresi dolmuş (expiresAt geçmişte) bilet ok:false/expired döner ve usedAt YAZILMAZ', async () => {
    const jti = freshJti()
    await recordWsTicket({
      jti,
      userId: 'user-1',
      room: 'ABC234',
      expiresAt: new Date(Date.now() - 1000),
    })

    const result = await consumeWsTicket(jti)

    expect(result).toStrictEqual({ ok: false, reason: 'expired' })
    const found = await WsTicket.findOne({ jti }).lean()
    expect(found?.usedAt).toBeNull()
  })

  describe('revokeWsTicketsForUser — signOut temizliği', () => {
    it('kullanıcının tüketilmemiş biletlerini işaretler ve sayısını döner', async () => {
      const jtiA = await issue({ userId: 'cikis-kullanicisi' })
      const jtiB = await issue({ userId: 'cikis-kullanicisi' })

      const revoked = await revokeWsTicketsForUser('cikis-kullanicisi')

      expect(revoked).toBe(2)
      const afterA = await consumeWsTicket(jtiA)
      const afterB = await consumeWsTicket(jtiB)
      expect(afterA).toStrictEqual({ ok: false, reason: 'already-used' })
      expect(afterB).toStrictEqual({ ok: false, reason: 'already-used' })
    })

    it('BAŞKA kullanıcının biletlerine DOKUNMAZ', async () => {
      const jtiMasum = await issue({ userId: 'masum-kullanici' })
      await issue({ userId: 'cikis-yapan' })

      await revokeWsTicketsForUser('cikis-yapan')

      const stillUsable = await consumeWsTicket(jtiMasum)
      expect(stillUsable).toStrictEqual({ ok: true })
    })

    it('zaten TÜKETİLMİŞ bir bileti ikinci kez işaretlemez (modifiedCount buna göre sayılır)', async () => {
      const jti = await issue({ userId: 'zaten-tuketen' })
      await consumeWsTicket(jti)

      const revoked = await revokeWsTicketsForUser('zaten-tuketen')

      expect(revoked).toBe(0)
    })
  })
})
