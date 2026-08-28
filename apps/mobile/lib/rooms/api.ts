import {
  errorResponseSchema,
  roomCreateResponseSchema,
  roomStateResponseSchema,
  type BoardConfigShape,
  type ErrorCode,
  type RoomCode,
  type RoomStateResponse,
} from '@xox/shared'

/** `roomCreateResponseSchema`nın çıkarılmış tipi — `@xox/shared` bunu bir isimle DIŞA VERMİYOR. */
export interface RoomCreateResponse {
  readonly code: RoomCode
}

/**
 * `POST /api/rooms` / `GET /api/rooms/[code]` mobil istemcisi. `apps/web`'in
 * aksine çerez YOKTUR — kimlik her istekte `Authorization: Bearer` ile
 * taşınır (`resolveIdentity`in birinci sırası, ADR-0006). Bu dosya `fetch`
 * dışında hiçbir platforma özgü modül import ETMEZ, next-auth'suz
 * `apps/web/lib/auth/*` dosyalarıyla AYNI sınıfta test edilebilir.
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode }

async function parseErrorCode(response: Response): Promise<ErrorCode> {
  const body: unknown = await response.json().catch(() => null)
  const parsed = errorResponseSchema.safeParse(body)
  return parsed.success ? parsed.data.code : 'SERVER_ERROR'
}

/** ADR-0015 — gövde tamamen boş bırakılabilir (sunucu 3×3'e düşer). */
export async function createRoom(
  baseUrl: string,
  accessToken: string,
  config?: Partial<BoardConfigShape>,
): Promise<ApiResult<RoomCreateResponse>> {
  try {
    const response = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(config ?? {}),
    })
    if (!response.ok) return { ok: false, code: await parseErrorCode(response) }
    const json: unknown = await response.json()
    const parsed = roomCreateResponseSchema.safeParse(json)
    if (!parsed.success) return { ok: false, code: 'SERVER_ERROR' }
    return { ok: true, data: parsed.data }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

export async function fetchRoomState(
  baseUrl: string,
  accessToken: string,
  roomCode: RoomCode,
): Promise<ApiResult<RoomStateResponse>> {
  try {
    const response = await fetch(`${baseUrl}/api/rooms/${roomCode}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) return { ok: false, code: await parseErrorCode(response) }
    const json: unknown = await response.json()
    const parsed = roomStateResponseSchema.safeParse(json)
    if (!parsed.success) return { ok: false, code: 'SERVER_ERROR' }
    return { ok: true, data: parsed.data }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}
