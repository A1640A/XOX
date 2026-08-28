import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { EMOJI_PALETTE } from './constants'
import { clientMessageSchema, serverMessageSchema, stateMessageSchema } from './ws-protocol'

const bosTahta = Array.from({ length: 9 }, () => null)

type Sekil = Record<string, z.ZodType>

/** Birliğin seçeneklerini `{ tip, shape }` olarak açar — liste elle yazılmaz. */
function secenekler(union: { options: readonly unknown[] }): { tip: string; shape: Sekil }[] {
  return union.options.map((secenek) => {
    const shape = (secenek as { shape: Sekil }).shape
    return { tip: (shape['type'] as unknown as z.ZodLiteral<string>).value, shape }
  })
}

/**
 * Her seçeneğin ZORUNLU alanlarını şemadan türetir: `[tip, alan]` çiftleri.
 * İsteğe bağlı alanlar (undefined'ı kabul edenler) elenir, böylece ileride
 * eklenecek opsiyonel bir alan testi yanlışlıkla kırmızıya döndürmez.
 * Yeni bir mesaj ya da alan eklendiğinde kapsam kendiliğinden gelir.
 */
function zorunluAlanCiftleri(union: { options: readonly unknown[] }): [string, string][] {
  return secenekler(union).flatMap(({ tip, shape }) =>
    Object.entries(shape)
      .filter(([alan, sema]) => alan !== 'type' && !sema.safeParse(undefined).success)
      .map(([alan]): [string, string] => [tip, alan]),
  )
}

function alanSil(ornek: Record<string, unknown>, alan: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(ornek).filter(([k]) => k !== alan))
}

/** Tip -> zorunlu alanlar (şemadan türetilmiş, `type` hariç, sıralı). */
function zorunluAlanHaritasi(union: { options: readonly unknown[] }): Record<string, string[]> {
  return Object.fromEntries(
    secenekler(union).map(({ tip, shape }) => [
      tip,
      Object.entries(shape)
        .filter(([alan, sema]) => alan !== 'type' && !sema.safeParse(undefined).success)
        .map(([alan]) => alan)
        .sort(),
    ]),
  )
}

const gecerliState = {
  type: 'state',
  roomCode: 'AB2C3D',
  board: bosTahta,
  status: { kind: 'playing', turn: 'X' },
  players: { X: { userId: 'u1', name: 'Ömer' }, O: null },
  you: 'X',
  version: 1,
  turnDeadline: null,
  graceEndsAt: null,
  rematch: null,
  serverTime: 1_770_000_000_000,
  size: 3,
  winLength: 3,
  lastMove: null,
}

const gecerliIstemciMesajlari: Record<string, Record<string, unknown>> = {
  join: { type: 'join', roomCode: 'AB2C3D' },
  move: { type: 'move', index: 4 },
  resign: { type: 'resign' },
  'rematch:offer': { type: 'rematch:offer' },
  'rematch:accept': { type: 'rematch:accept' },
  'chat:emoji': { type: 'chat:emoji', emoji: '👋' },
  ping: { type: 'ping' },
}

const gecerliMesajlar: Record<string, Record<string, unknown>> = {
  state: gecerliState,
  'move:applied': { type: 'move:applied', index: 4, by: 'X', version: 2 },
  'move:rejected': { type: 'move:rejected', index: 4, reason: 'not-your-turn' },
  'opponent:joined': { type: 'opponent:joined', userId: 'u2', seat: 'O', name: 'Ayşe' },
  'opponent:left': {
    type: 'opponent:left',
    userId: 'u2',
    seat: 'O',
    graceEndsAt: 1_770_000_030_000,
  },
  'opponent:returned': { type: 'opponent:returned', seat: 'O' },
  'game:over': {
    type: 'game:over',
    status: { kind: 'won', winner: 'O', line: null, reason: 'resign' },
    endedAt: 1_770_000_010_000,
  },
  'rematch:offered': { type: 'rematch:offered', by: 'X', expiresAt: 1_770_000_060_000 },
  'rematch:cancelled': { type: 'rematch:cancelled', reason: 'opponent-left' },
  'chat:emoji': { type: 'chat:emoji', from: 'X', emoji: '👋', at: 1_770_000_005_000 },
  error: { type: 'error', code: 'ROOM_FULL', message: 'Bu oda dolu.' },
  pong: { type: 'pong' },
}

describe('clientMessageSchema', () => {
  it('yedi istemci mesaj tipi tanımlar', () => {
    expect(clientMessageSchema.options.map((o) => o.shape.type.value)).toEqual([
      'join',
      'move',
      'resign',
      'rematch:offer',
      'rematch:accept',
      'chat:emoji',
      'ping',
    ])
  })

  it('geçerli join mesajını çözer', () => {
    expect(clientMessageSchema.safeParse({ type: 'join', roomCode: 'AB2C3D' }).success).toBe(true)
  })

  it('aralık dışı hamle indeksini reddeder (CTR-BOARD-001: tavan 120)', () => {
    expect(clientMessageSchema.safeParse({ type: 'move', index: 121 }).success).toBe(false)
    expect(clientMessageSchema.safeParse({ type: 'move', index: -1 }).success).toBe(false)
  })

  it('0..120 aralığındaki hamle indeksini kabul eder (11×11 dahil)', () => {
    expect(clientMessageSchema.safeParse({ type: 'move', index: 9 }).success).toBe(true)
    expect(clientMessageSchema.safeParse({ type: 'move', index: 120 }).success).toBe(true)
  })

  it('tam sayı olmayan hamle indeksini reddeder', () => {
    expect(clientMessageSchema.safeParse({ type: 'move', index: 1.5 }).success).toBe(false)
  })

  it('bilinmeyen mesaj tipini reddeder', () => {
    expect(clientMessageSchema.safeParse({ type: 'hack' }).success).toBe(false)
  })

  it('palet içindeki emojiyi kabul eder', () => {
    for (const emoji of EMOJI_PALETTE) {
      expect(clientMessageSchema.safeParse({ type: 'chat:emoji', emoji }).success).toBe(true)
    }
  })

  it('palet dışı emojiyi ve serbest metni reddeder (KK-123)', () => {
    expect(clientMessageSchema.safeParse({ type: 'chat:emoji', emoji: '💀' }).success).toBe(false)
    expect(clientMessageSchema.safeParse({ type: 'chat:emoji', emoji: '<script>' }).success).toBe(
      false,
    )
  })

  it('her istemci mesajının zorunlu alan kümesi sabittir', () => {
    expect(zorunluAlanHaritasi(clientMessageSchema)).toEqual({
      join: ['roomCode'],
      move: ['index'],
      resign: [],
      'rematch:offer': [],
      'rematch:accept': [],
      'chat:emoji': ['emoji'],
      ping: [],
    })
  })

  it('her istemci mesaj tipi için örnek payload vardır', () => {
    expect(secenekler(clientMessageSchema).map((s) => s.tip)).toEqual(
      Object.keys(gecerliIstemciMesajlari),
    )
  })

  it.each(Object.keys(gecerliIstemciMesajlari))('%s mesajını çözer', (tip) => {
    expect(clientMessageSchema.safeParse(gecerliIstemciMesajlari[tip]).success).toBe(true)
  })

  it.each(zorunluAlanCiftleri(clientMessageSchema))(
    '%s mesajında %s eksikse reddedilir',
    (tip, alan) => {
      const ornek = gecerliIstemciMesajlari[tip] ?? {}
      expect(alan in ornek).toBe(true)
      expect(clientMessageSchema.safeParse(alanSil(ornek, alan)).success).toBe(false)
    },
  )
})

describe('stateMessageSchema (tasarım §2.4)', () => {
  it('tüm alanlarıyla geçerli state mesajını çözer', () => {
    expect(stateMessageSchema.safeParse(gecerliState).success).toBe(true)
  })

  it('koltuk sahibinin adı boş olamaz', () => {
    expect(
      stateMessageSchema.safeParse({
        ...gecerliState,
        players: { X: { userId: 'u1', name: '' }, O: null },
      }).success,
    ).toBe(false)
  })

  it('dolu koltukları, süre hedeflerini ve rövanş teklifini taşır', () => {
    const result = stateMessageSchema.safeParse({
      ...gecerliState,
      players: { X: { userId: 'u1', name: 'Ömer' }, O: { userId: 'u2', name: 'Ayşe' } },
      you: 'O',
      status: { kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' },
      turnDeadline: 1_770_000_060_000,
      graceEndsAt: 1_770_000_030_000,
      rematch: { by: 'X', expiresAt: 1_770_000_060_000 },
    })
    expect(result.success).toBe(true)
  })

  it('tutarsız durum değişmezini mesaj seviyesinde de reddeder', () => {
    expect(
      stateMessageSchema.safeParse({
        ...gecerliState,
        status: { kind: 'won', winner: 'X', line: null, reason: 'line' },
      }).success,
    ).toBe(false)
  })

  it('negatif sürümü reddeder', () => {
    expect(stateMessageSchema.safeParse({ ...gecerliState, version: -1 }).success).toBe(false)
  })

  it('dokuz hücreden farklı tahtayı reddeder', () => {
    expect(stateMessageSchema.safeParse({ ...gecerliState, board: [null, null] }).success).toBe(
      false,
    )
  })

  it('11×11 tahtayı (121 hücre) size:11/winLength:5 ile kabul eder', () => {
    const buyukTahta = Array.from({ length: 121 }, () => null)
    expect(
      stateMessageSchema.safeParse({
        ...gecerliState,
        board: buyukTahta,
        size: 11,
        winLength: 5,
      }).success,
    ).toBe(true)
  })

  it('bilinmeyen boyutu ve aralık dışı K değerini reddeder (SB-10)', () => {
    expect(stateMessageSchema.safeParse({ ...gecerliState, size: 4 }).success).toBe(false)
    expect(stateMessageSchema.safeParse({ ...gecerliState, winLength: 2 }).success).toBe(false)
    expect(stateMessageSchema.safeParse({ ...gecerliState, winLength: 7 }).success).toBe(false)
  })

  it('size ve winLength zorunludur — eksikse reddeder', () => {
    expect(stateMessageSchema.safeParse({ ...gecerliState, size: undefined }).success).toBe(false)
    expect(stateMessageSchema.safeParse({ ...gecerliState, winLength: undefined }).success).toBe(
      false,
    )
  })

  it('lastMove null olabilir (henüz hamle yok) ya da {index, by} taşır (ADR-0015 §3, KK-B55)', () => {
    expect(stateMessageSchema.safeParse({ ...gecerliState, lastMove: null }).success).toBe(true)
    expect(
      stateMessageSchema.safeParse({ ...gecerliState, lastMove: { index: 4, by: 'X' } }).success,
    ).toBe(true)
  })

  it('lastMove eksik alanla ya da aralık dışı indeksle reddedilir', () => {
    expect(stateMessageSchema.safeParse({ ...gecerliState, lastMove: { index: 4 } }).success).toBe(
      false,
    )
    expect(stateMessageSchema.safeParse({ ...gecerliState, lastMove: { by: 'X' } }).success).toBe(
      false,
    )
    expect(
      stateMessageSchema.safeParse({ ...gecerliState, lastMove: { index: 121, by: 'X' } }).success,
    ).toBe(false)
  })

  it('lastMove zorunlu bir alandır (undefined kabul etmez) — silinirse KAYBOLUR (Z2 rotasyonu)', () => {
    expect(stateMessageSchema.safeParse({ ...gecerliState, lastMove: undefined }).success).toBe(
      false,
    )
  })
})

/**
 * CTR-BOARD-001 — TÜKETİCİ SONDASI (ADR-0015 §7, kartın kabul kriteri).
 *
 * Bu iki liste tasarım dokümanının §3.2 alan tablosundan ELLE KOPYALANDI.
 * `Object.keys(stateMessageSchema.shape)` ya da `z.infer` üzerinden ÜRETİLMEDİ —
 * kendine-referanslı bir liste şemadan bir alan SİLİNDİĞİNDE bunu göremez
 * (gotcha örüntü 2). Üstteki `zorunluAlanHaritasi(serverMessageSchema)` testi
 * şemadan türetilmiş BİRİNCİ katmandır; bu blok tasarım dokümanından gelen
 * bağımsız İKİNCİ katmandır. Amaç: `CTR-BOARD-001` kapandıktan sonra
 * `DB-BOARD-001`/`UI-BOARD-001`/`API-BOARD-001` yazılırken bir alan eksik
 * kalırsa (CTR-001'in kanıtlanmış kusuru — CTR-003) bunu BURADA yakalamak.
 */
describe('CTR-BOARD-001 — tüketici sondası (ADR-0015 §7, tasarım §3.2)', () => {
  // Oda ekranının `state`'ten okuduğu HER alan — tasarım §3.2'den elle kopyalandı.
  const odaEkraninınOkudugu = [
    'type',
    'roomCode',
    'board',
    'status',
    'players',
    'you',
    'version',
    'turnDeadline',
    'graceEndsAt',
    'rematch',
    'serverTime',
    'size',
    'winLength',
    'lastMove',
  ]

  it('oda ekranının okuduğu her alan state mesajında VARDIR (14 alan)', () => {
    expect(odaEkraninınOkudugu).toHaveLength(14)
    // `gecerliState` bu dosyanın en üstünde ELLE yazılmış bağımsız bir örnektir
    // (şemadan üretilmemiştir). Şema bir alanı SESSİZCE KIRPARSA (zod'un
    // varsayılan davranışı — gotcha örüntü 2) `state.data`'da o alan kalmaz ve
    // aşağıdaki `hasOwnProperty` iddiası kırmızı olur.
    const state = stateMessageSchema.safeParse(gecerliState)
    expect(state.success).toBe(true)
    if (!state.success) return
    for (const alan of odaEkraninınOkudugu) {
      expect(Object.prototype.hasOwnProperty.call(state.data, alan)).toBe(true)
    }
  })
})

describe('serverMessageSchema', () => {
  it('state dahil on iki sunucu mesajı tanımlar (§2.4 + §2.5)', () => {
    expect(serverMessageSchema.options.map((o) => o.shape.type.value)).toEqual([
      'state',
      'move:applied',
      'move:rejected',
      'opponent:joined',
      'opponent:left',
      'opponent:returned',
      'game:over',
      'rematch:offered',
      'rematch:cancelled',
      'chat:emoji',
      'error',
      'pong',
    ])
  })

  /**
   * Türetilmiş silme testleri bir alanın GERÇEKTEN zorunlu olduğunu kanıtlar,
   * ama alan şemadan silinirse birlikte kaybolur (sonda ile ölçüldü: silme
   * testi de yok olur, koşu yeşil kalır). Bu tablo o boşluğu kapatır —
   * tasarım §2.4/§2.5'in alan listesi elle yazılıdır, sapma kırmızıdır.
   */
  it('her mesajın zorunlu alan kümesi tasarım §2.4/§2.5 ile birebir', () => {
    expect(zorunluAlanHaritasi(serverMessageSchema)).toEqual({
      state: [
        'board',
        'graceEndsAt',
        'lastMove',
        'players',
        'rematch',
        'roomCode',
        'serverTime',
        'size',
        'status',
        'turnDeadline',
        'version',
        'winLength',
        'you',
      ],
      'move:applied': ['by', 'index', 'version'],
      'move:rejected': ['index', 'reason'],
      'opponent:joined': ['name', 'seat', 'userId'],
      'opponent:left': ['graceEndsAt', 'seat', 'userId'],
      'opponent:returned': ['seat'],
      'game:over': ['endedAt', 'status'],
      'rematch:offered': ['by', 'expiresAt'],
      'rematch:cancelled': ['reason'],
      'chat:emoji': ['at', 'emoji', 'from'],
      error: ['code', 'message'],
      pong: [],
    })
  })

  it('her sunucu mesaj tipi için örnek payload vardır', () => {
    expect(secenekler(serverMessageSchema).map((s) => s.tip)).toEqual(Object.keys(gecerliMesajlar))
  })

  it.each(Object.keys(gecerliMesajlar))('%s mesajını çözer', (tip) => {
    const result = serverMessageSchema.safeParse(gecerliMesajlar[tip])
    expect(result.success).toBe(true)
  })

  /**
   * Mutlu yol tek başına yetmez: zod fazla anahtarı sessizce kırptığı için
   * şemadan bir alan silinse (`move:applied.version` gibi) mutlu-yol testi
   * yeşil kalırdı. Çiftler şemadan türetildiği için yeni mesaj/alan eklendiğinde
   * bu kapsam kendiliğinden genişler.
   */
  it.each(zorunluAlanCiftleri(serverMessageSchema))(
    '%s mesajında %s eksikse reddedilir',
    (tip, alan) => {
      const ornek = gecerliMesajlar[tip] ?? {}
      expect(alan in ornek).toBe(true)
      expect(serverMessageSchema.safeParse(alanSil(ornek, alan)).success).toBe(false)
    },
  )

  it('move:rejected serbest metin sebebi kabul etmez (B8)', () => {
    expect(
      serverMessageSchema.safeParse({ type: 'move:rejected', index: 0, reason: 'notYourTurn' })
        .success,
    ).toBe(false)
  })

  it('opponent:left grace hedefi null olabilir', () => {
    expect(
      serverMessageSchema.safeParse({
        type: 'opponent:left',
        userId: 'u2',
        seat: 'O',
        graceEndsAt: null,
      }).success,
    ).toBe(true)
  })

  it('rematch:cancelled yalnız iki sebebi tanır', () => {
    expect(
      serverMessageSchema.safeParse({ type: 'rematch:cancelled', reason: 'expired' }).success,
    ).toBe(true)
    expect(
      serverMessageSchema.safeParse({ type: 'rematch:cancelled', reason: 'canim-istedi' }).success,
    ).toBe(false)
  })

  it('error yalnız enum kodu kabul eder', () => {
    expect(
      serverMessageSchema.safeParse({ type: 'error', code: 'BILINMEYEN', message: 'x' }).success,
    ).toBe(false)
  })

  it('game:over durumundaki değişmezi dayatır', () => {
    expect(
      serverMessageSchema.safeParse({
        type: 'game:over',
        status: { kind: 'won', winner: 'O', line: [0, 1, 2], reason: 'timeout' },
        endedAt: 1,
      }).success,
    ).toBe(false)
  })

  it('bilinmeyen sunucu mesajını reddeder', () => {
    expect(serverMessageSchema.safeParse({ type: 'kaboom' }).success).toBe(false)
  })
})

/**
 * CTR-004 — `move:applied` artık `turnDeadline` TAŞIR.
 *
 * Alan OPSİYONELDİR, bu yüzden yukarıdaki `zorunluAlanHaritasi` tablosu onu
 * GÖREMEZ (`zorunluAlanCiftleri` isteğe bağlı alanları bilerek eler). Şemadan
 * silinirse orayı KIRMAZ — kilit bu bloktur, silinmemeli.
 */
describe('CTR-004 — move:applied.turnDeadline (§2.5 genişletme)', () => {
  const yanki = { type: 'move:applied', index: 4, by: 'X', version: 2 } as const

  it('epoch ms hedefi taşır ve KIRPILMAZ', () => {
    const sonuc = serverMessageSchema.safeParse({ ...yanki, turnDeadline: 1_770_000_060_000 })
    expect(sonuc.success).toBe(true)
    if (!sonuc.success) return
    expect(sonuc.data).toStrictEqual({ ...yanki, turnDeadline: 1_770_000_060_000 })
  })

  it('null olabilir — hamle oyunu bitirdiğinde sayaç durur', () => {
    const sonuc = serverMessageSchema.safeParse({ ...yanki, turnDeadline: null })
    expect(sonuc.success).toBe(true)
    if (!sonuc.success) return
    expect(sonuc.data).toStrictEqual({ ...yanki, turnDeadline: null })
  })

  it('OPSİYONELDİR — alanı hiç göndermeyen ESKİ sunucunun çerçevesi geçerli kalır', () => {
    const sonuc = serverMessageSchema.safeParse(yanki)
    expect(sonuc.success).toBe(true)
    if (!sonuc.success) return
    expect(Object.prototype.hasOwnProperty.call(sonuc.data, 'turnDeadline')).toBe(false)
  })

  it('kesirli sayıyı, metni ve undefined DIŞI çöpü reddeder', () => {
    expect(serverMessageSchema.safeParse({ ...yanki, turnDeadline: 1.5 }).success).toBe(false)
    expect(serverMessageSchema.safeParse({ ...yanki, turnDeadline: '1770000060000' }).success).toBe(
      false,
    )
    expect(serverMessageSchema.safeParse({ ...yanki, turnDeadline: {} }).success).toBe(false)
  })

  /**
   * GERİYE DÖNÜK UYUMLULUK KANITI. `eskiIstemciSemasi` CTR-004 ÖNCESİ
   * `move:applied` şeklinin elle yazılmış kopyasıdır — `ws-protocol.ts`'ten
   * TÜRETİLMEZ (türetilseydi yeni alanla birlikte büyür ve hiçbir şey
   * kanıtlamazdı). Sürüm atlamış bir mobil istemci bu şemayla ayrıştırır.
   */
  it('ESKİ İSTEMCİ KIRILMAZ — yeni alanı sessizce kırpar, dört alanı aynen okur', () => {
    const eskiIstemciSemasi = z.object({
      type: z.literal('move:applied'),
      index: z.number().int().min(0).max(120),
      by: z.enum(['X', 'O']),
      version: z.number().int().nonnegative(),
    })

    const sonuc = eskiIstemciSemasi.safeParse({ ...yanki, turnDeadline: 1_770_000_060_000 })
    expect(sonuc.success).toBe(true)
    if (!sonuc.success) return
    expect(sonuc.data).toStrictEqual(yanki)
  })
})
