import { describe, expect, it } from 'vitest'
import {
  BOARD_MODES,
  DEFAULT_BOARD_CONFIG,
  cellCount,
  colOf,
  parseBoardConfig,
  rowOf,
} from './config'
import type { BoardConfig, BoardMode } from './config'

/**
 * ELLE YAZILMIŞ beklenti tablosu — `BOARD_MODES`'tan TÜRETİLMEZ (gotcha örüntü 2).
 * Tablodan bir satır silinirse ya da bir K sızarsa bu tablo kırmızıya döner;
 * kendine referanslı bir beklenti silmeyi göremezdi.
 */
const EXPECTED_MODES = [
  { size: 3, winLengths: [3], defaultWinLength: 3 },
  { size: 6, winLengths: [4, 5], defaultWinLength: 4 },
  { size: 11, winLengths: [4, 5, 6], defaultWinLength: 5 },
]

describe('BOARD_MODES (KK-B01/B02/B03)', () => {
  it('tam olarak üç boyut içerir: 3, 6, 11 — çıplak yazılmış liste', () => {
    expect(BOARD_MODES).toHaveLength(3)
    expect(BOARD_MODES.map((mode) => mode.size)).toEqual([3, 6, 11])
  })

  it('elle yazılmış tabloyla birebir eşleşir — izinli K listeleri ve varsayılanlar', () => {
    expect(
      BOARD_MODES.map((mode) => ({
        size: mode.size,
        winLengths: [...mode.winLengths],
        defaultWinLength: mode.defaultWinLength,
      })),
    ).toEqual(EXPECTED_MODES)
  })

  it('KK-B04 (türetilmiş ilave): her varsayılan kendi izinli listesinin üyesidir', () => {
    for (const mode of BOARD_MODES) {
      expect(mode.winLengths).toContain(mode.defaultWinLength)
    }
  })

  it('tablo ve içindeki listeler donmuştur — çalışma zamanında boyut eklenemez', () => {
    expect(Object.isFrozen(BOARD_MODES)).toBe(true)
    expect(BOARD_MODES.every((mode) => Object.isFrozen(mode))).toBe(true)
    expect(BOARD_MODES.every((mode) => Object.isFrozen(mode.winLengths))).toBe(true)
    expect(() => {
      ;(BOARD_MODES as unknown as BoardMode[]).push({
        size: 4,
        winLengths: [3],
        defaultWinLength: 3,
      })
    }).toThrow(TypeError)
    expect(BOARD_MODES).toHaveLength(3)
  })

  it('DEFAULT_BOARD_CONFIG {3,3}tür ve donmuştur', () => {
    expect(DEFAULT_BOARD_CONFIG).toEqual({ size: 3, winLength: 3 })
    expect(Object.isFrozen(DEFAULT_BOARD_CONFIG)).toBe(true)
  })
})

describe('cellCount — size KENAR, cellCount HÜCRE (ADR-0010)', () => {
  it.each([
    [3, 9],
    [6, 36],
    [11, 121],
  ])('kenarı %i olan tahta %i hücredir', (size, expected) => {
    expect(cellCount({ size, winLength: 3 })).toBe(expected)
  })
})

describe('rowOf / colOf', () => {
  it.each([
    [0, 0, 0],
    [2, 0, 2],
    [3, 1, 0],
    [8, 2, 2],
  ])('3x3 tahtada indeks %i satır %i sütun %idir', (index, row, col) => {
    expect(rowOf(index, { size: 3, winLength: 3 })).toBe(row)
    expect(colOf(index, { size: 3, winLength: 3 })).toBe(col)
  })

  it('11x11 tahtada 120 son satırın son sütunudur', () => {
    const config: BoardConfig = { size: 11, winLength: 5 }
    expect(rowOf(120, config)).toBe(10)
    expect(colOf(120, config)).toBe(10)
  })

  it('11x11 tahtada 11 ikinci satırın ilk sütunudur', () => {
    const config: BoardConfig = { size: 11, winLength: 5 }
    expect(rowOf(11, config)).toBe(1)
    expect(colOf(11, config)).toBe(0)
  })
})

describe('parseBoardConfig — tasarım §2.2 davranış tablosunun HER SATIRI (KK-B05)', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['boş nesne', {}],
  ])('%s hata değildir — {3,3}e düşer', (_ad, input) => {
    expect(parseBoardConfig(input)).toEqual({ ok: true, config: { size: 3, winLength: 3 } })
  })

  it('{size:11} o boyutun varsayılanına düşer: {11,5}', () => {
    expect(parseBoardConfig({ size: 11 })).toEqual({
      ok: true,
      config: { size: 11, winLength: 5 },
    })
  })

  it('{size:6} o boyutun varsayılanına düşer: {6,4}', () => {
    expect(parseBoardConfig({ size: 6 })).toEqual({ ok: true, config: { size: 6, winLength: 4 } })
  })

  it('{size:6, winLength:5} olduğu gibi kabul edilir', () => {
    expect(parseBoardConfig({ size: 6, winLength: 5 })).toEqual({
      ok: true,
      config: { size: 6, winLength: 5 },
    })
  })

  it('{winLength:3} tek başına da kabul edilir — size varsayılanı 3tür', () => {
    expect(parseBoardConfig({ winLength: 3 })).toEqual({
      ok: true,
      config: { size: 3, winLength: 3 },
    })
  })

  it.each([
    ['{size:4, winLength:3}', { size: 4, winLength: 3 }, 'unknown-size'],
    ['{size:3, winLength:4}', { size: 3, winLength: 4 }, 'win-length-not-allowed'],
    ['{size:3, winLength:2}', { size: 3, winLength: 2 }, 'win-length-not-allowed'],
    ['{size:6, winLength:3}', { size: 6, winLength: 3 }, 'win-length-not-allowed'],
    ['{size:6, winLength:6}', { size: 6, winLength: 6 }, 'win-length-not-allowed'],
    ['{size:11, winLength:7}', { size: 11, winLength: 7 }, 'win-length-not-allowed'],
    ['{size:11.5, winLength:5}', { size: 11.5, winLength: 5 }, 'size-not-integer'],
    ['{size:-3, winLength:3}', { size: -3, winLength: 3 }, 'unknown-size'],
    ["{size:'11', winLength:'5'}", { size: '11', winLength: '5' }, 'size-not-integer'],
    ['{size:6, winLength:4.5}', { size: 6, winLength: 4.5 }, 'win-length-not-integer'],
    ["{size:6, winLength:'4'}", { size: 6, winLength: '4' }, 'win-length-not-integer'],
    ['42', 42, 'not-an-object'],
    ["'x'", 'x', 'not-an-object'],
    ['[]', [], 'not-an-object'],
  ])('%s reddedilir: %s', (_ad, input, reason) => {
    expect(parseBoardConfig(input)).toEqual({ ok: false, reason })
  })

  it('beş reddetme sebebi AYIRT EDİLEBİLİR — hepsi farklı değerdir', () => {
    const reasons = [
      parseBoardConfig(42),
      parseBoardConfig({ size: 3.5 }),
      parseBoardConfig({ size: 4 }),
      parseBoardConfig({ size: 6, winLength: 4.5 }),
      parseBoardConfig({ size: 6, winLength: 6 }),
    ].map((result) => (result.ok ? 'ok' : result.reason))
    expect(reasons).toEqual([
      'not-an-object',
      'size-not-integer',
      'unknown-size',
      'win-length-not-integer',
      'win-length-not-allowed',
    ])
    expect(new Set(reasons).size).toBe(5)
  })

  it('KK-B06: başarılı sonuç ve içindeki config donmuştur', () => {
    const result = parseBoardConfig({ size: 11, winLength: 6 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.config)).toBe(true)
    expect(() => {
      ;(result.config as { size: number }).size = 3
    }).toThrow(TypeError)
    expect(result.config.size).toBe(11)
  })

  it('reddetme sonucu da donmuştur', () => {
    const result = parseBoardConfig({ size: 4 })
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('varsayılana düşen sonuç DEFAULT_BOARD_CONFIGin kendisini taşır — kopya üretmez', () => {
    const result = parseBoardConfig(undefined)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config).toBe(DEFAULT_BOARD_CONFIG)
  })
})
