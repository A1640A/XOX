'use client'

import { useEffect, useState } from 'react'
import type { Difficulty } from '@xox/game-core'
import { COMPUTER_MOVE_DELAY_MS } from '@xox/shared'
import {
  applyComputerMove,
  applyHumanMove,
  COMPUTER,
  createInitialState,
  type ComputerGameState,
} from './game-engine'

const DEFAULT_DIFFICULTY: Difficulty = 'medium'

export interface UseComputerGameResult {
  readonly state: ComputerGameState
  readonly difficulty: Difficulty
  readonly setDifficulty: (next: Difficulty) => void
  readonly playMove: (index: number) => void
  readonly reset: () => void
}

/**
 * Bilgisayara karşı oyunun React durumu. Kural kararı bu dosyada YOKTUR —
 * `game-engine.ts`'e delege eder (KK-022). Ağa hiç çıkmaz: `fetch`, `@xox/db`
 * ya da `use-room`/`ws-client` bağımlılığı YOK (KK-027).
 *
 * KK-023: bilgisayarın hamlesi insan hamlesinden `COMPUTER_MOVE_DELAY_MS`
 * (`@xox/shared`) sonra yazılır — sabit bileşene gömülü DEĞİL. `reactStrictMode`
 * çift mount'unda zamanlayıcı sızmasın diye `useEffect` temizleyicisi
 * `clearTimeout` çağırır.
 */
export function useComputerGame(): UseComputerGameResult {
  const [difficulty, setDifficultyState] = useState<Difficulty>(DEFAULT_DIFFICULTY)
  const [state, setState] = useState<ComputerGameState>(createInitialState)

  useEffect(() => {
    if (state.status.kind !== 'playing' || state.status.turn !== COMPUTER) return

    const timer = setTimeout(() => {
      setState((current) => applyComputerMove(current, difficulty))
    }, COMPUTER_MOVE_DELAY_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [state, difficulty])

  function playMove(index: number): void {
    setState((current) => applyHumanMove(current, index))
  }

  /**
   * Zorluk değişimi KK-026'nın simetriği: yeni zorlukla SIFIRDAN bir oyun
   * başlar. `next === difficulty` iken erken döner — ZATEN SEÇİLİ zorluğa
   * tekrar tıklamak (ör. teyit amaçlı) süren oyunu uyarısız silmemeli
   * (inceleme MINOR bulgusu).
   */
  function setDifficulty(next: Difficulty): void {
    if (next === difficulty) return
    setDifficultyState(next)
    setState(createInitialState())
  }

  /** "Yeniden oyna" — tahtayı `emptyBoard()`'a döndürür, seçili zorluğu KORUR (KK-026). */
  function reset(): void {
    setState(createInitialState())
  }

  return { state, difficulty, setDifficulty, playMove, reset }
}
