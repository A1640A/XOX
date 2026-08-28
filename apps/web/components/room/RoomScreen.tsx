'use client'

import type { RoomCode } from '@xox/shared'
import { TESTID } from '@xox/shared'
import { Board } from '@/components/board/Board'
import { GameConfigSummary } from '@/components/board-config/GameConfigSummary'
import { ErrorBanner } from '@/components/ErrorBanner'
import { useRoom } from '@/lib/client/use-room'
import { tr } from '@/messages/tr'
import { ConnectionBadge } from './ConnectionBadge'
import { CopyButton } from './CopyButton'
import { EmojiTray } from './EmojiTray'
import { FriendAddButton } from './FriendAddButton'
import { InviteLink } from './InviteLink'
import { OpponentLeftBanner } from './OpponentLeftBanner'
import { ResultPanel } from './ResultPanel'
import { liveAnnouncement, turnAttr } from './status-text'
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

  // İnceleme minor bulgusu: `you === null` iken (ilk `state` mesajından ÖNCE
  // düşen bir `opponent:joined` gibi durumlarda) eski kod sessizce
  // `players.X`'i "rakip" sayıyordu — `you` henüz bilinmezken rakip de
  // BİLİNEMEZ, `null` kalmalı.
  const opponent = state.you === null ? null : state.you === 'X' ? state.players.O : state.players.X
  const interactive =
    state.connection === 'bagli' &&
    state.status.kind === 'playing' &&
    state.status.turn === state.you
  const winningLine = state.status.kind === 'won' ? state.status.line : null
  // Eski (size/winLength taşımayan) odalar `resolveBoardConfig` üzerinden
  // sunucuda ZATEN `{3,3}`'e çözülmüş gelir (`initialRoomClientState`'in
  // ilk `state` mesajından ÖNCEki geçici değeri de aynıdır) — burada
  // `?? 3` gibi üçüncü bir varsayılan YAZILMAZ, `state.size`/`winLength`
  // doğrudan aktarılır (kart §Sert şart 3).
  const config = { size: state.size, winLength: state.winLength }

  function handleResignClick(): void {
    // KK-054: pes etme ONAYLANMADAN uygulanmaz — mobilde tahtayla düğme
    // arası dar boşlukta yanlışlıkla dokunma kalıcı (ELO'lu) bir kayba
    // dönüşmesin (inceleme MAJOR bulgusu).
    if (window.confirm(tr.room.resignConfirm)) {
      actions.resign()
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p data-testid={TESTID.odaKodu}>{roomCode}</p>
          <CopyButton label={tr.room.copyCode} getValue={() => roomCode} />
        </div>
        <ConnectionBadge status={state.connection} onRetry={actions.reconnect} />
      </header>

      <p data-testid={TESTID.rakipAdi}>{opponent?.name ?? tr.room.waitingOpponent}</p>

      {/* `oyun-ayari-ozeti` — oda/bekleme/katılma ekranlarının ÜÇÜNDE de aynı
          kanca, aynı metin şablonu (testids.ts). Katılan oyuncu ne oynayacağını
          `/oda/katil`de zaten görmüştür (`JoinRoomPreview`); burada AYNI özet
          oyun boyunca kalıcıdır — rövanşta da (config odanın kendi
          `resolveBoardConfig` sonucundan geldiği için) DEĞİŞMEDEN görünür. */}
      <GameConfigSummary config={config} />

      {/* ADR-0017 §7: 11×11 gibi geniş tahtalarda dar/dikey ekranda tahtayı
          görmek zorlaşır — yalnız CSS ile, JS ölçümü olmadan (KK-B50). */}
      {config.size > 3 && (
        <p className="hidden text-sm opacity-70 max-sm:block">{tr.boardConfig.narrowScreen}</p>
      )}

      {/* Spec §2.0: iki AYRI kimlik — `sira-gostergesi` yalnız `data-sira`
          taşır, gösterilen metin `durum-metni`dedir. `aria-live="polite"` +
          `role="status"`: sıra değişimi ve oyun sonucu ekran okuyucuya
          duyurulsun (inceleme minor bulgusu — önceden HİÇ duyurulmuyordu). */}
      <p data-testid={TESTID.siraGostergesi} data-sira={turnAttr(state.status)} />
      <p data-testid={TESTID.durumMetni} role="status" aria-live="polite">
        {liveAnnouncement({
          status: state.status,
          you: state.you,
          lastMove: state.lastMove,
          size: state.size,
          winLength: state.winLength,
        })}
      </p>

      <Board
        cells={state.board}
        config={config}
        interactive={interactive}
        winningLine={winningLine}
        pendingIndex={state.pending?.index ?? null}
        lastMoveIndex={state.lastMove?.index ?? null}
        onCellPress={actions.move}
      />

      <TurnTimer deadline={state.turnDeadline} serverOffsetMs={state.serverOffsetMs} />
      {/* `gameEnded` UI-005: `graceEndsAt`in null'a düşmesi İKİ ayrı olayın aynı
          sinyali — gerçek yeniden bağlanma ve grace'in dolup terk/timeout
          galibiyetiyle bitmesi. `settle.ts` ikincisinde `disconnected:null` ile
          `state:'finished'`i TEK CAS yazmasında birlikte yazar, yani oyun aynı
          anda biter; gerçek dönüşte oyun `'playing'` kalır. Bu prop olmadan
          kazanan oyuncu doğru "terk etti" metniyle birlikte YANLIŞ "rakip geri
          döndü" bannerını da görüyordu (E2E-DIAG bulgusu). */}
      <OpponentLeftBanner
        graceEndsAt={state.graceEndsAt}
        serverOffsetMs={state.serverOffsetMs}
        gameEnded={state.status.kind !== 'playing'}
      />

      <button
        type="button"
        data-testid={TESTID.btnPesEt}
        disabled={state.status.kind !== 'playing'}
        onClick={handleResignClick}
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
      <InviteLink roomCode={roomCode} />

      <ErrorBanner code={state.lastError} />
    </main>
  )
}
