import { describe, expect, it } from 'vitest'
import {
  errorResponseSchema,
  friendActionBodySchema,
  friendRequestBodySchema,
  friendsResponseSchema,
  leaderboardResponseSchema,
  matchesResponseSchema,
  mobileRefreshBodySchema,
  mobileTokenPairSchema,
  profileResponseSchema,
  profileUpdateBodySchema,
  registerBodySchema,
  registerResponseSchema,
  roomCreateResponseSchema,
  roomStateResponseSchema,
  wsTicketResponseSchema,
} from './rest-contract'

describe('POST /api/auth/register', () => {
  const gecerli = { email: 'omer@ornek.com', password: 'parola12', displayName: 'Ömer' }

  it('geçerli gövdeyi çözer ve e-postayı küçük harfe indirir', () => {
    const result = registerBodySchema.safeParse({ ...gecerli, email: 'Omer@Ornek.COM' })
    expect(result.success).toBe(true)
    expect(result.data?.email).toBe('omer@ornek.com')
  })

  it('geçersiz e-postayı reddeder (KK-003)', () => {
    expect(registerBodySchema.safeParse({ ...gecerli, email: 'omer(at)ornek' }).success).toBe(false)
  })

  it('8 karakterden kısa parolayı reddeder (KK-003)', () => {
    expect(registerBodySchema.safeParse({ ...gecerli, password: 'kisa12' }).success).toBe(false)
  })

  it('2–40 aralığı dışındaki görünen adı reddeder (KK-082)', () => {
    expect(registerBodySchema.safeParse({ ...gecerli, displayName: 'A' }).success).toBe(false)
    expect(registerBodySchema.safeParse({ ...gecerli, displayName: 'A'.repeat(41) }).success).toBe(
      false,
    )
  })

  it('görünen adın baştaki/sondaki boşluğunu kırpar', () => {
    expect(
      registerBodySchema.safeParse({ ...gecerli, displayName: '  Ömer  ' }).data?.displayName,
    ).toBe('Ömer')
  })

  it('201 yanıtı kullanıcı kimliği taşır', () => {
    expect(registerResponseSchema.safeParse({ userId: 'u1' }).success).toBe(true)
  })
})

describe('hata yanıtı', () => {
  it('enum kod + metin taşır', () => {
    expect(errorResponseSchema.safeParse({ code: 'EMAIL_TAKEN', message: 'kayıtlı' }).success).toBe(
      true,
    )
  })

  it('enum dışı kodu reddeder', () => {
    expect(errorResponseSchema.safeParse({ code: 'NOPE', message: 'x' }).success).toBe(false)
  })
})

describe('oda uç noktaları', () => {
  it('POST /api/rooms yanıtı oda kodu döner', () => {
    expect(roomCreateResponseSchema.safeParse({ code: 'AB2C3D' }).success).toBe(true)
    expect(roomCreateResponseSchema.safeParse({ code: 'ab2c3d' }).success).toBe(false)
  })

  it('GET /api/rooms/[code] yanıtı durum, koltuklar ve katılabilirlik taşır', () => {
    const result = roomStateResponseSchema.safeParse({
      code: 'AB2C3D',
      state: 'waiting',
      seats: { X: { userId: 'u1', name: 'Ömer' }, O: null },
      canJoin: true,
    })
    expect(result.success).toBe(true)
  })

  it('bilinmeyen oda durumunu reddeder', () => {
    expect(
      roomStateResponseSchema.safeParse({
        code: 'AB2C3D',
        state: 'paused',
        seats: { X: null, O: null },
        canJoin: true,
      }).success,
    ).toBe(false)
  })
})

describe('POST /api/ws/ticket', () => {
  it('bilet ve saniye cinsinden ömür döner', () => {
    expect(wsTicketResponseSchema.safeParse({ ticket: 'jwt', expiresIn: 30 }).success).toBe(true)
  })

  it('boş bileti reddeder', () => {
    expect(wsTicketResponseSchema.safeParse({ ticket: '', expiresIn: 30 }).success).toBe(false)
  })
})

describe('/api/profile', () => {
  it('GET yanıtı ad, e-posta, istatistik, puan ve temayı taşır', () => {
    const result = profileResponseSchema.safeParse({
      name: 'Ömer',
      email: 'omer@ornek.com',
      stats: { wins: 0, losses: 0, draws: 0 },
      elo: 1200,
      ratedGames: 0,
      theme: 'acik',
    })
    expect(result.success).toBe(true)
  })

  it('İngilizce tema değerini reddeder (KK-083 data-tema="koyu")', () => {
    expect(
      profileResponseSchema.safeParse({
        name: 'Ömer',
        email: 'omer@ornek.com',
        stats: { wins: 0, losses: 0, draws: 0 },
        elo: 1200,
        ratedGames: 0,
        theme: 'dark',
      }).success,
    ).toBe(false)
  })

  it('PATCH gövdesi yalnız ad ve temayı kabul eder, ikisi de isteğe bağlıdır', () => {
    expect(profileUpdateBodySchema.safeParse({}).success).toBe(true)
    expect(profileUpdateBodySchema.safeParse({ name: 'Ayşe' }).success).toBe(true)
    expect(profileUpdateBodySchema.safeParse({ theme: 'koyu' }).success).toBe(true)
    expect(profileUpdateBodySchema.safeParse({ name: 'A' }).success).toBe(false)
    expect(profileUpdateBodySchema.safeParse({ elo: 9999 }).success).toBe(false)
  })
})

describe('/api/leaderboard', () => {
  const satir = {
    rank: 1,
    userId: 'u1',
    name: 'Ömer',
    elo: 1240,
    wins: 4,
    losses: 1,
    draws: 0,
    ratedGames: 5,
  }

  it('ilk 50 satırı ve kullanıcının kendi satırını taşır (KK-115)', () => {
    expect(leaderboardResponseSchema.safeParse({ entries: [satir], you: satir }).success).toBe(true)
  })

  it('kendi satırı listede olan kullanıcı için null olabilir', () => {
    expect(leaderboardResponseSchema.safeParse({ entries: [], you: null }).success).toBe(true)
  })

  it('50 satırdan fazlasını reddeder', () => {
    const entries = Array.from({ length: 51 }, (_, i) => ({ ...satir, rank: i + 1 }))
    expect(leaderboardResponseSchema.safeParse({ entries, you: null }).success).toBe(false)
  })
})

describe('/api/matches', () => {
  const mac = {
    gameId: 'g1',
    finishedAt: 1_770_000_000_000,
    opponent: { userId: 'u2', name: 'Ayşe' },
    result: 'win',
    endReason: 'line',
    rated: true,
    eloDelta: 12,
  }

  it('son 20 oyunu taşır (KK-116)', () => {
    expect(matchesResponseSchema.safeParse({ matches: [mac] }).success).toBe(true)
  })

  it('puansız oyunda eloDelta null olabilir', () => {
    expect(
      matchesResponseSchema.safeParse({ matches: [{ ...mac, rated: false, eloDelta: null }] })
        .success,
    ).toBe(true)
  })

  it('bilinmeyen sonucu reddeder', () => {
    expect(
      matchesResponseSchema.safeParse({ matches: [{ ...mac, result: 'kazandi' }] }).success,
    ).toBe(false)
  })

  it('20 satırdan fazlasını reddeder', () => {
    const matches = Array.from({ length: 21 }, () => mac)
    expect(matchesResponseSchema.safeParse({ matches }).success).toBe(false)
  })
})

describe('/api/friends', () => {
  it('liste, gelen ve giden istekleri ayrı taşır', () => {
    const kisi = { userId: 'u2', name: 'Ayşe', elo: 1200 }
    expect(
      friendsResponseSchema.safeParse({ friends: [kisi], incoming: [kisi], outgoing: [] }).success,
    ).toBe(true)
  })

  it('POST gövdesi yalnız hedef kullanıcıyı taşır (KK-126)', () => {
    expect(friendRequestBodySchema.safeParse({ userId: 'u2' }).success).toBe(true)
    expect(friendRequestBodySchema.safeParse({ userId: '' }).success).toBe(false)
  })

  it('PATCH gövdesi kabul/ret aksiyonunu daraltır', () => {
    expect(friendActionBodySchema.safeParse({ userId: 'u2', action: 'accept' }).success).toBe(true)
    expect(friendActionBodySchema.safeParse({ userId: 'u2', action: 'reject' }).success).toBe(true)
    expect(friendActionBodySchema.safeParse({ userId: 'u2', action: 'sil' }).success).toBe(false)
  })
})

describe('POST /api/auth/mobile/refresh', () => {
  it('refresh token gövdesini çözer', () => {
    expect(mobileRefreshBodySchema.safeParse({ refresh: 'jwt' }).success).toBe(true)
    expect(mobileRefreshBodySchema.safeParse({ refresh: '' }).success).toBe(false)
  })

  it('yeni token çiftini döner (ADR-0005 döndürmeli refresh)', () => {
    expect(
      mobileTokenPairSchema.safeParse({ token: 'a', refresh: 'b', expiresIn: 900 }).success,
    ).toBe(true)
  })
})
