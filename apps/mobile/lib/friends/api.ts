import {
  errorResponseSchema,
  friendsResponseSchema,
  type ErrorCode,
  type Friend,
} from '@xox/shared'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode }

/** `friendsResponseSchema`nın çıkarılmış tipi — `@xox/shared` bunu bir isimle DIŞA VERMİYOR. */
export interface FriendsView {
  readonly friends: readonly Friend[]
  readonly incoming: readonly Friend[]
  readonly outgoing: readonly Friend[]
}

async function parseErrorCode(response: Response): Promise<ErrorCode> {
  const body: unknown = await response.json().catch(() => null)
  const parsed = errorResponseSchema.safeParse(body)
  return parsed.success ? parsed.data.code : 'SERVER_ERROR'
}

export async function fetchFriends(
  baseUrl: string,
  accessToken: string,
): Promise<ApiResult<FriendsView>> {
  try {
    const response = await fetch(`${baseUrl}/api/friends`, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) return { ok: false, code: await parseErrorCode(response) }
    const json: unknown = await response.json()
    const parsed = friendsResponseSchema.safeParse(json)
    if (!parsed.success) return { ok: false, code: 'SERVER_ERROR' }
    return { ok: true, data: parsed.data }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}
