import { describe, expect, it } from 'vitest'
import type { BoardConfig } from '@xox/game-core'
import { boardAriaLabel, cellAriaLabel } from './cell-label'

const CONFIG_3: BoardConfig = { size: 3, winLength: 3 }
const CONFIG_11: BoardConfig = { size: 11, winLength: 5 }

describe('cellAriaLabel — SAF, tr.boardConfig kaynaklı (ADR-0017 §7, KK-B63)', () => {
  it('boş hücrede "N. satır N. sütun, boş" üretir (biçim korunur)', () => {
    expect(cellAriaLabel(4, null, CONFIG_3)).toBe('2. satır 2. sütun, boş')
  })

  it('dolu hücrede taş bilgisini ekler', () => {
    expect(cellAriaLabel(0, 'X', CONFIG_3)).toBe('1. satır 1. sütun, X taşı')
    expect(cellAriaLabel(1, 'O', CONFIG_3)).toBe('1. satır 2. sütun, O taşı')
  })

  it('satır/sütun hesabı KONFİGÜRASYONDAN gelir — bileşene gömülü sabit YOK', () => {
    // 11×11'de index 12 -> satır 2 (0 tabanlı 1), sütun 2 (0 tabanlı 1).
    expect(cellAriaLabel(12, null, CONFIG_11)).toBe('2. satır 2. sütun, boş')
  })
})

describe('boardAriaLabel — grid aria-label (KK-B61)', () => {
  it('"NxN oyun tahtası, kazanmak için K taş yan yana" üretir', () => {
    expect(boardAriaLabel(CONFIG_11)).toBe('11×11 oyun tahtası, kazanmak için 5 taş yan yana')
  })

  it('3×3 için de aynı şablonu kullanır (tek uygulama)', () => {
    expect(boardAriaLabel(CONFIG_3)).toBe('3×3 oyun tahtası, kazanmak için 3 taş yan yana')
  })
})
