import { WS_CLOSE } from '@xox/shared'
import { describe, expect, it, vi } from 'vitest'
import { createWebRoomClient } from './web-room-client'
import { fakeStateMessage, FakeSocket, fakeTimers } from './test-fake-socket.fixture'

const ROOM_CODE = 'ABC234'
const WS_BASE_URL = 'wss://xox.test'

function setup(overrides: { fetchTicket?: (roomCode: string) => Promise<string | null> } = {}) {
  const sockets: FakeSocket[] = []
  const changes: unknown[] = []
  const ticketCalls: string[] = []
  const timers = fakeTimers()
  const onReauthExhausted = vi.fn()

  const fetchTicket =
    overrides.fetchTicket ??
    ((roomCode: string) => {
      ticketCalls.push(roomCode)
      return Promise.resolve(`bilet-${String(ticketCalls.length)}`)
    })

  const room = createWebRoomClient({
    roomCode: ROOM_CODE,
    wsBaseUrl: WS_BASE_URL,
    fetchTicket,
    createSocket: (url) => {
      const socket = new FakeSocket(url)
      sockets.push(socket)
      return socket
    },
    now: () => 0,
    rng: () => 0,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onChange: (state) => {
      changes.push(state)
    },
    onReauthExhausted,
  })

  return { room, sockets, changes, ticketCalls, timers, onReauthExhausted }
}

describe('createWebRoomClient', () => {
  it('connect() ÖNCE bilet alır, SONRA o biletle soket açar', async () => {
    const { room, sockets, ticketCalls } = setup()

    await room.connect()

    expect(ticketCalls).toStrictEqual([ROOM_CODE])
    expect(sockets).toHaveLength(1)
    expect(sockets[0]?.url).toBe(`${WS_BASE_URL}/api/rooms/${ROOM_CODE}/ws?ticket=bilet-1`)
  })

  it(
    "KRİTİK: sunucu bağlantıyı 4401'le kapatınca (bilet reddi/eski) YENİ bir bilet " +
      'alınır ve YENİ url ile yeniden bağlanılır — eski bilet İKİNCİ KEZ kullanılmaz',
    async () => {
      const { room, sockets, ticketCalls } = setup()
      await room.connect()
      sockets[0]?.open()

      sockets[0]?.serverClosed(WS_CLOSE.UNAUTHENTICATED)
      // reauth async — mikro görev kuyruğunun boşalmasını bekle.
      await Promise.resolve()
      await Promise.resolve()

      expect(ticketCalls).toStrictEqual([ROOM_CODE, ROOM_CODE])
      expect(sockets).toHaveLength(2)
      expect(sockets[1]?.url).toBe(`${WS_BASE_URL}/api/rooms/${ROOM_CODE}/ws?ticket=bilet-2`)
      expect(sockets[1]?.url).not.toBe(sockets[0]?.url)
    },
  )

  it(
    'UÇTAN UCA ÖZ SENARYO: ws-client.ts normal (4401 DIŞI) bir kapanışta İÇSEL OLARAK ' +
      'bare connect() (eski url/eski bilet) dener; sunucu bunu HEMEN 4401 ile reddeder; ' +
      "bu, reauth'u tetikler ve YENİ bilet alınır — sessiz kilitlenme YOK",
    async () => {
      const { room, sockets, ticketCalls, timers } = setup()
      await room.connect()
      sockets[0]?.open()
      const firstUrl = sockets[0]?.url

      // Ağ kesintisi (1006 benzeri) — 4401/4409/4499 DIŞI bir kapanış.
      sockets[0]?.serverClosed(1006)
      // ws-client.ts backoff sonrası içsel `connect()`i (url'siz -> eski url) zamanlayıcıyla planlar.
      timers.flushAll()

      expect(sockets).toHaveLength(2)
      expect(sockets[1]?.url).toBe(firstUrl) // İçsel yeniden bağlanma ESKİ (tükenmiş) bileti kullandı.

      // Sunucu tükenmiş bileti reddeder:
      sockets[1]?.serverClosed(WS_CLOSE.UNAUTHENTICATED)
      await Promise.resolve()
      await Promise.resolve()

      expect(ticketCalls).toStrictEqual([ROOM_CODE, ROOM_CODE])
      expect(sockets).toHaveLength(3)
      expect(sockets[2]?.url).not.toBe(firstUrl)
      expect(sockets[2]?.url).toContain('ticket=bilet-2')
    },
  )

  it('bilet alınamazsa (null) onReauthExhausted çağrılır, yeni soket AÇILMAZ', async () => {
    const { room, sockets, onReauthExhausted } = setup({ fetchTicket: () => Promise.resolve(null) })

    await room.connect()

    expect(sockets).toHaveLength(0)
    expect(onReauthExhausted).toHaveBeenCalledTimes(1)
  })

  it('MAX_REAUTH_ATTEMPTS aşılınca pes edilir — sonsuz döngü YOK', async () => {
    const { room, sockets, onReauthExhausted } = setup()
    await room.connect()
    sockets[0]?.open()

    // Art arda 4401'ler — her biri bir reauth denemesi sayılır.
    for (let i = 0; i < 6; i += 1) {
      const last = sockets.at(-1)
      last?.serverClosed(WS_CLOSE.UNAUTHENTICATED)
      await Promise.resolve()
      await Promise.resolve()
    }

    expect(onReauthExhausted).toHaveBeenCalledTimes(1)
  })

  it('gerçek durum akışı çalışır: state mesajı onChange ile teslim edilir', async () => {
    const { room, sockets, changes } = setup()
    await room.connect()
    sockets[0]?.open()
    sockets[0]?.receive(fakeStateMessage(ROOM_CODE))

    expect(changes.length).toBeGreaterThan(0)
    expect(room.getState().connection).toBe('bagli')
  })

  it('dispatch ve close client-e devredilir', async () => {
    const { room, sockets } = setup()
    await room.connect()
    sockets[0]?.open()

    room.dispatch({ type: 'ui:resign' })
    expect(sockets[0]?.sent).toHaveLength(0) // you===null iken kapı kapalı — sessizce yok sayılır.

    room.close()
    expect(sockets[0]?.closes.length).toBeGreaterThan(0)
  })
})
