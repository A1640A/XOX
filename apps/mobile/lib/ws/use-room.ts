import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import {
  initialRoomClientState,
  type Emoji,
  type RoomClientState,
  type RoomCode,
} from '@xox/shared'
import { fetchWsTicket } from '../auth/api'
import { useSession } from '../auth/session'
import { getApiBaseUrl, getWsBaseUrl } from '../env'
import { createNativeRoomClient, type NativeRoomClient } from './native-room-client'
import { createNativeSocketLike, createWebSocketLike } from './sockets'
import { createWebRoomClient, type WebRoomClient } from './web-room-client'

/**
 * `apps/web/lib/client/use-room.ts` ile AYNI köprü ROLÜ (§5, kart KK-092):
 * `roomClientReducer` + WS taşıma istemcisini React'e bağlar, TÜM eylemleri
 * dışa verir. Bu dosyada hiçbir oyun kuralı ve hiçbir uzlaşma mantığı YOKTUR.
 *
 * Tek fark: platforma göre `web-room-client.ts` (bilet, tek kullanımlık) ya
 * da `native-room-client.ts` (Bearer, döndürmeli erişim jetonu) seçilir —
 * karar `Platform.OS` ile burada, TEK yerde verilir (kart: "WS bağlantısı
 * web hedefinde ?ticket= ile kurulur… native hedefte Authorization: Bearer
 * kullanılabilir").
 */

const SERVER_SNAPSHOT: RoomClientState = initialRoomClientState()

interface UseRoomActions {
  readonly move: (index: number) => void
  readonly resign: () => void
  readonly offerRematch: () => void
  readonly acceptRematch: () => void
  readonly sendEmoji: (emoji: Emoji) => void
  /** Bilerek yeniden bağlanmayı ister — ör. "Tekrar dene" düğmesi. */
  readonly reconnect: () => void
}

export interface UseRoomResult {
  readonly state: RoomClientState
  readonly actions: UseRoomActions
}

type AnyRoomClient = NativeRoomClient | WebRoomClient

function toTimerHandle(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
  return setTimeout(callback, ms)
}

export function useRoom(roomCode: RoomCode): UseRoomResult {
  const session = useSession()
  // `session.ensureAccessToken` her render'da YENİ bir kapanış olabilir
  // (`SessionProvider`in `useMemo`su `state` değişince yeniden kurulur) —
  // arka planda sessiz bir token yenilemesi YÜZÜNDEN oyun soketinin
  // sökülüp yeniden kurulmasını İSTEMİYORUZ. Bu yüzden effect bağımlılığı
  // yalnız `session.status` (gerçek giriş/çıkış geçişi); güncel fonksiyon
  // bir `ref` üzerinden okunur.
  const sessionRef = useRef(session)
  // Ref'e YAZMA render SIRASINDA değil, bir efekt içinde yapılır
  // (react-hooks/refs: render sırasında ref mutasyonu YASAK) — bağımlılık
  // dizisi YOK, bu yüzden HER render'dan sonra çalışır ve ref'i günceller.
  useEffect(() => {
    sessionRef.current = session
  })

  const listenersRef = useRef(new Set<() => void>())
  const stateRef = useRef<RoomClientState>(SERVER_SNAPSHOT)
  const clientRef = useRef<AnyRoomClient | null>(null)

  useEffect(() => {
    // Yalnız TEK bir kontrol noktası var (`setupNative` içinde) — `let`in
    // yanlış pozitif ürettiği ikinci kontrol deseni burada YOK (bkz. altındaki not).
    let cancelled = false

    function onChange(next: RoomClientState): void {
      stateRef.current = next
      for (const listener of listenersRef.current) listener()
    }

    function setup(): void {
      if (Platform.OS === 'web') {
        const client = createWebRoomClient({
          roomCode,
          wsBaseUrl: getWsBaseUrl(),
          fetchTicket: async (code) => {
            const token = await sessionRef.current.ensureAccessToken()
            if (token === null) return null
            const result = await fetchWsTicket(getApiBaseUrl(), token, code)
            return result.ok ? result.data.ticket : null
          },
          createSocket: createWebSocketLike,
          now: () => Date.now(),
          rng: () => Math.random(),
          setTimer: toTimerHandle,
          clearTimer: (handle) => {
            clearTimeout(handle as ReturnType<typeof setTimeout>)
          },
          onChange,
        })
        clientRef.current = client
        void client.connect()
        return
      }

      void setupNative()
    }

    async function setupNative(): Promise<void> {
      const accessToken = await sessionRef.current.ensureAccessToken()
      if (accessToken === null || cancelled) return
      // `createNativeRoomClient` TAMAMEN SENKRONDUR (aradan `await` GEÇMEZ) —
      // yukarıdaki kontrol ile aşağıdaki `clientRef.current` ataması arasında
      // `cancelled` gerçekten DEĞİŞEMEZ, bu yüzden ikinci bir kontrol GERÇEKTEN
      // gereksizdir (yukarıdaki gibi bir yanlış pozitif değil).
      const client = createNativeRoomClient({
        roomCode,
        wsBaseUrl: getWsBaseUrl(),
        initialAccessToken: accessToken,
        refreshAccessToken: () => sessionRef.current.ensureAccessToken(),
        createSocket: createNativeSocketLike,
        now: () => Date.now(),
        rng: () => Math.random(),
        setTimer: toTimerHandle,
        clearTimer: (handle) => {
          clearTimeout(handle as ReturnType<typeof setTimeout>)
        },
        onChange,
      })
      clientRef.current = client
      client.connect()
    }

    setup()

    return () => {
      cancelled = true
      clientRef.current?.close()
      clientRef.current = null
    }
  }, [roomCode, session.status])

  const state = useSyncExternalStore(
    (listener) => {
      listenersRef.current.add(listener)
      return () => {
        listenersRef.current.delete(listener)
      }
    },
    () => stateRef.current,
    () => SERVER_SNAPSHOT,
  )

  const actions = useMemo<UseRoomActions>(
    () => ({
      move: (index) => {
        clientRef.current?.dispatch({ type: 'ui:cell', index })
      },
      resign: () => {
        clientRef.current?.dispatch({ type: 'ui:resign' })
      },
      offerRematch: () => {
        clientRef.current?.dispatch({ type: 'ui:rematch-offer' })
      },
      acceptRematch: () => {
        clientRef.current?.dispatch({ type: 'ui:rematch-accept' })
      },
      sendEmoji: (emoji) => {
        clientRef.current?.dispatch({ type: 'ui:emoji', emoji })
      },
      reconnect: () => {
        void clientRef.current?.connect()
      },
    }),
    [],
  )

  return { state, actions }
}
