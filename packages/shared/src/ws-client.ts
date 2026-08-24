import { WS_HEARTBEAT_MS } from './constants'
import type { RoomCode } from './primitives'
import {
  type RoomClientEffect,
  type RoomClientEvent,
  type RoomClientState,
  type RoomClientUiEvent,
  initialRoomClientState,
  nextReconnectDelay,
  roomClientReducer,
} from './room-client'
import { WS_CLOSE } from './ws-close'
import { type ClientMessage, serverMessageSchema } from './ws-protocol'

/**
 * WS taşıma istemcisi: `room-client.ts`'in ürettiği efektleri yürüten **tek**
 * yer. Soket, zaman ve rastgelelik buraya da gömülmez; hepsi `deps` üzerinden
 * enjekte edilir. Böylece tarayıcı `WebSocket`'i, React Native `WebSocket`'i ve
 * testteki sahte soket aynı kodu koşturur (tasarım §5.6).
 */
export interface SocketLike {
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
}

export type TimerHandle = unknown

export interface RoomWsClientDeps {
  /** Bilet/çerez bilgisini içeren tam WS adresi. */
  readonly url: string
  /** Resync `join` mesajı için gerekir. */
  readonly roomCode: RoomCode
  readonly createSocket: (url: string) => SocketLike
  readonly now: () => number
  readonly rng: () => number
  readonly setTimer: (callback: () => void, ms: number) => TimerHandle
  readonly clearTimer: (handle: TimerHandle) => void
  readonly onChange: (state: RoomClientState) => void
  /**
   * 4401 — çağıran yeni bilet alır ve `connect(yeniUrl)` çağırır. G/Ç bu
   * pakete girmez (ADR-0006). `attempt` kaçıncı deneme olduğunu söyler:
   * bozuk bilet üreten bir sunucuda çağıran pes edebilmeli.
   */
  readonly onReauth: (attempt: number) => void
}

export interface RoomWsClient {
  /** Bağlanır; bilet tazelendiyse yeni adresle çağrılır. */
  connect(url?: string): void
  dispatch(event: RoomClientUiEvent): void
  getState(): RoomClientState
  close(): void
}

/** 2 kayıp nabız = kopuk (KK-060). Sunucunun 4408 eşiği 3 nabızdır. */
const HEARTBEAT_LOSS_MS = WS_HEARTBEAT_MS * 2
const NORMAL_CLOSE = 1000

export function createRoomWsClient(deps: RoomWsClientDeps): RoomWsClient {
  let state = initialRoomClientState()
  let socket: SocketLike | null = null
  let heartbeatTimer: TimerHandle = null
  let reconnectTimer: TimerHandle = null
  let lastPongAt = 0
  let url = deps.url

  function run(event: RoomClientEvent): void {
    const result = roomClientReducer(state, event)
    state = result.state
    deps.onChange(state)
    for (const effect of result.effects) apply(effect)
  }

  function apply(effect: RoomClientEffect): void {
    switch (effect.type) {
      case 'send':
        write(effect.message)
        return
      case 'resync':
        write({ type: 'join', roomCode: deps.roomCode })
        return
      case 'reauth':
        deps.onReauth(effect.attempt)
        return
      case 'reconnect':
        scheduleReconnect(effect.attempt, effect.immediate)
        return
    }
  }

  function write(message: ClientMessage): void {
    // Gönderim üreten her yol açık bir soket gerektirir: kullanıcı eylemlerinin
    // kapısı `connection === 'bagli'`, `resync` yalnız canlı soketin
    // çerçevesinden doğar, `ping` yalnız nabız zamanlayıcısından — o da
    // `abandon()` ile durur. Aşağıdaki dal bu yüzden ERİŞİLEMEZ; tipin
    // totalliği için var, kapsamdan bilerek dışlandı.
    /* v8 ignore next */
    if (socket === null) return
    socket.send(JSON.stringify(message))
  }

  function scheduleReconnect(attempt: number, immediate: boolean): void {
    const delay = immediate ? 0 : nextReconnectDelay(attempt, deps.rng)
    reconnectTimer = deps.setTimer(() => {
      connect()
    }, delay)
  }

  function scheduleHeartbeat(): void {
    heartbeatTimer = deps.setTimer(onHeartbeat, WS_HEARTBEAT_MS)
  }

  function onHeartbeat(): void {
    if (deps.now() - lastPongAt >= HEARTBEAT_LOSS_MS) {
      dropConnection()
      return
    }
    write({ type: 'ping' })
    scheduleHeartbeat()
  }

  /** Sessiz kalan bağlantıyı biz kapatırız; sunucunun 4408'ini beklemeyiz. */
  function dropConnection(): void {
    abandon(WS_CLOSE.IDLE_TIMEOUT)
    run({ type: 'socket:closed', code: WS_CLOSE.IDLE_TIMEOUT })
  }

  function stopTimers(): void {
    if (heartbeatTimer !== null) deps.clearTimer(heartbeatTimer)
    if (reconnectTimer !== null) deps.clearTimer(reconnectTimer)
    heartbeatTimer = null
    reconnectTimer = null
  }

  /**
   * Soketi **biz** bıraktığımızda kullanılır. İki iş birden yapar:
   *
   * 1. Dinleyicileri sıfırlar — yoksa bizim `close()` çağrımızın ardından gelen
   *    `onclose` ikinci bir kapanış olayı üretir, backoff sayacı iki kez artar.
   * 2. Soketi gerçekten **kapatır**. Terk edip kapatmamak yetim bir bağlantı
   *    bırakır: sunucunun 4408 eşiğine kadar açık kalır, bir Fluid çağrısını
   *    tutar ve gereksiz bir takeover yazması üretir.
   */
  function abandon(code: number): void {
    stopTimers()
    if (socket !== null) {
      const dying = socket
      socket = null
      dying.onopen = null
      dying.onmessage = null
      dying.onclose = null
      dying.close(code)
    }
  }

  function handleFrame(data: unknown): void {
    if (typeof data !== 'string') return
    const parsed = parseJson(data)
    if (parsed === undefined) return
    const result = serverMessageSchema.safeParse(parsed)
    if (!result.success) return
    if (result.data.type === 'pong') lastPongAt = deps.now()
    run({ type: 'server', message: result.data, now: deps.now() })
  }

  function connect(nextUrl?: string): void {
    if (nextUrl !== undefined) url = nextUrl
    abandon(NORMAL_CLOSE)
    run({ type: 'socket:connecting' })

    const opened = deps.createSocket(url)
    socket = opened
    opened.onopen = (): void => {
      lastPongAt = deps.now()
      scheduleHeartbeat()
      run({ type: 'socket:open' })
    }
    opened.onmessage = (event): void => {
      // Ölü ya da devredilmiş soketten düşen geç çerçeve İŞLENMEZ: sürümce geri
      // sardırırdı. Tarayıcıda olay sırası bunu neredeyse imkânsız kılıyor,
      // React Native köprüsünde daha az kesin.
      if (socket !== opened) return
      handleFrame(event.data)
    }
    opened.onclose = (event): void => {
      // Soket zaten öldü: dinleyicileri sıfırlamak gereksiz, referansı
      // düşürmek yeterli. Bu sırada düşen geç bir çerçeve `write` içinde
      // sessizce yutulur.
      stopTimers()
      socket = null
      run({ type: 'socket:closed', code: event.code })
    }
  }

  return {
    connect,
    dispatch: (event) => {
      run(event)
    },
    getState: () => state,
    close: () => {
      abandon(NORMAL_CLOSE)
      run({ type: 'client:closed' })
    },
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}
