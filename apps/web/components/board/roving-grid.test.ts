import { describe, expect, it } from 'vitest'
import type { BoardConfig } from '@xox/game-core'
import { nextFocusIndex, toNavKey } from './roving-grid'

const CONFIG_3: BoardConfig = { size: 3, winLength: 3 }
const CONFIG_11: BoardConfig = { size: 11, winLength: 5 }

describe("nextFocusIndex — saf, DOM'suz (ADR-0017 §6, KK-B60)", () => {
  describe('ok tuşları — bir hücre, sarma YOK (E-16)', () => {
    it('ArrowRight bir hücre sağa taşır', () => {
      expect(nextFocusIndex(0, 'ArrowRight', CONFIG_3)).toBe(1)
    })

    it('ArrowRight satırın SON hücresinde sarmaz — aynı indekste kalır', () => {
      expect(nextFocusIndex(2, 'ArrowRight', CONFIG_3)).toBe(2)
    })

    it('ArrowLeft bir hücre sola taşır', () => {
      expect(nextFocusIndex(4, 'ArrowLeft', CONFIG_3)).toBe(3)
    })

    it('ArrowLeft satırın İLK hücresinde sarmaz', () => {
      expect(nextFocusIndex(3, 'ArrowLeft', CONFIG_3)).toBe(3)
    })

    it('ArrowDown bir satır aşağı taşır', () => {
      expect(nextFocusIndex(0, 'ArrowDown', CONFIG_3)).toBe(3)
    })

    it('ArrowDown son satırda sarmaz', () => {
      expect(nextFocusIndex(7, 'ArrowDown', CONFIG_3)).toBe(7)
    })

    it('ArrowUp bir satır yukarı taşır', () => {
      expect(nextFocusIndex(4, 'ArrowUp', CONFIG_3)).toBe(1)
    })

    it('ArrowUp ilk satırda sarmaz', () => {
      expect(nextFocusIndex(1, 'ArrowUp', CONFIG_3)).toBe(1)
    })
  })

  describe('Home/End — satır başı/sonu', () => {
    it('Home satırın ilk hücresine gider (satır ortasından)', () => {
      expect(nextFocusIndex(13, 'Home', CONFIG_11)).toBe(11) // satır 1 (0 tabanlı), 11'in katı
    })

    it('End satırın son hücresine gider', () => {
      expect(nextFocusIndex(13, 'End', CONFIG_11)).toBe(21) // satır 1 sonu: 1*11+10
    })

    it('zaten satır başındaysa Home aynı indekste kalır', () => {
      expect(nextFocusIndex(11, 'Home', CONFIG_11)).toBe(11)
    })
  })

  describe('Ctrl+Home/Ctrl+End — ilk/son hücre', () => {
    it('CtrlHome her zaman 0 döner', () => {
      expect(nextFocusIndex(87, 'CtrlHome', CONFIG_11)).toBe(0)
    })

    it('CtrlEnd her zaman cellCount(config)-1 döner', () => {
      expect(nextFocusIndex(3, 'CtrlEnd', CONFIG_11)).toBe(120)
    })
  })

  describe('PageUp/PageDown — ±5 satır, sınırda kelepçelenir', () => {
    it('PageDown 5 satır aşağı taşır (aynı sütun)', () => {
      expect(nextFocusIndex(5, 'PageDown', CONFIG_11)).toBe(5 + 5 * 11)
    })

    it('PageDown sınırı aşarsa son hücreye kelepçelenir', () => {
      expect(nextFocusIndex(118, 'PageDown', CONFIG_11)).toBe(120)
    })

    it('PageUp 5 satır yukarı taşır (aynı sütun)', () => {
      expect(nextFocusIndex(60, 'PageUp', CONFIG_11)).toBe(60 - 5 * 11)
    })

    it("PageUp sınırı aşarsa 0'a kelepçelenir", () => {
      expect(nextFocusIndex(3, 'PageUp', CONFIG_11)).toBe(0)
    })

    it("3×3'te PageDown/PageUp tek satırı aşar ve tahtanın sınırına kelepçelenir", () => {
      expect(nextFocusIndex(0, 'PageDown', CONFIG_3)).toBe(8)
      expect(nextFocusIndex(8, 'PageUp', CONFIG_3)).toBe(0)
    })
  })

  describe("3×3'te de aynı davranış — tek uygulama, boyuta göre dallanma yok", () => {
    it('köşeden ArrowRight+ArrowDown merkezi hücreye götürür', () => {
      const afterRight = nextFocusIndex(0, 'ArrowRight', CONFIG_3)
      expect(nextFocusIndex(afterRight, 'ArrowDown', CONFIG_3)).toBe(4)
    })
  })
})

describe("toNavKey — ham KeyboardEvent'i NavKey'e çevirir (DOM'suz, yapısal arayüz)", () => {
  it('ok tuşları ve PageUp/PageDown aynen geçer', () => {
    expect(toNavKey({ key: 'ArrowUp', ctrlKey: false })).toBe('ArrowUp')
    expect(toNavKey({ key: 'ArrowDown', ctrlKey: false })).toBe('ArrowDown')
    expect(toNavKey({ key: 'ArrowLeft', ctrlKey: false })).toBe('ArrowLeft')
    expect(toNavKey({ key: 'ArrowRight', ctrlKey: false })).toBe('ArrowRight')
    expect(toNavKey({ key: 'PageUp', ctrlKey: false })).toBe('PageUp')
    expect(toNavKey({ key: 'PageDown', ctrlKey: false })).toBe('PageDown')
  })

  it('Home/End ctrlKey=false iken Home/End, ctrlKey=true iken CtrlHome/CtrlEnd döner', () => {
    expect(toNavKey({ key: 'Home', ctrlKey: false })).toBe('Home')
    expect(toNavKey({ key: 'Home', ctrlKey: true })).toBe('CtrlHome')
    expect(toNavKey({ key: 'End', ctrlKey: false })).toBe('End')
    expect(toNavKey({ key: 'End', ctrlKey: true })).toBe('CtrlEnd')
  })

  it('tanınmayan tuşlar için null döner (ör. Enter/Space — native buton zaten oynar)', () => {
    expect(toNavKey({ key: 'Enter', ctrlKey: false })).toBeNull()
    expect(toNavKey({ key: ' ', ctrlKey: false })).toBeNull()
    expect(toNavKey({ key: 'a', ctrlKey: false })).toBeNull()
  })
})
