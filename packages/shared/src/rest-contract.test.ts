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
  roomCreateBodySchema,
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

  it('128 karakteri kabul eder, 129 karakteri reddeder — argon2id DoS yüzeyi', () => {
    expect(registerBodySchema.safeParse({ ...gecerli, password: 'p'.repeat(128) }).success).toBe(
      true,
    )
    expect(registerBodySchema.safeParse({ ...gecerli, password: 'p'.repeat(129) }).success).toBe(
      false,
    )
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

  it('GET /api/rooms/[code] yanıtı durum, koltuklar, katılabilirlik VE boyut/K taşır (SB-09, US-B03)', () => {
    const result = roomStateResponseSchema.safeParse({
      code: 'AB2C3D',
      state: 'waiting',
      seats: { X: { userId: 'u1', name: 'Ömer' }, O: null },
      canJoin: true,
      size: 11,
      winLength: 5,
    })
    expect(result.success).toBe(true)
  })

  it('size veya winLength eksikse reddeder (CTR-BOARD-001 tüketici sondası)', () => {
    const taban = {
      code: 'AB2C3D',
      state: 'waiting' as const,
      seats: { X: null, O: null },
      canJoin: true,
      size: 3 as const,
      winLength: 3,
    }
    expect(roomStateResponseSchema.safeParse({ ...taban, size: undefined }).success).toBe(false)
    expect(roomStateResponseSchema.safeParse({ ...taban, winLength: undefined }).success).toBe(
      false,
    )
  })

  it('bilinmeyen boyutu reddeder', () => {
    expect(
      roomStateResponseSchema.safeParse({
        code: 'AB2C3D',
        state: 'waiting',
        seats: { X: null, O: null },
        canJoin: true,
        size: 9,
        winLength: 3,
      }).success,
    ).toBe(false)
  })

  it('canJoin değişmezi: yalnız waiting + boş koltuk varsa true', () => {
    const dolu = { X: { userId: 'u1', name: 'Ömer' }, O: { userId: 'u2', name: 'Ayşe' } }
    // Bitmiş + iki koltuk dolu ama canJoin:true — reviewer'ın gösterdiği açık.
    expect(
      roomStateResponseSchema.safeParse({
        code: 'AB2C3D',
        state: 'finished',
        seats: dolu,
        canJoin: true,
        size: 3,
        winLength: 3,
      }).success,
    ).toBe(false)
    // Ters yön: katılınabilir oda canJoin:false diyemez.
    expect(
      roomStateResponseSchema.safeParse({
        code: 'AB2C3D',
        state: 'waiting',
        seats: { X: { userId: 'u1', name: 'Ömer' }, O: null },
        canJoin: false,
        size: 3,
        winLength: 3,
      }).success,
    ).toBe(false)
    // Oynanan oda: koltuklar dolu, katılınamaz.
    expect(
      roomStateResponseSchema.safeParse({
        code: 'AB2C3D',
        state: 'playing',
        seats: dolu,
        canJoin: false,
        size: 3,
        winLength: 3,
      }).success,
    ).toBe(true)
  })

  it('bilinmeyen oda durumunu reddeder', () => {
    expect(
      roomStateResponseSchema.safeParse({
        code: 'AB2C3D',
        state: 'paused',
        seats: { X: null, O: null },
        canJoin: true,
        size: 3,
        winLength: 3,
      }).success,
    ).toBe(false)
  })
})

/**
 * CTR-BOARD-001 — TÜKETİCİ SONDASI (ADR-0015 §7, kartın kabul kriteri).
 *
 * Katılma ekranının okuduğu alan listesi tasarımın §3.2 tablosundan ELLE
 * KOPYALANDI; `Object.keys(roomStateResponseSchema.shape)` ya da `z.infer`
 * üzerinden ÜRETİLMEDİ (gotcha örüntü 2 — kendine-referanslı liste silmeyi
 * göremez). `gecerliYanit` bu bloğun DIŞINDAN, bağımsız yazılmış bir örnektir.
 */
describe('CTR-BOARD-001 — tüketici sondası (ADR-0015 §7, tasarım §3.2)', () => {
  const katilmaEkraninınOkudugu = ['code', 'state', 'seats', 'canJoin', 'size', 'winLength']

  const gecerliYanit = {
    code: 'AB2C3D',
    state: 'waiting' as const,
    seats: { X: { userId: 'u1', name: 'Ömer' }, O: null },
    canJoin: true,
    size: 11 as const,
    winLength: 5,
  }

  it('katılma ekranının okuduğu her alan roomStateResponse’ta VARDIR (6 alan)', () => {
    expect(katilmaEkraninınOkudugu).toHaveLength(6)
    const sonuc = roomStateResponseSchema.safeParse(gecerliYanit)
    expect(sonuc.success).toBe(true)
    if (!sonuc.success) return
    for (const alan of katilmaEkraninınOkudugu) {
      expect(Object.prototype.hasOwnProperty.call(sonuc.data, alan)).toBe(true)
    }
  })

  it.each(katilmaEkraninınOkudugu.filter((alan) => alan !== 'canJoin'))(
    '%s eksiltilince şema REDDEDER',
    (alan) => {
      const bozuk = Object.fromEntries(
        Object.entries(gecerliYanit).filter(([anahtar]) => anahtar !== alan),
      )
      expect(roomStateResponseSchema.safeParse(bozuk).success).toBe(false)
    },
  )
})

describe('POST /api/rooms gövdesi (KK-B14/B15, ADR-0015 §2)', () => {
  it('boş nesneyi kabul eder — bugünkü davranış bit düzeyinde korunur', () => {
    // `req.json()` patlarsa route `{}`'e düşer (tasarım §5.1); şemanın işi
    // yalnız NESNEYİ doğrulamaktır — ham `undefined`'ı kabul ETMEZ, çağıran
    // (route) bu dönüşümü kendisi yapar.
    expect(roomCreateBodySchema.safeParse({}).success).toBe(true)
  })

  it('yalnız size verilirse kabul eder (winLength opsiyonel)', () => {
    expect(roomCreateBodySchema.safeParse({ size: 11 }).success).toBe(true)
  })

  it('geçerli size+winLength çiftini kabul eder', () => {
    expect(roomCreateBodySchema.safeParse({ size: 6, winLength: 4 }).success).toBe(true)
  })

  it('bilinmeyen boyutu ve aralık dışı K değerini reddeder', () => {
    expect(roomCreateBodySchema.safeParse({ size: 4 }).success).toBe(false)
    expect(roomCreateBodySchema.safeParse({ size: 6, winLength: 2 }).success).toBe(false)
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

  it('puanlı oyunda eloDelta null OLAMAZ (KK-116 "—" yanılgısı)', () => {
    expect(
      matchesResponseSchema.safeParse({ matches: [{ ...mac, rated: true, eloDelta: null }] })
        .success,
    ).toBe(false)
  })

  it('puansız oyunda eloDelta dolu OLAMAZ', () => {
    expect(
      matchesResponseSchema.safeParse({ matches: [{ ...mac, rated: false, eloDelta: 12 }] })
        .success,
    ).toBe(false)
  })

  it('beraberlikte sıfır delta puanlı kalır (KK-111)', () => {
    expect(
      matchesResponseSchema.safeParse({
        matches: [{ ...mac, result: 'draw', rated: true, eloDelta: 0 }],
      }).success,
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
