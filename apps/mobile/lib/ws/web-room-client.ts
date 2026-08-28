import {
  createRoomWsClient,
  type RoomClientState,
  type RoomClientUiEvent,
  type RoomCode,
  type RoomWsClient,
  type SocketLike,
} from '@xox/shared'
import { MAX_REAUTH_ATTEMPTS } from './constants'

/**
 * Mobil WEB HEDEFİ (`expo export -p web`, react-native-web) — tarayıcı
 * `WebSocket` API'si özel başlık gönderemez (ADR-0006), bu yüzden kimlik
 * `?ticket=` sorgu parametresiyle taşınır. SEC-003: bilet TEK KULLANIMLIKTIR,
 * yani `@xox/shared`'ın `ws-client.ts`sinin (DONMUŞ, bu görevin çakışma
 * kümesi DIŞINDA) ürettiği HER 'reauth' efektinde (4401 — bilet reddi/eski)
 * YENİ bir bilet alınıp `client.connect(yeniUrl)` ile yeniden bağlanılır.
 *
 * ÖNEMLİ MİMARİ NOT: `ws-client.ts`nin normal (4401 DIŞI) kapanışlarda
 * (ör. ağ kopması 1006, planlı rotasyon 4499) çalıştırdığı OTOMATİK yeniden
 * bağlanma (`scheduleReconnect`) İÇSELDİR ve bare `connect()` (url'siz)
 * çağırır — yani ÖNCEKİ (artık tüketilmiş) biletle. Bu dosya o çağrıyı
 * DIŞARIDAN engelleyemez (dosya donmuş). Sonuç: sunucu o bağlantıyı HEMEN
 * 4401 ile reddeder, `roomClientReducer` bunu `requiresReauth` sayar ve
 * 'reauth' efekti üretir — BU dosyanın `onReauth`'u devreye girip YENİ bir
 * bilet alır. Yani her yeniden bağlanma en fazla BİR başarısız (anında
 * biten) denemeden sonra MUTLAKA taze bir biletle devam eder — sessiz
 * kilitlenme YOKTUR. `web-room-client.test.ts` bu tam döngüyü kanıtlar.
 */
export interface WebRoomClientDeps {
  readonly roomCode: RoomCode
  readonly wsBaseUrl: string
  /** `null` dönerse bilet ALINAMADI (ör. access token da geçersiz) — pes edilir. */
  readonly fetchTicket: (roomCode: RoomCode) => Promise<string | null>
  readonly createSocket: (url: string) => SocketLike
  readonly now: () => number
  readonly rng: () => number
  readonly setTimer: (callback: () => void, ms: number) => unknown
  readonly clearTimer: (handle: unknown) => void
  readonly onChange: (state: RoomClientState) => void
  /** Ardışık `MAX_REAUTH_ATTEMPTS` bilet yenileme başarısızlığından sonra çağrılır. */
  readonly onReauthExhausted?: () => void
}

export interface WebRoomClient {
  readonly client: RoomWsClient
  /** İlk bağlantı: bir bilet alır, ardından soketi o biletle açar. */
  connect: () => Promise<void>
  dispatch: (event: RoomClientUiEvent) => void
  getState: () => RoomClientState
  close: () => void
}

export function createWebRoomClient(deps: WebRoomClientDeps): WebRoomClient {
  function buildUrl(ticket: string): string {
    return `${deps.wsBaseUrl}/api/rooms/${deps.roomCode}/ws?ticket=${encodeURIComponent(ticket)}`
  }

  const client = createRoomWsClient({
    url: '',
    roomCode: deps.roomCode,
    createSocket: deps.createSocket,
    now: deps.now,
    rng: deps.rng,
    setTimer: deps.setTimer,
    clearTimer: deps.clearTimer,
    onChange: deps.onChange,
    onReauth: (attempt) => {
      void reconnectWithFreshTicket(attempt)
    },
  })

  async function reconnectWithFreshTicket(attempt: number): Promise<void> {
    if (attempt >= MAX_REAUTH_ATTEMPTS) {
      deps.onReauthExhausted?.()
      return
    }
    const ticket = await deps.fetchTicket(deps.roomCode)
    if (ticket === null) {
      deps.onReauthExhausted?.()
      return
    }
    client.connect(buildUrl(ticket))
  }

  return {
    client,
    connect: () => reconnectWithFreshTicket(0),
    dispatch: (event) => {
      client.dispatch(event)
    },
    getState: () => client.getState(),
    close: () => {
      client.close()
    },
  }
}
