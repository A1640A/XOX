import type { RoomDoc } from '@xox/db'
import type { Cell } from '@xox/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRoomHub,
  roomHub,
  type ChangeStreamLike,
  type RoomHub,
  type RoomHubDeps,
  type RoomSubscriber,
} from './room-hub'

const EMPTY: Cell[] = [null, null, null, null, null, null, null, null, null]

function makeRoom(code: string, version = 1): RoomDoc {
  return {
    code,
    state: 'playing',
    seats: { X: null, O: null },
    presence: { X: null, O: null },
    board: [...EMPTY],
    moves: [],
    turnDeadline: null,
    disconnected: null,
    rematch: null,
    lastEmoji: null,
    gameId: null,
    version,
    startedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }
}

interface FakeStream extends ChangeStreamLike {
  emit(event: string, payload: unknown): void
  closed: boolean
}

interface Harness {
  hub: RoomHub
  streams: FakeStream[]
  watchArgs: { pipeline: unknown[]; options: Record<string, unknown> }[]
  timers: { callback: () => void; ms: number }[]
  findRoom: ReturnType<typeof vi.fn>
  rooms: Map<string, RoomDoc>
  runTimer(index?: number): void
}

function harness(overrides: Partial<RoomHubDeps> = {}): Harness {
  const streams: FakeStream[] = []
  const watchArgs: Harness['watchArgs'] = []
  const timers: Harness['timers'] = []
  const rooms = new Map<string, RoomDoc>()

  const findRoom = vi.fn((code: string) => Promise.resolve(rooms.get(code) ?? null))

  const deps: RoomHubDeps = {
    connect: () => Promise.resolve(),
    watch: (pipeline, options) => {
      watchArgs.push({ pipeline, options })
      const listeners = new Map<string, ((payload: unknown) => void)[]>()
      const stream: FakeStream = {
        closed: false,
        on(event, listener) {
          const list = listeners.get(event) ?? []
          list.push(listener)
          listeners.set(event, list)
          return stream
        },
        close() {
          stream.closed = true
          return Promise.resolve()
        },
        emit(event, payload) {
          for (const listener of listeners.get(event) ?? []) listener(payload)
        },
      }
      streams.push(stream)
      return stream
    },
    findRoom,
    setTimer: (callback, ms) => {
      timers.push({ callback, ms })
      return timers.length - 1
    },
    clearTimer: () => undefined,
    logError: () => undefined,
    ...overrides,
  }

  const hub = createRoomHub(deps)
  return {
    hub,
    streams,
    watchArgs,
    timers,
    findRoom,
    rooms,
    runTimer(index = timers.length - 1) {
      timers[index]?.callback()
    },
  }
}

interface Recorder extends RoomSubscriber {
  changes: RoomDoc[]
  forced: (RoomDoc | null)[]
  deleted: number
}

function recorder(roomCode: string): Recorder {
  const rec: Recorder = {
    roomCode,
    changes: [],
    forced: [],
    deleted: 0,
    onRoomChange(room) {
      rec.changes.push(room)
    },
    onForcedState(room) {
      rec.forced.push(room)
    },
    onRoomDeleted() {
      rec.deleted += 1
    },
  }
  return rec
}

function changeEvent(operationType: string, room: RoomDoc | null, id = 'oid-1'): unknown {
  return { operationType, documentKey: { _id: id }, fullDocument: room }
}

describe('room-hub · tek stream değişmezi (ADR-0002)', () => {
  it('hub kurulduğunda HİÇ stream açılmaz — tembel açılış (Z1)', () => {
    const h = harness()
    expect(h.watchArgs).toHaveLength(0)
    expect(h.hub.stats().openStreams).toBe(0)
  })

  it('ÜÇ abone eklendiğinde Room.watch TAM 1 kez çağrılır', async () => {
    const h = harness()
    await h.hub.subscribe(recorder('AAA222'))
    await h.hub.subscribe(recorder('AAA222'))
    await h.hub.subscribe(recorder('BBB333'))

    expect(h.watchArgs).toHaveLength(1)
    expect(h.hub.stats()).toMatchObject({ watchCalls: 1, openStreams: 1, rooms: 2, subscribers: 3 })
  })

  it('eşzamanlı üç subscribe (await edilmeden) da tek stream açar', async () => {
    const h = harness()
    await Promise.all([
      h.hub.subscribe(recorder('AAA222')),
      h.hub.subscribe(recorder('BBB333')),
      h.hub.subscribe(recorder('CCC444')),
    ])
    expect(h.watchArgs).toHaveLength(1)
  })

  it('son abone gidince stream KAPANIR, öncesinde kapanmaz', async () => {
    const h = harness()
    const a = recorder('AAA222')
    const b = recorder('BBB333')
    await h.hub.subscribe(a)
    await h.hub.subscribe(b)

    await h.hub.unsubscribe(a)
    expect(h.streams[0]?.closed).toBe(false)
    expect(h.hub.stats().openStreams).toBe(1)

    await h.hub.unsubscribe(b)
    expect(h.streams[0]?.closed).toBe(true)
    expect(h.hub.stats()).toMatchObject({ openStreams: 0, rooms: 0, subscribers: 0 })
  })

  it('kapandıktan sonra yeni abone İKİNCİ bir watch açar (aynı anda yine tek)', async () => {
    const h = harness()
    const a = recorder('AAA222')
    await h.hub.subscribe(a)
    await h.hub.unsubscribe(a)
    await h.hub.subscribe(recorder('AAA222'))

    expect(h.watchArgs).toHaveLength(2)
    expect(h.hub.stats().openStreams).toBe(1)
  })

  it('modül kapsamındaki roomHub tek örnektir', () => {
    expect(roomHub).toBe(roomHub)
    expect(roomHub.stats().openStreams).toBe(0)
  })
})

describe('room-hub · pipeline ve seçenekler', () => {
  it('pipeline YALNIZ operationType üzerinde $match uygular', async () => {
    const h = harness()
    await h.hub.subscribe(recorder('AAA222'))

    expect(h.watchArgs[0]?.pipeline).toStrictEqual([
      { $match: { operationType: { $in: ['insert', 'update', 'replace', 'delete'] } } },
    ])
  })

  it('ilk açılışta startAfter YOKTUR, fullDocument updateLookup', async () => {
    const h = harness()
    await h.hub.subscribe(recorder('AAA222'))

    expect(h.watchArgs[0]?.options).toStrictEqual({ fullDocument: 'updateLookup' })
  })
})

describe('room-hub · süreç içi oda filtresi', () => {
  it('olay yalnız eşleşen odanın abonelerine gider', async () => {
    const h = harness()
    const a = recorder('AAA222')
    const b = recorder('BBB333')
    await h.hub.subscribe(a)
    await h.hub.subscribe(b)

    h.streams[0]?.emit('change', changeEvent('update', makeRoom('AAA222', 5)))

    expect(a.changes.map((r) => r.version)).toStrictEqual([5])
    expect(b.changes).toHaveLength(0)
  })

  it('abonesi olmayan odanın olayı sessizce düşer', async () => {
    const h = harness()
    const a = recorder('AAA222')
    await h.hub.subscribe(a)

    h.streams[0]?.emit('change', changeEvent('update', makeRoom('ZZZ999', 3)))
    expect(a.changes).toHaveLength(0)
  })

  it('delete olayı fullDocument taşımaz — kod _id haritasından bulunur', async () => {
    const h = harness()
    const a = recorder('AAA222')
    await h.hub.subscribe(a)

    h.streams[0]?.emit('change', changeEvent('update', makeRoom('AAA222', 2), 'oid-9'))
    h.streams[0]?.emit('change', changeEvent('delete', null, 'oid-9'))

    expect(a.deleted).toBe(1)
  })

  it('hiç görülmemiş _id için delete kimseyi uyandırmaz', async () => {
    const h = harness()
    const a = recorder('AAA222')
    await h.hub.subscribe(a)

    h.streams[0]?.emit('change', changeEvent('delete', null, 'bilinmeyen'))
    expect(a.deleted).toBe(0)
  })

  it('bozuk olay (fullDocument yok, kod yok) hiçbir aboneyi çökertmez', async () => {
    const h = harness()
    const a = recorder('AAA222')
    await h.hub.subscribe(a)

    expect(() => {
      h.streams[0]?.emit('change', { operationType: 'update' })
      h.streams[0]?.emit('change', null)
      h.streams[0]?.emit('change', { operationType: 'update', fullDocument: { code: 42 } })
    }).not.toThrow()
    expect(a.changes).toHaveLength(0)
  })
})

describe('room-hub · kopma, resume token ve zorunlu resync', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('error olayında üstel geri çekilmeyle yeniden açılır ve startAfter TAŞINIR', async () => {
    const h = harness()
    const a = recorder('AAA222')
    h.rooms.set('AAA222', makeRoom('AAA222', 42))
    await h.hub.subscribe(a)

    h.streams[0]?.emit('resumeTokenChanged', { _data: 'token-1' })
    h.streams[0]?.emit('error', new Error('stream düştü'))

    expect(h.timers[0]?.ms).toBe(500)
    h.runTimer(0)

    await vi.waitFor(() => {
      expect(h.watchArgs).toHaveLength(2)
    })
    expect(h.watchArgs[1]?.options).toStrictEqual({
      fullDocument: 'updateLookup',
      startAfter: { _data: 'token-1' },
    })
  })

  it('yeniden açıldıktan sonra TÜM yerel abonelere zorla tam state gider', async () => {
    const h = harness()
    const a = recorder('AAA222')
    const b = recorder('AAA222')
    const c = recorder('BBB333')
    h.rooms.set('AAA222', makeRoom('AAA222', 9))
    await h.hub.subscribe(a)
    await h.hub.subscribe(b)
    await h.hub.subscribe(c)

    h.streams[0]?.emit('error', new Error('kopma'))
    h.runTimer(0)

    await vi.waitFor(() => {
      expect(a.forced).toHaveLength(1)
      expect(b.forced).toHaveLength(1)
      expect(c.forced).toHaveLength(1)
    })
    expect(a.forced[0]?.version).toBe(9)
    // Oda bulunamazsa null gider — abone bunu 4404 olarak yorumlar.
    expect(c.forced[0]).toBeNull()
    // Oda başına TEK okuma: bağlantı başına değil (AAA222'de iki abone var).
    expect(h.findRoom).toHaveBeenCalledTimes(2)
  })

  it('geri çekilme 500 → 1000 → 2000 … 10000 ile tavanlanır', async () => {
    const h = harness()
    await h.hub.subscribe(recorder('AAA222'))

    const observed: number[] = []
    for (let i = 0; i < 7; i += 1) {
      h.streams[h.streams.length - 1]?.emit('error', new Error('yine'))
      const timer = h.timers[h.timers.length - 1]
      observed.push(timer?.ms ?? -1)
      timer?.callback()
      await vi.waitFor(() => {
        expect(h.streams).toHaveLength(i + 2)
      })
    }

    expect(observed).toStrictEqual([500, 1000, 2000, 4000, 8000, 10000, 10000])
  })

  it('yeniden AÇILMIŞ olmak tek başına sayacı sıfırlamaz (olay gelmedikçe)', async () => {
    // CTR-002 dersi: "başarılı bağlantı" sayacı sıfırlarsa, açılır açılmaz
    // ölen bir stream sonsuza dek 500 ms'de bir denenir ve geri çekilme ölür.
    const h = harness()
    await h.hub.subscribe(recorder('AAA222'))

    h.streams[0]?.emit('error', new Error('bir'))
    h.runTimer()
    await vi.waitFor(() => {
      expect(h.streams).toHaveLength(2)
    })

    h.streams[1]?.emit('error', new Error('iki'))
    expect(h.timers[h.timers.length - 1]?.ms).toBe(1000)
  })

  it('GERÇEK bir olay geldikten sonra (yaşam kanıtı) sayaç sıfırlanır', async () => {
    const h = harness()
    await h.hub.subscribe(recorder('AAA222'))

    h.streams[0]?.emit('error', new Error('bir'))
    h.runTimer()
    await vi.waitFor(() => {
      expect(h.streams).toHaveLength(2)
    })

    h.streams[1]?.emit('change', changeEvent('update', makeRoom('AAA222', 3)))
    h.streams[1]?.emit('error', new Error('iki'))
    expect(h.timers[h.timers.length - 1]?.ms).toBe(500)
  })

  it('beklenmedik close olayı da yeniden açılışı tetikler', async () => {
    const h = harness()
    await h.hub.subscribe(recorder('AAA222'))

    h.streams[0]?.emit('close', undefined)
    expect(h.timers).toHaveLength(1)
    h.runTimer()
    await vi.waitFor(() => {
      expect(h.streams).toHaveLength(2)
    })
  })

  it('abone kalmadıysa yeniden AÇILMAZ — havuz bağlantısı boşta tutulmaz', async () => {
    const h = harness()
    const a = recorder('AAA222')
    await h.hub.subscribe(a)

    h.streams[0]?.emit('error', new Error('kopma'))
    await h.hub.unsubscribe(a)
    h.runTimer(0)

    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(h.watchArgs).toHaveLength(1)
  })

  it('bilerek kapatma resume token`ı DÜŞÜRÜR — bayat token ile açılmaz', async () => {
    const h = harness()
    const a = recorder('AAA222')
    await h.hub.subscribe(a)
    h.streams[0]?.emit('resumeTokenChanged', { _data: 'token-1' })
    await h.hub.unsubscribe(a)

    await h.hub.subscribe(recorder('AAA222'))
    expect(h.watchArgs[1]?.options).toStrictEqual({ fullDocument: 'updateLookup' })
  })

  it('watch fırlatırsa subscribe patlamaz, geri çekilmeye girer', async () => {
    let fail = true
    const h = harness({
      watch: () => {
        if (fail) throw new Error('bağlantı yok')
        throw new Error('bir daha')
      },
    })
    await expect(h.hub.subscribe(recorder('AAA222'))).resolves.toBeUndefined()
    fail = false
    expect(h.hub.stats().openStreams).toBe(0)
    expect(h.timers).toHaveLength(1)
  })
})
