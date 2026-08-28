// @vitest-environment node
import {
  Room,
  connectDb,
  disconnectDb,
  generateRoomCode,
  loadEnvLocal,
  settleDeadlines,
  type RoomDoc,
  type TransitionResult,
} from '@xox/db'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createSettlementTimer, type SettlementTimerDeps } from './timers'

// `packages/db`'nin kendi `vitest.setup.ts`'i buradan koşmuyor; ortam yüklemesi
// ve `xox_test` zorlaması AÇIKÇA yapılır (konvansiyon: gerçek Atlas'a koşan her
// test dosyasının ilk satırı). `xox_prod`/`xox_dev` bu dosyadan ASLA açılmaz.
loadEnvLocal()
process.env['MONGODB_DB'] = 'xox_test'

/**
 * ADR-0004 "çift yürütme" — **iki yolun BİRLİKTE** kanıtı, gerçek otoriteye
 * karşı.
 *
 * `settleDeadlines` MOCK'LANMAZ: gerçek Atlas'a (`xox_test`) yazar. Sahte olan
 * tek şey `setTimeout` (deps üzerinden enjekte edilmiş) ve saat. Sebep
 * `gotchas.md`'nin 2. örüntüsü: bağımlılığını mock'larsan testin kendi
 * mock'unu doğrular — bu kartın kalbi olan "iki yol aynı anda sonlandırmaya
 * çalışırsa oyun BİR KEZ biter" iddiası ise tam olarak koşullu yazmadan
 * (`casUpdateRoom`) doğuyor.
 *
 * Ayrım şu: `timers.test.ts` zamanlayıcının ARİTMETİĞİNİ (saf, hızlı) sınar;
 * bu dosya zamanlayıcı ile YAZMA ucunun birleşimini sınar.
 */
const NOW = 1_767_225_600_000

const createdCodes: string[] = []

function freshCode(): string {
  const code = generateRoomCode()
  createdCodes.push(code)
  return code
}

/** Süresi `NOW`da çoktan dolmuş, İKİ oyuncusu da bağlı bir oyun. */
async function expiredRoom(): Promise<{ code: string; room: RoomDoc }> {
  const code = freshCode()
  await Room.create({
    code,
    state: 'playing',
    seats: { X: { userId: 'dx-x', name: 'Ada' }, O: { userId: 'dx-o', name: 'Kaan' } },
    presence: {
      X: { connId: 'conn-x', since: new Date(NOW - 120_000) },
      O: { connId: 'conn-o', since: new Date(NOW - 120_000) },
    },
    board: Array<null>(9).fill(null),
    turnDeadline: new Date(NOW - 1),
    version: 4,
  })
  const room = await Room.findOne({ code }).lean()
  if (room === null) throw new Error('kurulum başarısız')
  return { code, room }
}

interface FakeTimers {
  fired: { ms: number }[]
  fire(): void
  deps: SettlementTimerDeps
}

/** `session.ts`in enjekte ettiği zamanlayıcı kablolarının deterministik ikizi. */
function fakeTimers(onDue: () => void): FakeTimers {
  const queue: { callback: () => void; ms: number }[] = []
  return {
    fired: queue,
    fire(): void {
      const next = queue[0]
      if (next === undefined) throw new Error('kurulu zamanlayıcı yok')
      next.callback()
    },
    deps: {
      setTimer: (callback, ms) => {
        queue.push({ callback, ms })
        return queue.length - 1
      },
      clearTimer: () => undefined,
      now: () => NOW,
      onDue,
    },
  }
}

describe('ADR-0004 çift yürütme — zamanlayıcı + tembel, GERÇEK yazma ucuyla', () => {
  beforeAll(async () => {
    await connectDb()
  })

  afterEach(async () => {
    if (createdCodes.length > 0) {
      await Room.deleteMany({ code: { $in: createdCodes } })
      createdCodes.length = 0
    }
  })

  afterAll(async () => {
    await disconnectDb()
  })

  it('YOL 1 (zamanlayıcı): süresi dolmuş odaya 0 ms`lik zamanlayıcı kurulur ve dolunca oyun BİTER', async () => {
    const { code, room } = await expiredRoom()

    let settled: Promise<TransitionResult | null> = Promise.resolve(null)
    const timers = fakeTimers(() => {
      settled = settleDeadlines(code, NOW)
    })
    createSettlementTimer(timers.deps).schedule(room)

    // Geçmişte kalmış son tarih negatif gecikmeye düşmez.
    expect(timers.fired).toHaveLength(1)
    expect(timers.fired[0]?.ms).toBe(0)

    timers.fire()
    const result = await settled

    expect(result?.ok).toBe(true)
    const after = await Room.findOne({ code }).lean()
    expect(after?.state).toBe('finished')
    expect(after?.result).toMatchObject({ kind: 'won', winner: 'O', reason: 'timeout' })
  })

  it(
    'YOL 2 (tembel, KK-075): instance zamanlayıcıyı HİÇ kurmadan — yalnız bir mesajın ' +
      'önündeki kontrolle — oyunu zaman aşımıyla bitirir',
    async () => {
      const { code } = await expiredRoom()

      // Bu instance odayı hiç görmedi: `schedule` ÇAĞRILMADI, hiçbir
      // `setTimeout` kurulmadı. (`session.ts` bunu her geçerli çerçeveden —
      // bir `ping` dahil — önce çağırır; o kablolama `session.test.ts`te
      // ayrıca kilitli.)
      const timers = fakeTimers(() => {
        throw new Error('zamanlayıcı bu testte HİÇ kurulmamalıydı')
      })
      const timer = createSettlementTimer(timers.deps)

      const result = await settleDeadlines(code, NOW)

      expect(timers.fired).toHaveLength(0)
      expect(timer.isArmed()).toBe(false)
      expect(result?.ok).toBe(true)
      const after = await Room.findOne({ code }).lean()
      expect(after?.state).toBe('finished')
      expect(after?.version).toBe(5)
    },
  )

  it(
    'İKİ YOL AYNI ANDA (Promise.all): zamanlayıcı ve tembel kontrol GERÇEKTEN eşzamanlı ' +
      'sonlandırmaya çalışınca oyun TAM BİR KEZ biter — biri yazar, diğeri null alır',
    async () => {
      const { code, room } = await expiredRoom()

      let fromTimer: Promise<TransitionResult | null> = Promise.resolve(null)
      const timers = fakeTimers(() => {
        // `await` YOK: yalnız başlatır, böylece tembel yolla AYNI tick'te uçar.
        fromTimer = settleDeadlines(code, NOW)
      })
      createSettlementTimer(timers.deps).schedule(room)

      timers.fire() // zamanlayıcı yolu başladı…
      const fromLazy = settleDeadlines(code, NOW) // …tembel yol aynı tick'te başladı

      const results = await Promise.all([fromTimer, fromLazy])

      // Sıralı iki çağrı bu kriteri SAĞLAMAZ: yarışı hiç sınamaz.
      expect(results.filter((r) => r !== null)).toHaveLength(1)
      expect(results.filter((r) => r === null)).toHaveLength(1)

      const after = await Room.findOne({ code }).lean()
      expect(after?.state).toBe('finished')
      // Oyun BİR KEZ bitti: version 4 → 5, iki değil.
      expect(after?.version).toBe(5)
    },
  )
})
