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

/**
 * `apps/web/components/computer/use-computer-game.ts`nin mobil eş biçimi.
 * `react-native` import ETMEZ (yalnız `react`) — dilerse jsdom'suz da
 * çalışır, ama React hook'u olduğu için bir renderer olmadan (bu pakette
 * kurulu değil) birim testi YAZILMADI; kural kararı zaten next-auth'suz
 * `game-engine.ts`de test edildi (KK-022). Ağa hiç çıkmaz (KK-027).
 */
const DEFAULT_DIFFICULTY: Difficulty = 'medium'

export interface UseComputerGameResult {
  readonly state: ComputerGameState
  readonly difficulty: Difficulty
  readonly setDifficulty: (next: Difficulty) => void
  readonly config: BoardConfig
  readonly setConfig: (next: BoardConfig) => void
  readonly playMove: (index: number) => void
  readonly reset: () => void
}

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

  function setDifficulty(next: Difficulty): void {
    if (next === difficulty) return
    setDifficultyState(next)
    setState(createInitialState(state.config))
  }

  function setConfig(next: BoardConfig): void {
    if (next.size === state.config.size && next.winLength === state.config.winLength) return
    setState(createInitialState(next))
  }

  function reset(): void {
    setState(createInitialState(state.config))
  }

  return { state, difficulty, setDifficulty, config: state.config, setConfig, playMove, reset }
}
