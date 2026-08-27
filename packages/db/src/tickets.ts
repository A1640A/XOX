import { WsTicket } from './models/ws-ticket'

export interface RecordWsTicketParams {
  jti: string
  userId: string
  room: string
  expiresAt: Date
}

/**
 * Bilet İHRAÇ EDİLDİĞİNDE (`POST /api/ws/ticket`) çağrılır — `consumeWsTicket`'ın
 * karşılaştıracağı `usedAt: null` kaydını yaratır. Bu kayıt yoksa
 * `consumeWsTicket` asla `ok:true` DÖNMEZ (fail-closed): imzası geçerli ama
 * DB'de karşılığı olmayan bir JWT (ör. bu mekanizmadan önce üretilmiş eski bir
 * bilet) tek kullanımlık garantisi olmadan asla kabul edilmez.
 */
export async function recordWsTicket(params: RecordWsTicketParams): Promise<void> {
  await WsTicket.create({ ...params, usedAt: null })
}

export type ConsumeWsTicketResult =
  { ok: true } | { ok: false; reason: 'not-found' | 'already-used' | 'expired' }

/**
 * SEC-003 çekirdeği: tüketim TEK ATOMİK Mongo komutunda yapılır. Sorgu
 * FİLTRESİ (`usedAt: null`) ve YAZMASI (`$set: { usedAt: now }`) aynı
 * `findOneAndUpdate` komutunda olduğu için Mongo'nun tek-doküman
 * serileştirmesi, aynı `jti`'ye eşzamanlı gelen iki çağrıdan YALNIZ BİRİNİN
 * dokümanı "bulup" güncellemesini garanti eder — "oku, kontrol et, yaz" üç
 * ayrı adımlı bir yarış YOKTUR (bu, `casUpdateRoom`'un oda geçişlerinde
 * kullandığı aynı tek-komut disiplinidir).
 *
 * Yarış kanıtı: `tickets.test.ts` aynı jti'yi `Promise.all` ile GERÇEKTEN
 * eşzamanlı iki kez tüketir ve TAM BİRİNİN `ok:true` döndüğünü doğrular.
 */
export async function consumeWsTicket(jti: string): Promise<ConsumeWsTicketResult> {
  const now = new Date()
  const updated = await WsTicket.findOneAndUpdate(
    { jti, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
  ).lean()
  if (updated !== null) return { ok: true }

  // Karar YUKARIDA (atomik komutun kendisinde) verildi — `ok:false` kesindir.
  // Bu ikinci sorgu yalnız RAPORLAMA amaçlı nedeni ayırt eder; ayrı bir
  // "kontrol et" adımı DEĞİLDİR, bir TOCTOU penceresi açmaz.
  const existing = await WsTicket.findOne({ jti }).lean()
  if (existing === null) return { ok: false, reason: 'not-found' }
  if (existing.usedAt !== null) return { ok: false, reason: 'already-used' }
  return { ok: false, reason: 'expired' }
}

/**
 * Çıkış (signOut) yolunun ÇAĞIRMASI GEREKEN temizlik (SEC-003 kabul kriteri).
 * Kullanıcının tüketilmemiş TÜM biletlerini "kullanılmış" işaretler; zaten
 * tüketilmiş ya da başka kullanıcıya ait biletlere DOKUNMAZ.
 *
 * ⚠️ Bugün hiçbir çağıran YOK — `apps/web/auth.ts`'in `events.signOut`
 * kancasına bir satır eklenmesi gerekiyor, ama o dosya bu görevin yazma
 * alanı DIŞINDA (bkz. `docs/board/reports/SEC-003.md`).
 */
export async function revokeWsTicketsForUser(userId: string): Promise<number> {
  const now = new Date()
  const result = await WsTicket.updateMany({ userId, usedAt: null }, { $set: { usedAt: now } })
  return result.modifiedCount
}
