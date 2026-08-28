import { WS_CLOSE } from '@xox/shared'
import { describe, expect, it, vi } from 'vitest'
import { createNativeRoomClient } from './native-room-client'
import { FakeSocket, fakeTimers } from './test-fake-socket.fixture'

const ROOM_CODE = 'ABC234'
const WS_BASE_URL = 'wss://xox.test'

function setup(overrides: { refreshAccessToken?: () => Promise<string | null> } = {}) {
  const sockets: { url: string; token: string; socket: FakeSocket }[] = []
  const timers = fakeTimers()
  const onReauthExhausted = vi.fn()
  let refreshCalls = 0

  const refreshAccessToken =
    overrides.refreshAccessToken ??
    (() => {
      refreshCalls += 1
      return Promise.resolve(`yeni-erisim-${String(refreshCalls)}`)
    })

  const room = createNativeRoomClient({
    roomCode: ROOM_CODE,
    wsBaseUrl: WS_BASE_URL,
    initialAccessToken: 'ilk-erisim',
    refreshAccessToken,
    createSocket: (url, token) => {
      const socket = new FakeSocket(url)
      sockets.push({ url, token, socket })
      return socket
    },
    now: () => 0,
    rng: () => 0,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onChange: () => undefined,
    onReauthExhausted,
  })

  return { room, sockets, timers, onReauthExhausted, getRefreshCalls: () => refreshCalls }
}

describe('createNativeRoomClient', () => {
  it('connect() sabit url + İLK erişim jetonuyla soket açar (ticket YOK)', () => {
    const { room, sockets } = setup()
    room.connect()

    expect(sockets).toHaveLength(1)
    expect(sockets[0]?.url).toBe(`${WS_BASE_URL}/api/rooms/${ROOM_CODE}/ws`)
    expect(sockets[0]?.url).not.toContain('ticket=')
    expect(sockets[0]?.token).toBe('ilk-erisim')
  })

  it(
    'KRİTİK: 4401 alınca erişim jetonu YENİLENİR ve AYNI url ile YENİ jetonla ' +
      'yeniden bağlanılır',
    async () => {
      const { room, sockets, getRefreshCalls } = setup()
      room.connect()
      sockets[0]?.socket.open()

      sockets[0]?.socket.serverClosed(WS_CLOSE.UNAUTHENTICATED)
      await Promise.resolve()
      await Promise.resolve()

      expect(getRefreshCalls()).toBe(1)
      expect(sockets).toHaveLength(2)
      expect(sockets[1]?.url).toBe(sockets[0]?.url) // yol/host DEĞİŞMEDİ
      expect(sockets[1]?.token).toBe('yeni-erisim-1') // BAŞLIK yenilendi
      expect(sockets[1]?.token).not.toBe(sockets[0]?.token)
    },
  )

  it('refresh de başarısız olursa (null) onReauthExhausted çağrılır, yeniden bağlanılmaz', async () => {
    const { room, sockets, onReauthExhausted } = setup({
      refreshAccessToken: () => Promise.resolve(null),
    })
    room.connect()
    sockets[0]?.socket.open()

    sockets[0]?.socket.serverClosed(WS_CLOSE.UNAUTHENTICATED)
    await Promise.resolve()
    await Promise.resolve()

    expect(sockets).toHaveLength(1)
    expect(onReauthExhausted).toHaveBeenCalledTimes(1)
  })

  it('normal ağ kopmasında (1006) İÇSEL yeniden bağlanma AYNI (güncel) jetonu kullanır', () => {
    const { room, sockets, timers } = setup()
    room.connect()
    sockets[0]?.socket.open()

    sockets[0]?.socket.serverClosed(1006)
    timers.flushAll()

    expect(sockets).toHaveLength(2)
    expect(sockets[1]?.token).toBe('ilk-erisim')
  })

  it('dispatch/getState/close client-e devredilir', () => {
    const { room, sockets } = setup()
    room.connect()
    sockets[0]?.socket.open()

    expect(room.getState().connection).toBe('bagli')
    room.close()
    expect(sockets[0]?.socket.closes.length).toBeGreaterThan(0)
  })
})
