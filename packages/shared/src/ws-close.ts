/**
 * WebSocket kapanış kodları (tasarım §2.6). 4000–4999 aralığı uygulamaya
 * ayrılmıştır; standart kodlarla çakışmaz.
 *
 * `SESSION_TAKEOVER` ve `ROTATE` istemci davranışını **ayırır**:
 * 4409 → yeniden bağlanma denenmez (sonsuz takeover savaşı olmasın, §3.2),
 * 4499 → gecikmesiz yeniden bağlanma (planlı rotasyon, backoff sıfırlanır),
 * diğer her kapanış → üstel geri çekilme.
 */
export const WS_CLOSE = {
  /** 3 ardışık INVALID_MESSAGE (KK-048). */
  PROTOCOL_VIOLATION: 4400,
  /** Kimlik çözülemedi (KK-008). */
  UNAUTHENTICATED: 4401,
  /** Oda dolu / koltuk yok (§3.3). */
  FORBIDDEN: 4403,
  /** Oda yok ya da TTL ile silindi. */
  NOT_FOUND: 4404,
  /** 3 heartbeat boyunca sessizlik. */
  IDLE_TIMEOUT: 4408,
  /** Aynı userId başka yerden bağlandı (§3.2). */
  SESSION_TAKEOVER: 4409,
  /** Planlı: fonksiyon süresi doluyor, hemen yeniden bağlan (Z2). */
  ROTATE: 4499,
} as const

export type WsCloseCode = (typeof WS_CLOSE)[keyof typeof WS_CLOSE]

/**
 * Kalıcı kapanışlar: yeniden bağlanmak durumu **düzeltmez**.
 * `PROTOCOL_VIOLATION` bilerek burada: bozuk bir istemci için yeniden bağlanma
 * "bağlan → 3 hatalı çerçeve → 4400 → bağlan" döngüsüne dönüşür ve her tur bir
 * WS fonksiyon çağrısı yakar. Ekran salt-okunur olur, kullanıcıya hata gösterilir.
 */
const PERMANENT_CLOSE_CODES: readonly number[] = [
  WS_CLOSE.PROTOCOL_VIOLATION,
  WS_CLOSE.FORBIDDEN,
  WS_CLOSE.NOT_FOUND,
  WS_CLOSE.SESSION_TAKEOVER,
]

export function isPermanentCloseCode(code: number): boolean {
  return PERMANENT_CLOSE_CODES.includes(code)
}

/**
 * Kimlik çözülemedi: kör geri çekilme yerine önce **yeni bilet** alınır
 * (`POST /api/ws/ticket`), sonra bağlanılır. Bileti tazelemeden denemek aynı
 * 4401'i tekrar üretir.
 */
export function requiresReauth(code: number): boolean {
  return code === WS_CLOSE.UNAUTHENTICATED
}

/**
 * Kalıcı olmayan her kapanış yeniden bağlanmayı hak eder:
 * `ROTATE` (4499) **gecikmesiz** ve backoff sıfırlanarak, `UNAUTHENTICATED`
 * (4401) `requiresReauth` adımından sonra, `IDLE_TIMEOUT` (4408) ve
 * sınıflandırılmamış tüm kodlar üstel geri çekilmeyle.
 */
export function isReconnectableCloseCode(code: number): boolean {
  return !isPermanentCloseCode(code)
}
