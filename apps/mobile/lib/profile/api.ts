import {
  errorResponseSchema,
  profileResponseSchema,
  type ErrorCode,
  type ProfileResponse,
} from '@xox/shared'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode }

async function parseErrorCode(response: Response): Promise<ErrorCode> {
  const body: unknown = await response.json().catch(() => null)
  const parsed = errorResponseSchema.safeParse(body)
  return parsed.success ? parsed.data.code : 'SERVER_ERROR'
}

export async function fetchProfile(
  baseUrl: string,
  accessToken: string,
): Promise<ApiResult<ProfileResponse>> {
  try {
    const response = await fetch(`${baseUrl}/api/profile`, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) return { ok: false, code: await parseErrorCode(response) }
    const json: unknown = await response.json()
    const parsed = profileResponseSchema.safeParse(json)
    if (!parsed.success) return { ok: false, code: 'SERVER_ERROR' }
    return { ok: true, data: parsed.data }
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}
