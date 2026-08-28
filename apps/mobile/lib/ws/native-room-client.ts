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
 * NATIVE hedef (iOS/Android) — React Native'in `WebSocket`'i (kartın
 * değişmezi: yerleşik olan kullanılır, polyfill KURULMAZ) standart
 * dışı ÜÇÜNCÜ argüman olarak `{ headers }` kabul eder, bu yüzden kimlik
 * `Authorization: Bearer <erişim-jetonu>` başlığıyla taşınır — `?ticket=`e
 * hiç gerek YOK (ADR-0006 yalnız tarayıcı için istisna tanımlıyor).
 *
 * Erişim jetonu 15 dakikada bir dolar (`MOBILE_ACCESS_TTL_SECONDS`); WS
 * bağlantısı bundan çok daha uzun sürebilir. `ws-client.ts`nin 4401'de
 * ürettiği 'reauth' efekti burada erişim jetonunu YENİLER (refresh token
 * döndürmeli akışıyla, `POST /api/auth/mobile/refresh`) ve AYNI URL'e
 * (yol/host değişmez, yalnız başlık değişir) yeniden bağlanır.
 */
export interface NativeRoomClientDeps {
  readonly roomCode: RoomCode
  readonly wsBaseUrl: string
  readonly initialAccessToken: string
  /** `null` dönerse yenileme de başarısız oldu (refresh de geçersiz) — pes edilir. */
  readonly refreshAccessToken: () => Promise<string | null>
  /** ANLIK erişim jetonuyla bir soket açar — `Authorization: Bearer` BURADA taşınır. */
  readonly createSocket: (url: string, accessToken: string) => SocketLike
  readonly now: () => number
  readonly rng: () => number
  readonly setTimer: (callback: () => void, ms: number) => unknown
  readonly clearTimer: (handle: unknown) => void
  readonly onChange: (state: RoomClientState) => void
  readonly onReauthExhausted?: () => void
}

export interface NativeRoomClient {
  readonly client: RoomWsClient
  connect: () => void
  dispatch: (event: RoomClientUiEvent) => void
  getState: () => RoomClientState
  close: () => void
}

export function createNativeRoomClient(deps: NativeRoomClientDeps): NativeRoomClient {
  let accessToken = deps.initialAccessToken
  const url = `${deps.wsBaseUrl}/api/rooms/${deps.roomCode}/ws`

  function createSocket(socketUrl: string): SocketLike {
    return deps.createSocket(socketUrl, accessToken)
  }

  const client = createRoomWsClient({
    url,
    roomCode: deps.roomCode,
    createSocket,
    now: deps.now,
    rng: deps.rng,
    setTimer: deps.setTimer,
    clearTimer: deps.clearTimer,
    onChange: deps.onChange,
    onReauth: (attempt) => {
      void reauth(attempt)
    },
  })

  async function reauth(attempt: number): Promise<void> {
    if (attempt >= MAX_REAUTH_ATTEMPTS) {
      deps.onReauthExhausted?.()
      return
    }
    const refreshed = await deps.refreshAccessToken()
    if (refreshed === null) {
      deps.onReauthExhausted?.()
      return
    }
    accessToken = refreshed
    client.connect()
  }

  return {
    client,
    connect: () => {
      client.connect(url)
    },
    dispatch: (event) => {
      client.dispatch(event)
    },
    getState: () => client.getState(),
    close: () => {
      client.close()
    },
  }
}
