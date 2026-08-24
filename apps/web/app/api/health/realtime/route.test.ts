import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const PROBE_CODE = 'ABCDEF'

/** Hızlı koşu: 20 örnek (kabul kriterinin alt sınırı), boşluksuz, kısa zaman aşımı. */
const FAST = 'https://x.test/api/health/realtime?samples=20&gapMs=0&eventTimeoutMs=200'

interface MockState {
  watchCalls: unknown[][]
  openStream: () => unknown
  onWrite: (version: number, code: string) => void
}

const mockState = vi.hoisted<MockState>(() => ({
  watchCalls: [],
  openStream: () => ({}),
  onWrite: () => undefined,
}))

vi.mock('@xox/db', () => ({
  connectDb: vi.fn((): Promise<unknown> => Promise.resolve({})),
  getDbName: (): string => 'xox_test',
  generateRoomCode: (): string => PROBE_CODE,
  Room: {
    watch: vi.fn((...args: unknown[]): unknown => {
      mockState.watchCalls.push(args)
      return mockState.openStream()
    }),
    create: vi.fn((doc: { code: string }): Promise<unknown> => {
      mockState.onWrite(0, doc.code)
      return Promise.resolve(doc)
    }),
    updateOne: vi.fn(
      (filter: { code: string }, update: { $set: { version: number } }): Promise<unknown> => {
        mockState.onWrite(update.$set.version, filter.code)
        return Promise.resolve({ acknowledged: true })
      },
    ),
    deleteOne: vi.fn((): Promise<unknown> => Promise.resolve({ deletedCount: 1 })),
  },
}))

/**
 * Mongoose'un `Model.watch()` sarmalayıcısının GERÇEK yüzeyi taklit edilir:
 * `resumeToken` sarmalayıcıda YOKTUR (yalnız `driverChangeStream` üzerindedir) ve
 * hazır olma sinyali tiplerde bulunmayan `ready` olayıdır.
 */
class FakeChangeStream extends EventEmitter {
  public closed = false
  public driverChangeStream: { resumeToken: unknown } = { resumeToken: { _data: 'tok' } }
  public closeCalls = 0

  public close(): Promise<void> {
    this.closed = true
    this.closeCalls += 1
    return Promise.resolve()
  }

  public emitVersion(version: number, code: string): void {
    this.emit('change', {
      operationType: version === 0 ? 'insert' : 'update',
      fullDocument: { code, version },
    })
  }
}

let stream: FakeChangeStream
/** Hangi versiyonlar için olay yayınlanacak. `null` = hepsi. */
let deliverOnly: number[] | null
/** mongoose sarmalayıcısı `ready`'yi setImmediate ile yayınlar; taklit edilir. */
let emitReady: boolean

function req(url: string): Request {
  return new Request(url)
}

beforeEach(() => {
  stream = new FakeChangeStream()
  deliverOnly = null
  emitReady = true
  mockState.watchCalls = []
  mockState.openStream = (): unknown => {
    setImmediate(() => {
      if (emitReady) stream.emit('ready')
    })
    return stream
  }
  mockState.onWrite = (version: number, code: string): void => {
    queueMicrotask(() => {
      if (deliverOnly === null || deliverOnly.includes(version)) stream.emitVersion(version, code)
    })
  }
  vi.unstubAllEnvs()
})

async function call(url = FAST): Promise<{ status: number; body: Record<string, unknown> }> {
  const { GET } = await import('./route')
  const response = await GET(req(url))
  const text = await response.text()
  const body: Record<string, unknown> = text.startsWith('{')
    ? (JSON.parse(text) as Record<string, unknown>)
    : {}
  return { status: response.status, body }
}

describe('GET /api/health/realtime', () => {
  it('production ortamında 404 döner — yazma yapan sonda canlıda açıkta kalmaz', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')

    const { status } = await call()

    expect(status).toBe(404)
    expect(mockState.watchCalls).toHaveLength(0)
  })

  it('en az 20 örnek ölçer ve p50/p95/maks döndürür', async () => {
    const { status, body } = await call()

    expect(status).toBe(200)
    expect(body['ok']).toBe(true)
    expect(body['samples']).toBe(20)
    expect(typeof body['p50Ms']).toBe('number')
    expect(typeof body['p95Ms']).toBe('number')
    expect(typeof body['maxMs']).toBe('number')
    expect(body['censoredSamples']).toBe(0)
    expect(body['db']).toBe('xox_test')
    expect(body['allMs']).toHaveLength(20)
  })

  it('samples parametresi 20 alt sınırının altına indirilemez', async () => {
    const { body } = await call(
      'https://x.test/api/health/realtime?samples=3&gapMs=0&eventTimeoutMs=200',
    )

    expect(body['samples']).toBe(20)
  })

  it('geçersiz samples parametresi varsayılana düşer', async () => {
    const { body } = await call(
      'https://x.test/api/health/realtime?samples=abc&gapMs=0&eventTimeoutMs=200',
    )

    expect(body['samples']).toBe(25)
  })

  it('TEK change stream açar, işi bitince kapatır (ADR-0002 Z1)', async () => {
    const { body } = await call()

    expect(mockState.watchCalls).toHaveLength(1)
    expect(stream.closeCalls).toBe(1)
    expect(body['peakOpenStreams']).toBe(1)
    expect(body['openStreamsAfterClose']).toBe(0)
  })

  it('pipeline YALNIZ operationType üzerinde filtreler — fullDocument.* filtresi yok', async () => {
    await call()

    // Açılan HER stream denetlenir: ikinci bir stream eklenirse o da bu kapıdan geçer.
    expect(mockState.watchCalls.length).toBeGreaterThan(0)
    for (const args of mockState.watchCalls) {
      expect(args[0]).toEqual([
        { $match: { operationType: { $in: ['insert', 'update', 'replace', 'delete'] } } },
      ])
      expect(JSON.stringify(args[0])).not.toContain('fullDocument')
    }
  })

  it('sonda kendi yazdığı odayı siler', async () => {
    const { Room } = await import('@xox/db')

    await call()

    // eslint-disable-next-line @typescript-eslint/unbound-method -- yalnız çağrı kaydı okunuyor
    expect(vi.mocked(Room.deleteOne)).toHaveBeenCalledWith({ code: PROBE_CODE })
  })

  it('başka odanın olayı ölçümü çözmez — süreç içi kod filtresi çalışır', async () => {
    stream.once('change', () => {
      stream.emitVersion(1, 'ZZZZZZ')
    })

    const { body } = await call()

    expect(body['ok']).toBe(true)
    expect(body['samples']).toBe(20)
  })

  it('olay gelmeyen örnek sansürlü sayılır: ok:false ve verdict fail', async () => {
    // Isınma (0) ve 1..20 arasından 5. tur hariç hepsi teslim edilir.
    deliverOnly = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

    const { body } = await call()

    expect(body['censoredSamples']).toBe(1)
    expect(body['ok']).toBe(false)
    expect(body['verdict']).toBe('fail')
    expect(body['maxMs']).toBe(200)
    expect(stream.closed).toBe(true)
  })

  it('change stream hiç olay taşımazsa 503 döner ve stream yine de kapanır', async () => {
    deliverOnly = []

    const { status, body } = await call()

    expect(status).toBe(503)
    expect(body['ok']).toBe(false)
    expect(String(body['error'])).toContain('change stream')
    expect(stream.closed).toBe(true)
  })

  it('connectDb patlarsa 503 döner ve hiç stream açılmaz', async () => {
    const { connectDb } = await import('@xox/db')
    vi.mocked(connectDb).mockRejectedValueOnce(new Error('bağlantı reddedildi'))

    const { status, body } = await call()

    expect(status).toBe(503)
    expect(body['error']).toBe('bağlantı reddedildi')
    expect(mockState.watchCalls).toHaveLength(0)
  })

  it('Error olmayan hata da 503 üretir', async () => {
    const { connectDb } = await import('@xox/db')
    vi.mocked(connectDb).mockRejectedValueOnce('dize hata')

    const { status, body } = await call()

    expect(status).toBe(503)
    expect(body['error']).toBe('bilinmeyen hata')
  })

  it('eşzamanlı ikinci çağrı 409 alır — ikinci change stream açılmaz', async () => {
    const { GET } = await import('./route')

    const first = GET(req(FAST))
    const second = await GET(req(FAST))

    expect(second.status).toBe(409)
    await first
    expect(mockState.watchCalls).toHaveLength(1)
  })

  it('stream error olayı bekleyenleri serbest bırakır ve hata mesajına yansır', async () => {
    deliverOnly = []
    const { GET } = await import('./route')

    const pending = GET(req(FAST))
    queueMicrotask(() => {
      stream.emit('error', new Error('resume token bulunamadı'))
    })
    const response = await pending
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(503)
    expect(String(body['error'])).toContain('resume token bulunamadı')
  })

  it('ready olayı hiç gelmezse zaman aşımına uğrar ama sonda yine de ölçer', async () => {
    emitReady = false

    const { status, body } = await call()

    expect(status).toBe(200)
    expect(body['streamReady']).toBe(false)
    expect(body['samples']).toBe(20)
  })

  it('mongoose sarmalayıcısında resumeToken YOKTUR, sürücü nesnesindedir', async () => {
    const { body } = await call()

    expect(body['resumeTokenOnWrapper']).toBe(false)
    expect(body['resumeTokenOnDriver']).toBe(true)
  })
})
