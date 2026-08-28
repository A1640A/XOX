import {
  errorResponseSchema,
  mobileTokenPairSchema,
  registerResponseSchema,
  wsTicketResponseSchema,
  type ErrorCode,
  type MobileTokenPair,
  type RegisterBody,
  type RoomCode,
  type WsTicketResponse,
} from '@xox/shared'

/**
 * Bu dosya YALNIZ `fetch` kullanır — `expo-secure-store`/`react-native`
 * gibi platforma özgü hiçbir modül import ETMEZ, bu yüzden Vitest'te (Node)
 * hiçbir mock'a ihtiyaç duymadan gerçek kodla test edilebilir (kart
 * dersi: next-auth import eden dosyalar test edilemez — buradaki eş
 * biçim: React Native import eden dosyalar aynı sınıfa girer, o yüzden
 * bu dosya BİLEREK öyle bir importtan kaçınıyor).
 */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode }

async function parseErrorCode(response: Response): Promise<ErrorCode> {
  const body: unknown = await response.json().catch(() => null)
  const parsed = errorResponseSchema.safeParse(body)
  return parsed.success ? parsed.data.code : 'SERVER_ERROR'
}

export async function registerAccount(
  baseUrl: string,
  body: RegisterBody,
): Promise<ApiResult<{ userId: string }>> {
  try {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) return { ok: false, code: await parseErrorCode(response) }
    const json: unknown = await response.json()
    const parsed = registerResponseSchema.safeParse(json)
    if (!parsed.success) return { ok: false, code: 'SERVER_ERROR' }
    return { ok: true, data: parsed.data }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

/** ADR-0005 döndürmeli refresh — `POST /api/auth/mobile/refresh`. */
export async function refreshTokenPair(
  baseUrl: string,
  refresh: string,
): Promise<ApiResult<MobileTokenPair>> {
  try {
    const response = await fetch(`${baseUrl}/api/auth/mobile/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh }),
    })
    if (!response.ok) return { ok: false, code: await parseErrorCode(response) }
    const json: unknown = await response.json()
    const parsed = mobileTokenPairSchema.safeParse(json)
    if (!parsed.success) return { ok: false, code: 'SERVER_ERROR' }
    return { ok: true, data: parsed.data }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

/**
 * ADR-0006 — web hedefi WS bağlantısını `?ticket=` ile kurar (tarayıcı
 * WebSocket API'si özel başlık gönderemez). Bilet SEC-003 ile TEK
 * KULLANIMLIKTIR: her bağlanma/yeniden bağlanma bu fonksiyonu YENİDEN
 * çağırmalıdır (bkz. `lib/ws/web-room-client.ts`).
 */
export async function fetchWsTicket(
  baseUrl: string,
  accessToken: string,
  roomCode: RoomCode,
): Promise<ApiResult<WsTicketResponse>> {
  try {
    const response = await fetch(`${baseUrl}/api/ws/ticket`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ roomCode }),
    })
    if (!response.ok) return { ok: false, code: await parseErrorCode(response) }
    const json: unknown = await response.json()
    const parsed = wsTicketResponseSchema.safeParse(json)
    if (!parsed.success) return { ok: false, code: 'SERVER_ERROR' }
    return { ok: true, data: parsed.data }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}
