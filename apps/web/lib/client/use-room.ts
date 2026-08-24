'use client'

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  createRoomWsClient,
  initialRoomClientState,
  type Emoji,
  type RoomClientState,
  type RoomCode,
  type RoomWsClient,
  type SocketLike,
} from '@xox/shared'

// knip: dışarıda kimse bu tipi doğrudan import etmiyor (yalnız `UseRoomResult.actions`
// alanı üzerinden erişiliyor) — export edilirse "kullanılmayan export" sayılır.
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

export interface UseRoomDeps {
  readonly createSocket: (url: string) => SocketLike
  readonly now: () => number
  readonly rng: () => number
}

function browserWsUrl(roomCode: RoomCode): string {
  if (typeof window === 'undefined') return ''
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/api/rooms/${roomCode}/ws`
}

/**
 * `SocketLike` bir arayüzdür (sınıf değil): tarayıcı `WebSocket`'inin
 * `onopen`/`onmessage`/`onclose` imzaları `Event`/`MessageEvent`/`CloseEvent`
 * alır, `SocketLike` ise parametresiz/daraltılmış imzalar bekler — bu yüzden
 * doğrudan atanamaz, ince bir sarmalayıcı gerekir.
 */
function createBrowserSocket(url: string): SocketLike {
  const socket = new WebSocket(url)
  const wrapper: SocketLike = {
    send: (data) => {
      socket.send(data)
    },
    close: (code, reason) => {
      socket.close(code, reason)
    },
    onopen: null,
    onmessage: null,
    onclose: null,
  }
  socket.onopen = () => wrapper.onopen?.()
  socket.onmessage = (event) => {
    wrapper.onmessage?.({ data: event.data as unknown })
  }
  socket.onclose = (event) => {
    wrapper.onclose?.({ code: event.code })
  }
  return wrapper
}

function defaultDeps(): UseRoomDeps {
  return {
    createSocket: createBrowserSocket,
    now: () => Date.now(),
    rng: () => Math.random(),
  }
}

/**
 * `room-client.ts` (saf reducer) ile `ws-client.ts` (taşıma) arasındaki TEK
 * React köprüsü (kart §5). Bu dosyada hiçbir oyun kuralı ve hiçbir uzlaşma
 * mantığı YOKTUR — yalnız abonelik + eylemlerin `dispatch`e devri.
 *
 * `useSyncExternalStore` bilerek `useState` YERİNE kullanılır: soket olayları
 * React'in render döngüsü DIŞINDA (`onChange` callback'i) tetiklenir; dış bir
 * store'u `useState` ile aynalamak eski/yarım güncellemeler üretebilir
 * (React'in "tearing" uyarısı), `useSyncExternalStore` bunun için var.
 *
 * `deps` test için enjekte edilebilir (ikinci parametre) — gerçek kullanımda
 * tarayıcı `WebSocket`'i kullanılır, testte sahte bir `SocketLike` verilir.
 * Bu, `createRoomWsClient`'ın GERÇEK `roomClientReducer`'ını koşturur; reducer
 * MOCK'lanmaz (gotchas.md: "bağımlılığını tamamen mock'larsan testin kendi
 * mock'unu doğrular").
 */
export function useRoom(roomCode: RoomCode, deps?: Partial<UseRoomDeps>): UseRoomResult {
  const listenersRef = useRef(new Set<() => void>())
  const stateRef = useRef<RoomClientState>(initialRoomClientState())
  const clientRef = useRef<RoomWsClient | null>(null)
  // Yalnız İLK render'da okunur (lazy `useRef` başlangıç değeri) — testin
  // enjekte ettiği sahte `createSocket`/`now`/`rng` budur. `deps` normalde
  // (gerçek kullanımda) hiç verilmez, bu yüzden yeniden render'da değişmesi
  // desteklenen bir senaryo değildir.
  const depsRef = useRef(deps)

  useEffect(() => {
    // Bağlantı KURULUMU bilerek efekt İÇİNDE yapılır, render SIRASINDA değil:
    // `react-hooks/refs` render sırasında bir ref'i (`clientRef`) okuyan/kapatan
    // bir kapanışı fonksiyona GEÇİRMEYİ dahi kural ihlali sayıyor — "fonksiyon
    // render sırasında ref'in değerini okuyabilir" uyarısı. Efekt render
    // DIŞINDA çalıştığı için `clientRef`i burada güvenle okuyup yazabiliriz.
    const resolved = { ...defaultDeps(), ...depsRef.current }
    const client = createRoomWsClient({
      url: browserWsUrl(roomCode),
      roomCode,
      createSocket: resolved.createSocket,
      now: resolved.now,
      rng: resolved.rng,
      setTimer: (callback, ms) => setTimeout(callback, ms),
      clearTimer: (handle) => {
        clearTimeout(handle as ReturnType<typeof setTimeout>)
      },
      onChange: (next) => {
        stateRef.current = next
        for (const listener of listenersRef.current) listener()
      },
      // ADR-0006: bilet önce tazelenir, sonra bağlanılır. Bu iskelette taze
      // bilet almadan doğrudan yeniden bağlanmayı dener — gerçek `POST
      // /api/ws/ticket` çağrısı W1-03'te eklenir (kopma/yeniden bağlanma görevi).
      onReauth: () => {
        client.connect()
      },
    })
    clientRef.current = client
    client.connect()

    return () => {
      client.close()
      clientRef.current = null
    }
    // roomCode değişmez (rota parametresi) — bu efekt yalnız mount/unmount'ta çalışır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const subscribe = useCallback((onStoreChange: () => void) => {
    listenersRef.current.add(onStoreChange)
    return () => {
      listenersRef.current.delete(onStoreChange)
    }
  }, [])

  const getSnapshot = useCallback(() => stateRef.current, [])
  const getServerSnapshot = useCallback(() => initialRoomClientState(), [])

  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

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
        clientRef.current?.connect()
      },
    }),
    [],
  )

  return { state, actions }
}
