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

/** Takeover dışında her kapanış yeniden bağlanmayı hak eder. */
export function isReconnectableCloseCode(code: number): boolean {
  return code !== WS_CLOSE.SESSION_TAKEOVER
}
