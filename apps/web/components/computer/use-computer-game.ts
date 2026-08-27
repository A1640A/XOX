'use client'

import { useEffect, useState } from 'react'
import type { BoardConfig, Difficulty } from '@xox/game-core'
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
  /** Aktif tahta boyutu/K — `state.config`in kısayolu (UI-COMP-001). */
  readonly config: BoardConfig
  readonly setConfig: (next: BoardConfig) => void
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
    setState(createInitialState(state.config))
  }

  /**
   * Boyut/K değişimi (UI-COMP-001, KK-B42): oda akışından TAMAMEN bağımsız —
   * sunucuya istek gitmez, yalnız yerel durum sıfırlanır. `next` ZATEN aktif
   * konfigürasyonla aynıysa (ör. aynı boyuta tekrar basmak) `setDifficulty`
   * ile simetrik biçimde erken döner: süren oyun uyarısız silinmez.
   *
   * Yeni konfigürasyonla SIFIRDAN başlanır (`createInitialState(next)`) —
   * eski tahtanın hücreleri yeni hücre sayısına (`cellCount`) UYMAYABİLİR
   * (ör. 11×11'den 3×3'e geçiş), bu yüzden kısmi bir dönüşüm YOKTUR, KK-026
   * "Yeniden oyna" ile aynı disiplin: yeni bir oyun. Seçili zorluk KORUNUR.
   *
   * `state`in KENDİSİ değişir (yeni referans) — bilgisayarın hamlesini
   * bekleyen `useEffect`in `[state, difficulty]` bağımlılığı bunu görür ve
   * ESKİ zamanlayıcıyı temizler (aynı "reset yarışı" disiplini, bkz.
   * `ComputerGameScreen.test.tsx`ki "reset yarışı" testi).
   */
  function setConfig(next: BoardConfig): void {
    if (next.size === state.config.size && next.winLength === state.config.winLength) return
    setState(createInitialState(next))
  }

  /** "Yeniden oyna" — tahtayı `emptyBoard()`'a döndürür, seçili zorluğu VE konfigürasyonu KORUR (KK-026). */
  function reset(): void {
    setState(createInitialState(state.config))
  }

  return { state, difficulty, setDifficulty, config: state.config, setConfig, playMove, reset }
}
