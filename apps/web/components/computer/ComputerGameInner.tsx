'use client'

import { DEFAULT_BOARD_CONFIG } from '@xox/game-core'
import { TESTID } from '@xox/shared'
import { Board } from '@/components/board/Board'
import { tr } from '@/messages/tr'
import { DifficultyPicker } from './DifficultyPicker'
import { HUMAN, turnAttr } from './game-engine'
import { statusText } from './status-text'
import { useComputerGame } from './use-computer-game'

/**
 * `/oyna/bilgisayar`'ın GERÇEK gövdesi — PERF-003 öncesi `ComputerGameScreen.tsx`
 * buydu. Ölçüm arama koduna (`@xox/game-core/ai` → `chooseMove`) giden TEK
 * senkron import zinciri burada başlar; `ComputerGameScreen.tsx` bu dosyayı
 * `next/dynamic` ile eşzamansız çeker ki bu alt ağaç (arama kodu dahil)
 * `/`, `/giris`, `/kayit`, `/oda/[kod]` gibi başka rotaların modül
 * grafiğinde HİÇBİR senkron yol üzerinden bulunamasın (bkz.
 * docs/board/reports/PERF-003.md — bu sınır olmadan alt yol export'u TEK
 * BAŞINA yetersizdi, ölçüldü).
 */
export function ComputerGameInner(): React.ReactElement {
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
        config={DEFAULT_BOARD_CONFIG}
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
