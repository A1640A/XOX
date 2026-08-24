'use client'

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  createRoomWsClient,
  initialRoomClientState,
  nextReconnectDelay,
  type Emoji,
  type RoomClientState,
  type RoomCode,
  type RoomWsClient,
  type SocketLike,
} from '@xox/shared'

/**
 * ADR-0006 "attempt taşınır: bileti tazeleyen taraf bozuk bilet döngüsünde
 * pes edebilmeli" — 4401 (kimlik reddi) art arda gelirse bu kadar denemeden
 * sonra vazgeçilir. Aşılırsa `client.close()` çağrılır: reducer'ın kendi
 * `client:closed` yolundan `connection: 'kopuk'` olur, `lastError` bir önceki
 * `requiresReauth` geçişinden zaten `'UNAUTHENTICATED'`dir — kullanıcı donmuş
 * "Bağlanıyor…" yerine gerçek bir hata görür ve `ConnectionBadge`nin
 * `onRetry`ı (`actions.reconnect`) ile MANUEL yeniden dener.
 */
const MAX_REAUTH_ATTEMPTS = 5

/**
 * MAJOR düzeltmesi: `useSyncExternalStore`'un üçüncü argümanı (`getServerSnapshot`)
 * her çağrıda AYNI referansı döndürmek ZORUNDADIR. Önceki sürüm
 * `() => initialRoomClientState()` yazıyordu — bu fonksiyon her çağrıda YENİ
 * bir nesne üretiyor, `useCallback` yalnız fonksiyon KİMLİĞİNİ sabitliyordu,
 * DÖNEN DEĞERİ değil. Canlı kanıt: `hydrateRoot` altında React
 * "The result of getServerSnapshot should be cached to avoid an infinite
 * loop" uyarısı basıyordu (bkz. `use-room.test.tsx`, `renderToString` +
 * `hydrateRoot` sondası) — `/oda/[kod]` bir istemci bileşeni olarak SSR
 * edildiği için bu HER sayfa yüklemesinde tetikleniyordu. RTL'in `render()`'ı
 * hidrasyon yapmadığı için önceki 8 test de bunu görmüyordu.
 * Tek modül-düzeyi dondurulmuş örnek — hiçbir yerde MUTATE edilmez
 * (`RoomClientState`in tüm alanları zaten `readonly`).
 */
const SERVER_SNAPSHOT: RoomClientState = initialRoomClientState()

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
  const stateRef = useRef<RoomClientState>(SERVER_SNAPSHOT)
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
    let reauthTimer: ReturnType<typeof setTimeout> | null = null
    // `let` + sonradan atama BİLEREK: `handleReauth` `client`i kapanış olarak
    // yakalar ama yalnızca SOKET OLAYINDAN sonra (asenkron) çağrılır — bu satır
    // hiçbir zaman `client` atanmadan ÇALIŞTIRILMAZ. İnceleme bulgusu: bunu
    // ayrı bir `let` ile açık yazmak (tek bir iç içe nesne yerine, ki o zaman
    // `createRoomWsClient({ onReauth: () => client.connect() })` kendi
    // initializer'ı İÇİNDE `client`e referans verirdi) niyeti netleştiriyor.
    // `prefer-const` bunun TEK atama olduğunu görüp `const`a zorlar ama `const`
    // ile yazmanın TEK yolu tam olarak kaçınmak istediğimiz iç içe kalıptır.
    // eslint-disable-next-line prefer-const
    let client: RoomWsClient

    /**
     * BLOKER düzeltmesi: 4401 (kimlik reddi) art arda geldiğinde önceki sürüm
     * `attempt`i yok sayıp anında `connect()` çağırıyordu — sunucu her seferinde
     * 4401 ile kapatırsa bu, aralarında gecikme OLMAYAN sonsuz bir yeniden
     * bağlanma fırtınasıydı (canlı ölçüm: 21 kapanış → 22 soket, 0 ms). Şimdi:
     * eşik altında `nextReconnectDelay(attempt, rng)` kadar bekleyip TEK bir
     * `setTimeout` ile yeniden dener; eşik (`MAX_REAUTH_ATTEMPTS`) aşılırsa
     * `client.close()` ile TEMİZ pes eder (`connection: 'kopuk'`,
     * `lastError` zaten `'UNAUTHENTICATED'`), bir daha KENDİLİĞİNDEN denemez.
     */
    function handleReauth(attempt: number): void {
      if (attempt >= MAX_REAUTH_ATTEMPTS) {
        client.close()
        return
      }
      reauthTimer = setTimeout(
        () => {
          reauthTimer = null
          client.connect()
        },
        nextReconnectDelay(attempt, resolved.rng),
      )
    }

    client = createRoomWsClient({
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
      onReauth: handleReauth,
    })
    clientRef.current = client
    client.connect()

    return () => {
      // Bekleyen bir reauth zamanlayıcısı varsa temizle — aksi hâlde unmount
      // SONRASI `connect()` çağrılır (yetim bir soket açılır, hiçbir dinleyici
      // güncellemeyi göremez ama bağlantı sızar).
      if (reauthTimer !== null) clearTimeout(reauthTimer)
      client.close()
      clientRef.current = null
    }
    // roomCode DEĞİŞEBİLİR (bulgu #3: aynı dinamik segment içinde istemci-taraflı
    // gezinme bileşeni remount etmeyebilir) — efekt bunu bağımlılık olarak alır,
    // böylece kod değişince eski soket kapanır ve YENİ roomCode'a bağlı bir
    // soket açılır. Yanlış odaya hamle gitmesini önleyen tek mekanizma budur.
  }, [roomCode])

  const subscribe = useCallback((onStoreChange: () => void) => {
    listenersRef.current.add(onStoreChange)
    return () => {
      listenersRef.current.delete(onStoreChange)
    }
  }, [])

  const getSnapshot = useCallback(() => stateRef.current, [])
  const getServerSnapshot = useCallback(() => SERVER_SNAPSHOT, [])

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
