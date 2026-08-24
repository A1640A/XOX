import { describe, expect, it } from 'vitest'
import { MESSAGE_KEYS, diffMessageKeys, errorCodeSchema, type ErrorCode } from '@xox/shared'
import { tr } from './tr'
import { tr as trMobil } from '../../mobile/messages/tr'

/**
 * TXT-001 — bu dosya `apps/web/messages/tr.ts`'i DIŞ kaynağa karşı doğrular.
 * Beklenen anahtar listesi `tr.ts`'in kendisinden TÜRETİLMEZ; kaynak
 * `@xox/shared` (CTR-001 ürünü, dondu). Böylece bir anahtar `tr.ts`'ten
 * silinirse ya da fazladan eklenirse bu test kırmızı olur — kendine-referanslı
 * bir test bunu göremezdi.
 */
describe('tr.ts — @xox/shared/message-keys ile parite (iki yönlü)', () => {
  it('eksik ya da fazla anahtar yok', () => {
    expect(diffMessageKeys(tr)).toEqual({ missing: [], extra: [] })
  })

  it('grup kümesi MESSAGE_KEYS ile birebir aynı', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(MESSAGE_KEYS).sort())
  })
})

describe('tr.errors — errorCodeSchema ile parite (dış kaynak, iki yönlü)', () => {
  const kodlar = errorCodeSchema.options

  it('errorCodeSchema’daki 20 kodun tamamı tr.errors’ta karşılık bulur', () => {
    const eksik = kodlar.filter((kod) => !(kod in tr.errors))
    expect(eksik).toEqual([])
  })

  it('tr.errors’ta errorCodeSchema dışı fazla kod yok', () => {
    const fazla = (Object.keys(tr.errors) as ErrorCode[]).filter((kod) => !kodlar.includes(kod))
    expect(fazla).toEqual([])
  })

  it('kod sayısı tam 20 — hem şemada hem metin ağacında', () => {
    expect(kodlar.length).toBe(20)
    expect(Object.keys(tr.errors).length).toBe(20)
  })
})

/** Ağaçtaki her yaprağı `grup.anahtar` -> metin biçiminde düzleştirir. */
function flatten(node: unknown, path: string[] = []): [string, string][] {
  if (typeof node === 'string') return [[path.join('.'), node]]
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, [...path, k]),
  )
}

describe('Ton kuralı — "siz" hitabı yasak, ikinci tekil şahıs zorunlu (spec §5)', () => {
  // Hem çıplak "siz" kelimesini hem resmi ikinci-çoğul-şahıs fiil eklerini
  // ("-sınız/-siniz/-sunuz/-sünüz") yakalayan sonda.
  const SIZ_HITABI = /\bsiz\b|sınız\b|siniz\b|sunuz\b|sünüz\b/iu

  it('hiçbir metin "siz" hitabı içermiyor', () => {
    const ihlaller = flatten(tr).filter(([, metin]) => SIZ_HITABI.test(metin))
    expect(ihlaller).toEqual([])
  })

  it('çıplak metin sondası: ikinci tekil şahıs metni birebir budur', () => {
    expect(tr.room.resignConfirm).toBe('Pes etmek istediğine emin misin? Oyunu kaybedeceksin.')
  })

  it('sondanın kendisi çalışır — kasıtlı "siz" içeren örnek metinler yakalanır', () => {
    expect(SIZ_HITABI.test('Siz de mi buradasınız?')).toBe(true)
    expect(SIZ_HITABI.test('Emin misiniz?')).toBe(true)
    expect(SIZ_HITABI.test('Hoş geldin, {ad}')).toBe(false)
    // "Henüz" yanlış pozitif olmamalı ("-nüz" ile bitiyor ama fiil eki değil).
    expect(SIZ_HITABI.test('Henüz tamamlanmış oyunun yok.')).toBe(false)
  })
})

/** `{anahtar}` biçimindeki yer tutucuları bir ağaçtan `grup.anahtar -> [...]` olarak toplar. */
const YER_TUTUCU = /\{[a-zçğıöşü]+\}/gu

function collectPlaceholders(node: unknown, path: string[] = []): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const walk = (n: unknown, p: string[]): void => {
    if (typeof n === 'string') {
      const found = [...n.matchAll(YER_TUTUCU)].map((m) => m[0])
      if (found.length > 0) out[p.join('.')] = found
      return
    }
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) walk(v, [...p, k])
  }
  walk(node, path)
  return out
}

/**
 * `apps/mobile`'ın kendi `tr.ts`'i, ayrı bir dosyadır (boundaries: mobil
 * web'i import edemez) ama bugün `apps/mobile` için vitest kurulu değil —
 * `apps/mobile/package.json`/`vitest.config.ts` eklemek bu kartın çakışma
 * kümesinin (yalnızca `apps/web/messages/**` ve `apps/mobile/messages/**`)
 * dışına taşar ve `apps/mobile`'ın `tsc --noEmit`'ini kırar (vitest tipleri
 * mobil `node_modules`'ta yok — doğrulandı, bkz. rapor). Mobil ağacın
 * ŞEKLİ zaten `tr: MessageTree` atamasıyla apps/mobile kendi `typecheck`
 * script'inde derleme zamanında kilitlidir (fazla/eksik anahtar => tsc
 * hatası). Buradaki blok aynı ağacı GERÇEKTEN ÇALIŞAN bir runtime testle
 * de doğrular; `pnpm --filter @xox/web test` altında koşar ve mobil
 * `tr.ts`'ten bir anahtar silinirse/eklenirse kırmızı olur.
 */
describe('tr.ts (mobil) — @xox/shared/message-keys ve errorCodeSchema ile parite', () => {
  it('eksik ya da fazla anahtar yok', () => {
    expect(diffMessageKeys(trMobil)).toEqual({ missing: [], extra: [] })
  })

  it('grup kümesi MESSAGE_KEYS ile birebir aynı', () => {
    expect(Object.keys(trMobil).sort()).toEqual(Object.keys(MESSAGE_KEYS).sort())
  })

  it('errorCodeSchema’daki 20 kodun tamamı trMobil.errors’ta karşılık bulur', () => {
    const kodlar = errorCodeSchema.options
    const eksik = kodlar.filter((kod) => !(kod in trMobil.errors))
    expect(eksik).toEqual([])
  })

  it('trMobil.errors’ta errorCodeSchema dışı fazla kod yok', () => {
    const kodlar = errorCodeSchema.options
    const fazla = (Object.keys(trMobil.errors) as ErrorCode[]).filter(
      (kod) => !kodlar.includes(kod),
    )
    expect(fazla).toEqual([])
  })

  it('hiçbir mobil metni "siz" hitabı içermiyor', () => {
    const SIZ_HITABI = /\bsiz\b|sınız\b|siniz\b|sunuz\b|sünüz\b/iu
    const ihlaller = flatten(trMobil).filter(([, metin]) => SIZ_HITABI.test(metin))
    expect(ihlaller).toEqual([])
  })

  it('çıplak metin sondası: mobildeki ikinci tekil şahıs metni web ile birebir aynı', () => {
    expect(trMobil.room.resignConfirm).toBe('Pes etmek istediğine emin misin? Oyunu kaybedeceksin.')
  })
})

describe('Yer tutucu biçimi ve web/mobil parite', () => {
  it('çıplak metin sondası: home.welcome tam olarak {ad} yer tutucusunu taşır', () => {
    expect(tr.home.welcome).toBe('Hoş geldin, {ad}')
  })

  it('çıplak metin sondası: room.yourSymbol tam olarak {tas} yer tutucusunu taşır', () => {
    expect(tr.room.yourSymbol).toBe('Senin taşın: {tas}')
  })

  it('web ağacındaki tüm yer tutucular yalnızca {ad}, {saniye}, {tas} biçimindedir', () => {
    const bulunanlar = new Set(Object.values(collectPlaceholders(tr)).flat())
    expect([...bulunanlar].sort()).toEqual(['{ad}', '{saniye}', '{tas}'])
  })

  it('yer tutucu taşıyan anahtar kümesi web ve mobilde birebir aynı', () => {
    const webPh = collectPlaceholders(tr)
    const mobilPh = collectPlaceholders(trMobil)
    expect(Object.keys(webPh).sort()).toEqual(Object.keys(mobilPh).sort())
  })

  it('aynı anahtarın yer tutucuları iki ağaçta birebir aynı (sıra dahil)', () => {
    const webPh = collectPlaceholders(tr)
    const mobilPh = collectPlaceholders(trMobil)
    for (const key of Object.keys(webPh)) {
      expect(mobilPh[key]).toEqual(webPh[key])
    }
  })
})
