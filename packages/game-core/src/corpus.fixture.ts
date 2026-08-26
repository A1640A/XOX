import { boardFromCells } from './board'
import { cellCount } from './config'
import type { BoardConfig } from './config'
import { searchMove } from './search'
import { wouldWin } from './status'
import type { Board, Cell, Player } from './types'

/**
 * KK-B68'in BİRİM tarafı için SABİT korpus (ADR-0013 §8).
 *
 * Bu dosya ÜRETİM KODU DEĞİLDİR, test donanımıdır: yalnız `*.test.ts`ler
 * çağırır ve `index.ts` onu dışa aktarmaz. `stryker.config.mjs` `*.fixture.ts`
 * dosyalarını MUTASYONA UĞRATMAZ — korpus üretecine yapılan bir mutasyon
 * (ör. `sample < perBucket` → `<=`) yalnız korpusu büyütür/küçültür, hiçbir
 * testi düşürmez ve skoru sahte biçimde aşağı çeker.
 *
 * Korpus taş sayısına göre KATMANLIDIR: en kötü durum boş tahta DEĞİL, aday
 * sayısının tepe yaptığı orta oyundur — `AI-SPIKE-001` bunu ölçtü (11×11 K4
 * derinlik 3'te boş tahta 212 düğüm, 12-taş kovası 22 528 düğüm, 106×).
 */

/** Desteklenen bütün N > 3 kombinasyonları — `BOARD_MODES`'un N > 3 kısmı. */
export const LARGE_CONFIGS = Object.freeze({
  sixFour: Object.freeze({ size: 6, winLength: 4 }),
  sixFive: Object.freeze({ size: 6, winLength: 5 }),
  elevenFour: Object.freeze({ size: 11, winLength: 4 }),
  elevenFive: Object.freeze({ size: 11, winLength: 5 }),
  elevenSix: Object.freeze({ size: 11, winLength: 6 }),
}) satisfies Readonly<Record<string, BoardConfig>>

// Dışa VERİLMEZ — `nodeBudgetCorpus` dışında çağıranı yok (knip zincirleme yakaladı:
// bir dışa verim kalkınca yalnız onun kullandığı bir sonraki de açığa çıkıyor).
function buildBoard(config: BoardConfig, stones: ReadonlyMap<number, Player>): Board {
  return boardFromCells(
    Array.from({ length: cellCount(config) }, (_unused, i): Cell => stones.get(i) ?? null),
    config,
  )
}

/** Tohumlu üreteç (mulberry32) — korpus yeniden üretilebilir olmalı. */
function mulberry32(seed: number): () => number {
  let state = seed
  return (): number => {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Taş sayısına göre katmanlı, tohumlu, SÜREN (kazanılmamış) pozisyonlar.
 * Boş tahta kovası tek örnek verir (hepsi aynı pozisyon olurdu); kalan beş
 * kova 200'ü aşacak şekilde paylaşır.
 */
// Dışa VERİLMEZ: yalnız aşağıdaki `measureCorpus` çağırıyor, testler `LARGE_CONFIGS`
// ve `measureCorpus` dışında bir şey import etmiyor. `export` bırakılırsa knip
// "kullanılmayan dışa verim" diye kapıyı kırar (CI'da 2026-08-26 kırdı).
function nodeBudgetCorpus(config: BoardConfig): Board[] {
  const total = cellCount(config)
  const buckets = [0, 4, 12, 30, 60, 100].filter((count) => count <= total - 2)
  const perBucket = Math.ceil(199 / (buckets.length - 1))
  const rng = mulberry32(config.size * 1000 + config.winLength)
  const positions: Board[] = []

  for (const count of buckets) {
    const samples = count === 0 ? 1 : perBucket
    for (let sample = 0; sample < samples; sample += 1) {
      const stones = new Map<number, Player>()
      let placed = 0
      let guard = 0
      while (placed < count && guard < total * 4) {
        guard += 1
        const cell = Math.floor(rng() * total)
        if (stones.has(cell)) continue
        const player: Player = placed % 2 === 0 ? 'X' : 'O'
        if (wouldWin(buildBoard(config, stones), cell, player, config)) continue
        stones.set(cell, player)
        placed += 1
      }
      positions.push(buildBoard(config, stones))
    }
  }

  return positions
}

export interface CorpusMeasurement {
  readonly positions: number
  readonly maxNodes: number
  readonly illegal: number
}

/**
 * Korpusun TAMAMINI arar ve MAKSİMUMU ölçer (ortalama değil).
 *
 * Saat DONDURULMUŞTUR: duvar saati kapısı bu kartta koşulmaz (gotcha örüntü 6 —
 * CI'ın hızlı Node'u kullanıcının cihazını temsil etmez). Geriye tek sınır
 * olarak DÜĞÜM bütçesi kalır, o da deterministiktir.
 */
export function measureCorpus(config: BoardConfig): CorpusMeasurement {
  const positions = nodeBudgetCorpus(config)
  let maxNodes = 0
  let illegal = 0

  for (const board of positions) {
    const result = searchMove(board, 'X', { config, now: (): number => 0 })
    maxNodes = Math.max(maxNodes, result.nodes)
    if (board[result.move] !== null) illegal += 1
  }

  return { positions: positions.length, maxNodes, illegal }
}
