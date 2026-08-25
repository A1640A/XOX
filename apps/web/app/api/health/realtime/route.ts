import { Room, connectDb, generateRoomCode, getDbName, type RoomDoc } from '@xox/db'
import { roomHub } from '@/lib/realtime/room-hub'

export const dynamic = 'force-dynamic'
/** Sonda ~25 tur yazma + olay bekleme yapar; varsayılan 10 sn'ye sığmaz. */
export const maxDuration = 60

/** KK-040 bütçesi. p95 bunu aşarsa ADR-0002 revize edilir (karar lead'in). */
const BUDGET_MS = 1500

/**
 * Ayarlanabilir eşikler. Ölçüm gürültülüyse örnek sayısı `?samples=` ile
 * yeniden deploy etmeden artırılır (kabul kriteri: N >= 20 — alt sınır dayatılır).
 */
const LIMITS = {
  samples: { fallback: 25, min: 20, max: 100 },
  eventTimeoutMs: { fallback: 8_000, min: 200, max: 15_000 },
  gapMs: { fallback: 100, min: 0, max: 2_000 },
} as const

/** `ready` olayı bu süre içinde gelmezse yine de ısınma turuna geçilir. */
const READY_TIMEOUT_MS = 3_000

/** Isınma turu birden fazla denenebilir: cursor kurulumu ile ilk yazma yarışabilir. */
const WARMUP_ATTEMPTS = 4

/**
 * ADR-0002 · Z1: her açık change stream havuzdan bir bağlantıyı `getMore` ile
 * tutar. `maxPoolSize: 10` altında instance başına EN FAZLA BİR stream açılabilir.
 * Bu sayaçlar o değişmezi ölçülebilir kılar; yanıtta rapor edilirler.
 */
let openStreams = 0
let peakOpenStreams = 0
/** Eşzamanlı iki sonda çağrısı ikinci bir stream açardı — kilitle. */
let probeRunning = false

interface Sample {
  /** Yazmanın başlatıldığı andan change stream olayının geldiği ana kadar. */
  totalMs: number
  /** Yalnız yazma çağrısının süresi. Olay yazma ack'inden ÖNCE de gelebilir. */
  writeMs: number
  /** Olay zaman aşımı içinde gelmedi; `totalMs` bir ALT SINIRDIR (sansürlü gözlem). */
  censored: boolean
}

interface ProbeOptions {
  sampleCount: number
  eventTimeoutMs: number
  gapMs: number
}

function clampParam(
  raw: string | null,
  limits: { fallback: number; min: number; max: number },
): number {
  if (raw === null) return limits.fallback
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) return limits.fallback
  return Math.min(Math.max(parsed, limits.min), limits.max)
}

function readOptions(url: string): ProbeOptions {
  const params = new URL(url).searchParams
  return {
    sampleCount: clampParam(params.get('samples'), LIMITS.samples),
    eventTimeoutMs: clampParam(params.get('eventTimeoutMs'), LIMITS.eventTimeoutMs),
    gapMs: clampParam(params.get('gapMs'), LIMITS.gapMs),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Nearest-rank yüzdelik. Boş dizi için 0 döner. */
function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1
  const index = Math.min(Math.max(rank, 0), sortedAsc.length - 1)
  return sortedAsc[index] ?? 0
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Cursor kurulmadan yapılan yazma change stream'e HİÇ düşmez.
 *
 * ⚠️ `Model.watch()` TİPTE `mongodb.ChangeStream` döner ama ÇALIŞMA ANINDA
 * mongoose'un kendi sarmalayıcısını döndürür (mongoose/lib/cursor/changeStream.js).
 * Sarmalayıcıda `resumeToken` alanı YOKTUR — `stream.resumeToken` derlenir ve
 * sessizce `undefined` kalır. Gerçek token `driverChangeStream.resumeToken`'dadır.
 * Sarmalayıcı buna karşılık tiplerde olmayan bir `ready` olayı yayınlar ve onu
 * bilerek `setImmediate` ile geciktirir ("so the stream pump has a chance to run
 * and the driver cursor initializes"). Doğru hazır-olma sinyali budur.
 */
function waitForReady(stream: unknown, timeoutMs: number): Promise<boolean> {
  const emitter = stream as { once?: (event: string, listener: () => void) => unknown }
  const once = emitter.once?.bind(emitter)
  if (once === undefined) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      resolve(false)
    }, timeoutMs)
    once('ready', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

/** WS-001 için kanıt: sarmalayıcıda token yok, sürücü nesnesinde var. */
function resumeTokenVisibility(stream: unknown): { wrapper: boolean; driver: boolean } {
  const wrapper = stream as {
    resumeToken?: unknown
    driverChangeStream?: { resumeToken?: unknown }
  }
  return {
    wrapper: wrapper.resumeToken !== undefined,
    driver: wrapper.driverChangeStream?.resumeToken !== undefined,
  }
}

/**
 * `ChangeStream.on('change')` mongoose'un EventEmitter aşırı yüklemesine düşer ve
 * olayı `any` olarak verir. `delete` olayları `fullDocument` taşımaz; `updateLookup`
 * doküman silinmişse `null` döndürebilir. Bu yüzden olay `unknown` alınır ve
 * yalnız ihtiyacımız olan iki alan doğrulanarak dışarı verilir.
 */
function readRoomSnapshot(change: unknown): { code: string; version: number } | null {
  if (typeof change !== 'object' || change === null) return null
  const doc: unknown = (change as Record<string, unknown>)['fullDocument']
  if (typeof doc !== 'object' || doc === null) return null
  const fields = doc as Record<string, unknown>
  const code = fields['code']
  const version = fields['version']
  if (typeof code !== 'string' || typeof version !== 'number') return null
  return { code, version }
}

interface ProbeResult {
  samples: Sample[]
  warmupMs: number
  warmupAttempts: number
  readyMs: number
  streamReady: boolean
  resumeToken: { wrapper: boolean; driver: boolean }
}

async function runProbe(options: ProbeOptions): Promise<ProbeResult> {
  await connectDb()

  const code = generateRoomCode()
  /** version -> olayın geldiği an. Süreç içi filtre (ADR-0002: pipeline'da oda filtresi YOK). */
  const waiters = new Map<number, (at: number) => void>()
  /** Dizi kullanılıyor: closure içinde atanan `let` TypeScript'te güvenilir daralmaz. */
  const streamErrors: string[] = []

  const stream = Room.watch<RoomDoc>(
    // ADR-0002: pipeline YALNIZ operationType üzerinde filtreler.
    // `fullDocument.*` üzerinde $match + updateLookup = "Resume Token Not Found" sınıfı.
    [{ $match: { operationType: { $in: ['insert', 'update', 'replace', 'delete'] } } }],
    { fullDocument: 'updateLookup' },
  )
  openStreams += 1
  peakOpenStreams = Math.max(peakOpenStreams, openStreams)

  try {
    stream.on('error', (error: Error) => {
      streamErrors.push(error.message)
      for (const [, resolve] of waiters) resolve(Number.NaN)
      waiters.clear()
    })

    stream.on('change', (change: unknown) => {
      const at = performance.now()
      const doc = readRoomSnapshot(change)
      if (doc?.code !== code) return
      const resolve = waiters.get(doc.version)
      if (resolve === undefined) return
      waiters.delete(doc.version)
      resolve(at)
    })

    const waitFor = (version: number, timeoutMs: number): Promise<number> =>
      new Promise<number>((resolve) => {
        const timer = setTimeout(() => {
          waiters.delete(version)
          resolve(Number.NaN)
        }, timeoutMs)
        waiters.set(version, (at) => {
          clearTimeout(timer)
          resolve(at)
        })
      })

    // Hazır olma beklemesi tek bir olay beklemesinden uzun sürmemeli.
    const readyTimeoutMs = Math.min(READY_TIMEOUT_MS, options.eventTimeoutMs)
    const readyStart = performance.now()
    const streamReady = await waitForReady(stream, readyTimeoutMs)
    const readyMs = performance.now() - readyStart

    // --- Isınma: cursor gerçekten olay taşıyor mu? Bu tur ÖLÇÜME DAHİL DEĞİL,
    // rapora ayrı bir sayı olarak yazılır (cursor kurulum maliyeti instance ömründe bir kez).
    const warmupTimeoutMs = Math.min(3_000, options.eventTimeoutMs)
    let version = 0
    let warmupMs = Number.NaN
    let warmupAttempts = 0

    const insertWait = waitFor(0, warmupTimeoutMs)
    const warmupStart = performance.now()
    await Room.create({ code, state: 'finished' })
    warmupAttempts += 1
    warmupMs = (await insertWait) - warmupStart

    while (Number.isNaN(warmupMs) && warmupAttempts < WARMUP_ATTEMPTS) {
      version += 1
      const retryWait = waitFor(version, warmupTimeoutMs)
      const retryStart = performance.now()
      await Room.updateOne({ code }, { $set: { version } })
      warmupAttempts += 1
      warmupMs = (await retryWait) - retryStart
    }

    if (Number.isNaN(warmupMs)) {
      const detail = streamErrors.join(' | ')
      throw new Error(
        detail === ''
          ? `change stream ${String(warmupAttempts)} denemede tek olay taşımadı (ready=${String(streamReady)})`
          : `change stream hatası: ${detail}`,
      )
    }

    // --- Ölçüm turları
    const samples: Sample[] = []
    for (let i = 0; i < options.sampleCount; i += 1) {
      version += 1
      const wait = waitFor(version, options.eventTimeoutMs)
      const start = performance.now()
      await Room.updateOne({ code }, { $set: { version } })
      const afterWrite = performance.now()
      const at = await wait
      const censored = Number.isNaN(at)
      samples.push({
        totalMs: censored ? options.eventTimeoutMs : at - start,
        writeMs: afterWrite - start,
        censored,
      })
      if (options.gapMs > 0) await sleep(options.gapMs)
    }

    await Room.deleteOne({ code })

    return {
      samples,
      warmupMs,
      warmupAttempts,
      readyMs,
      streamReady,
      resumeToken: resumeTokenVisibility(stream),
    }
  } finally {
    // ADR-0002: son abone gidince stream KAPANIR. Atlas M0 bağlantı bütçesi
    // sızdırılan bir stream'i affetmez — sonraki deploy bağlantı bulamaz.
    await stream.close()
    openStreams -= 1
  }
}

/**
 * WS-001 · ADR-0002'nin "instance başına EN FAZLA BİR change stream"
 * değişmezinin **tek canlı ölçüm yolu**. Birim testler ve mutasyon sondaları
 * kodun doğru olduğunu gösterir; bu alanlar ÇALIŞAN instance'ta gerçekten tek
 * stream olduğunu gösterir.
 *
 * Nasıl okunur: aynı odaya N WS bağlantısı aç, sonra bu ucu çağır ve yanıttaki
 * `x-vercel-id`nin instance parçasının WS bağlantılarıyla AYNI olduğu bir
 * çağrıda `hub.openStreams === 1` ve `hub.subscribers === N` gör. Farklı bir
 * instance'a düşersen hepsi 0 görünür — bu bir hata değil, ölçümün başka bir
 * sürece düştüğünün işaretidir.
 *
 * Sondanın KENDİ stream'i hub'ınkinden ayrıdır (`runProbe` kendi stream'ini
 * açıp `finally`de kapatır); `hub.*` alanları yalnız hub'ı raporlar.
 */
function hubSnapshot(): Record<string, number | boolean> {
  const stats = roomHub.stats()
  return {
    openStreams: stats.openStreams,
    watchCalls: stats.watchCalls,
    rooms: stats.rooms,
    subscribers: stats.subscribers,
    reopenAttempts: stats.reopenAttempts,
    hasResumeToken: stats.hasResumeToken,
  }
}

export async function GET(request: Request): Promise<Response> {
  // Yazma yapan bir sonda canlıda açıkta kalmaz.
  if (process.env['VERCEL_ENV'] === 'production') {
    return new Response('Not Found', { status: 404 })
  }

  // Yalnız hub'ı okumak: gecikme ölçümü ÇALIŞTIRMADAN (ve ikinci bir stream
  // AÇMADAN) tek-stream değişmezini gözlemlemek için. `?only=hub`.
  if (new URL(request.url).searchParams.get('only') === 'hub') {
    return Response.json({
      ok: true,
      hub: hubSnapshot(),
      region: process.env['VERCEL_REGION'] ?? null,
      at: new Date().toISOString(),
    })
  }

  if (probeRunning) {
    return Response.json(
      { ok: false, error: 'sonda zaten çalışıyor; ikinci change stream açılmaz (ADR-0002 Z1)' },
      { status: 409 },
    )
  }
  probeRunning = true

  try {
    const options = readOptions(request.url)
    const { samples, warmupMs, warmupAttempts, readyMs, streamReady, resumeToken } =
      await runProbe(options)

    const totals = samples.map((s) => s.totalMs).sort((a, b) => a - b)
    const writes = samples.map((s) => s.writeMs).sort((a, b) => a - b)
    const censored = samples.filter((s) => s.censored).length

    const p50Ms = round1(percentile(totals, 50))
    const p95Ms = round1(percentile(totals, 95))
    const maxMs = round1(totals[totals.length - 1] ?? 0)

    return Response.json({
      ok: censored === 0,
      samples: samples.length,
      p50Ms,
      p95Ms,
      maxMs,
      minMs: round1(totals[0] ?? 0),
      meanMs: round1(totals.reduce((sum, v) => sum + v, 0) / Math.max(totals.length, 1)),
      budgetMs: BUDGET_MS,
      verdict: censored === 0 && p95Ms <= BUDGET_MS ? 'pass' : 'fail',
      censoredSamples: censored,
      allMs: totals.map(round1),
      writeP50Ms: round1(percentile(writes, 50)),
      writeP95Ms: round1(percentile(writes, 95)),
      warmupMs: round1(warmupMs),
      warmupAttempts,
      streamReadyMs: round1(readyMs),
      streamReady,
      // WS-001 uyarısı: mongoose sarmalayıcısında resumeToken YOK, sürücüde var.
      resumeTokenOnWrapper: resumeToken.wrapper,
      resumeTokenOnDriver: resumeToken.driver,
      peakOpenStreams,
      openStreamsAfterClose: openStreams,
      hub: hubSnapshot(),
      db: getDbName(),
      env: process.env['VERCEL_ENV'] ?? 'local',
      region: process.env['VERCEL_REGION'] ?? null,
      at: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'bilinmeyen hata'
    return Response.json(
      { ok: false, error: message, peakOpenStreams, hub: hubSnapshot() },
      { status: 503 },
    )
  } finally {
    probeRunning = false
  }
}
