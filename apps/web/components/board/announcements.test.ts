import { describe, expect, it } from 'vitest'
import type { BoardConfig } from '@xox/game-core'
import { moveAnnouncement, winningLineAnnouncement } from './announcements'

const CONFIG_11: BoardConfig = { size: 11, winLength: 5 }

describe('moveAnnouncement — yalnız FARKI duyurur (ADR-0017 §7, KK-B64)', () => {
  it('rakibin hamlesi için "Rakip N. satır N. sütuna oynadı." üretir', () => {
    // index 26 -> 11'lik tahtada satır 2 (0 tabanlı), sütun 4 (0 tabanlı) -> 1 tabanlı 3,5
    expect(moveAnnouncement(26, CONFIG_11, 'opponent')).toBe('Rakip 3. satır 5. sütuna oynadı.')
  })

  it('kendi hamlesi için "N. satır N. sütuna oynadın." üretir', () => {
    expect(moveAnnouncement(26, CONFIG_11, 'you')).toBe('3. satır 5. sütuna oynadın.')
  })
})

describe('winningLineAnnouncement — kazanan çizginin KOORDİNATLARINI duyurur (KK-B65)', () => {
  it('"N taş: başlangıçtan bitişe" üretir', () => {
    // 11'lik tahtada yatay çizgi: 22,23,24,25,26 (satır 2, sütun 0..4)
    const line = [22, 23, 24, 25, 26]
    expect(winningLineAnnouncement(line, CONFIG_11)).toBe(
      '5 taş: 3. satır 1. sütundan 3. satır 5. sütuna.',
    )
  })

  it('boş çizgide boş string döner (savunmacı sınır)', () => {
    expect(winningLineAnnouncement([], CONFIG_11)).toBe('')
  })
})
