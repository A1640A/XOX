'use client'

import { TESTID } from '@xox/shared'
import { Board } from '@/components/board/Board'
import { tr } from '@/messages/tr'
import { DifficultyPicker } from './DifficultyPicker'
import { HUMAN, turnAttr } from './game-engine'
import { statusText } from './status-text'
import { useComputerGame } from './use-computer-game'

/**
 * `/oyna/bilgisayar` ekranı — tamamen istemci tarafı (KK-027, kart §oyna/bilgisayar).
 * Kural mantığı YOKTUR: hamle geçerliliği, kazanan tespiti ve bilgisayar
 * hamlesi `use-computer-game.ts` üzerinden `game-engine.ts`'e, oradan da
 * `@xox/game-core`'a delege edilir (KK-022). Sayfa hiçbir ağ isteği yapmaz —
 * `@xox/db`, `use-room`/`ws-client` importu yok, `fetch` çağrısı yok
 * (`network-graph.test.ts` bunu modül grafiğinde ALLOWLIST ile doğrular).
 */
export function ComputerGameScreen(): React.ReactElement {
  const { state, difficulty, setDifficulty, playMove, reset } = useComputerGame()

  const interactive = state.status.kind === 'playing' && state.status.turn === HUMAN
  const winningLine = state.status.kind === 'won' ? state.status.line : null

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold tracking-tight">{tr.computer.title}</h1>
      <p className="text-text-muted text-sm">{tr.computer.notCounted}</p>

      <DifficultyPicker value={difficulty} onChange={setDifficulty} />

      {/* Spec §2.0 deseni: `sira-gostergesi` yalnız `data-sira` taşır, gösterilen
          metin `durum-metni`dedir (bkz. `apps/web/components/room/RoomScreen.tsx`). */}
      <p data-testid={TESTID.siraGostergesi} data-sira={turnAttr(state.status)} />
      <p data-testid={TESTID.durumMetni} role="status" aria-live="polite">
        {statusText(state.status)}
      </p>

      <Board
        cells={state.board}
        interactive={interactive}
        winningLine={winningLine}
        onCellPress={playMove}
      />

      <button
        type="button"
        onClick={reset}
        className="border-border w-fit rounded border-2 px-3 py-1"
      >
        {tr.computer.playAgain}
      </button>
    </main>
  )
}
