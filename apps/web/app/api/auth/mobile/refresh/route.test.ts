// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { connectDb, disconnectDb, loadEnvLocal, MobileRefreshToken } from '@xox/db'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

// `packages/db`'nin kendi `vitest.setup.ts`'i bu paketten koşmuyor — ortam
// yüklemesi ve `xox_test` zorlaması burada AÇIKÇA yapılır (bkz. conventions.md
// "Gerçek Atlas'a koşan testlerde MONGODB_DB KOŞULSUZ zorlanır"). Bu dosya
// `@/auth`ı HİÇ import etmiyor (`refresh` route'u yalnız `@/lib/auth/tokens`
// (jose, next-auth'suz) ve `@xox/db`ye bağımlı) — next-auth'un Vitest'te
// çalıştırılamaması sorunu burada hiç doğmuyor, hiçbir şey mock'lanmaz.
loadEnvLocal()
process.env['MONGODB_DB'] = 'xox_test'

/**
 * SEC-003'ün (`tickets.test.ts`) AYNI disiplini: `MobileRefreshToken`
 * gerçek Atlas'a (`xox_test`) yazılır/okunur, döndürmeli refresh'in atomik
 * `findOneAndDelete` temeli GERÇEK eşzamanlılıkla (`Promise.all`) sınanır.
 */
describe('POST /api/auth/mobile/refresh — döndürmeli (rotating) refresh, gerçek Atlas', () => {
  const createdUserIds: string[] = []

  beforeAll(async () => {
    await connectDb()
  })

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await MobileRefreshToken.deleteMany({ userId: { $in: createdUserIds } })
      createdUserIds.length = 0
    }
  })

  afterAll(async () => {
    await disconnectDb()
  })

  function makeRequest(refresh: string): Request {
    return new Request('https://xox.test/api/auth/mobile/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh }),
    })
  }

  async function issueRefreshFor(userId: string): Promise<string> {
    createdUserIds.push(userId)
    const { signToken } = await import('@/lib/auth/tokens')
    const jti = randomUUID()
    const { token } = await signToken('mobile-refresh', userId, { name: 'Test', jti })
    await MobileRefreshToken.create({
      jti,
      userId,
      expiresAt: new Date(Date.now() + 2_592_000_000),
    })
    return token
  }

  it('geçersiz gövde 400 INVALID_MESSAGE döner', async () => {
    const { POST } = await import('./route')
    const response = await POST(
      new Request('https://xox.test/api/auth/mobile/refresh', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_MESSAGE' })
  })

  it('bozuk imza/rastgele metin 401 UNAUTHENTICATED döner', async () => {
    const { POST } = await import('./route')
    const response = await POST(makeRequest('boyle-bir-token-yok'))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('access token (yanlış aud) refresh yerine geçmez — 401', async () => {
    const { signToken } = await import('@/lib/auth/tokens')
    const { token } = await signToken('mobile-access', 'kullanici-yanlis-aud')
    const { POST } = await import('./route')
    const response = await POST(makeRequest(token))
    expect(response.status).toBe(401)
  })

  it(
    'GEÇERLİ refresh: yeni { token, refresh, expiresIn } döner, YENİ jti farklıdır, ' +
      'eski jti DB kaydı SİLİNMİŞTİR',
    async () => {
      const userId = 'kullanici-donus-1'
      const oldRefresh = await issueRefreshFor(userId)

      const { POST } = await import('./route')
      const response = await POST(makeRequest(oldRefresh))

      expect(response.status).toBe(200)
      const body = (await response.json()) as { token: string; refresh: string; expiresIn: number }
      expect(body.expiresIn).toBe(900)
      expect(body.refresh).not.toBe(oldRefresh)

      const { verifyToken } = await import('@/lib/auth/tokens')
      const verifiedNewAccess = await verifyToken(body.token, 'mobile-access')
      const verifiedNewRefresh = await verifyToken(body.refresh, 'mobile-refresh')
      expect(verifiedNewAccess?.userId).toBe(userId)
      expect(verifiedNewRefresh?.userId).toBe(userId)

      const verifiedOldRefresh = await verifyToken(oldRefresh, 'mobile-refresh')
      const oldJti = verifiedOldRefresh?.claims['jti']
      expect(typeof oldJti).toBe('string')
      const stillThere = await MobileRefreshToken.findOne({ jti: oldJti as string }).lean()
      expect(stillThere).toBeNull()
    },
  )

  it(
    'YENİDEN KULLANIM TESPİTİ: aynı refresh token İKİNCİ kez gönderilince 401 alır ' +
      '(jti zaten silinmiş — döndürme atomik olduğu için ilk çağrı zaten tükettі)',
    async () => {
      const userId = 'kullanici-donus-2'
      const refresh = await issueRefreshFor(userId)

      const { POST } = await import('./route')
      const first = await POST(makeRequest(refresh))
      expect(first.status).toBe(200)
      const firstBody = (await first.json()) as { refresh: string }
      createdUserIds.push(userId)

      const replay = await POST(makeRequest(refresh))
      expect(replay.status).toBe(401)
      expect(await replay.json()).toMatchObject({ code: 'UNAUTHENTICATED' })

      // Yeni verilen refresh hâlâ çalışır — yalnız ESKİ jti yakıldı.
      const usingNew = await POST(makeRequest(firstBody.refresh))
      expect(usingNew.status).toBe(200)
    },
  )

  it(
    'YARIŞ KOŞULU: aynı refresh GERÇEKTEN eşzamanlı (Promise.all) iki kez gönderilince ' +
      'TAM OLARAK BİRİ 200, DİĞERİ 401 döner',
    async () => {
      const userId = 'kullanici-yaris-1'
      const refresh = await issueRefreshFor(userId)

      const { POST } = await import('./route')
      const [a, b] = await Promise.all([POST(makeRequest(refresh)), POST(makeRequest(refresh))])

      const statuses = [a.status, b.status].toSorted((x, y) => x - y)
      expect(statuses).toStrictEqual([200, 401])

      createdUserIds.push(userId)
    },
  )
})
