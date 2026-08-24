'use client'

import type { RoomCode } from '@xox/shared'
import { TESTID } from '@xox/shared'
import { Board } from '@/components/board/Board'
import { ErrorBanner } from '@/components/ErrorBanner'
import { useRoom } from '@/lib/client/use-room'
import { tr } from '@/messages/tr'
import { ConnectionBadge } from './ConnectionBadge'
import { EmojiTray } from './EmojiTray'
import { FriendAddButton } from './FriendAddButton'
import { ResultPanel } from './ResultPanel'
import { statusText, turnAttr } from './status-text'
import { TurnTimer } from './TurnTimer'

export interface RoomScreenProps {
  readonly roomCode: RoomCode
}

/**
 * SICAK DOSYA DONDURMA #1 (kart) — bu dosya sonraki dalgaların bileşenlerini
 * ŞİMDİDEN mount eder ve bir daha AÇILMAZ: Dalga 1-3 yalnız kendi bileşen
 * dosyasını (`ResultPanel`, `TurnTimer`, `EmojiTray`, `FriendAddButton`)
 * doldurur, buraya dönmez. Böylece dört agent aynı dalgada bu dosyaya
 * çakışmadan paralel çalışabilir.
 *
 * `useRoom` DIŞINDA hiçbir oyun kuralı yoktur: `interactive` hesabı yalnız
 * "bağlıyım + oyun sürüyor + sıra bende" önermesinin birleşimidir, hücre
 * doluluğu/kazanma gibi kararlar `Board`'a değil `room-client.ts`'e aittir.
 */
export function RoomScreen({ roomCode }: RoomScreenProps): React.ReactElement {
  const { state, actions } = useRoom(roomCode)

  const opponent = state.you === 'X' ? state.players.O : state.players.X
  const interactive =
    state.connection === 'bagli' &&
    state.status.kind === 'playing' &&
    state.status.turn === state.you
  const winningLine = state.status.kind === 'won' ? state.status.line : null

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <p data-testid={TESTID.odaKodu}>{roomCode}</p>
        <ConnectionBadge status={state.connection} />
      </header>

      <p data-testid={TESTID.rakipAdi}>{opponent?.name ?? tr.room.waitingOpponent}</p>

      {/* Spec §2.0: iki AYRI kimlik — `sira-gostergesi` yalnız `data-sira`
          taşır, gösterilen metin `durum-metni`dedir. */}
      <p data-testid={TESTID.siraGostergesi} data-sira={turnAttr(state.status)} />
      <p data-testid={TESTID.durumMetni}>{statusText(state.status, state.you)}</p>

      <Board
        cells={state.board}
        interactive={interactive}
        winningLine={winningLine}
        pendingIndex={state.pending?.index ?? null}
        onCellPress={actions.move}
      />

      <TurnTimer deadline={state.turnDeadline} serverOffsetMs={state.serverOffsetMs} />

      <button
        type="button"
        data-testid={TESTID.btnPesEt}
        disabled={state.status.kind !== 'playing'}
        onClick={actions.resign}
      >
        {tr.room.resign}
      </button>

      <ResultPanel
        status={state.status}
        you={state.you}
        rematch={state.rematch}
        onOfferRematch={actions.offerRematch}
        onAcceptRematch={actions.acceptRematch}
      />

      <EmojiTray onSend={actions.sendEmoji} lastEmoji={state.lastEmoji} />
      <FriendAddButton
        opponentId={opponent?.userId ?? null}
        visible={state.status.kind !== 'playing'}
      />

      <ErrorBanner code={state.lastError} />
    </main>
  )
}
