'use client'

import { useState } from 'react'
import { errorResponseSchema, type ErrorCode } from '@xox/shared'
import { ErrorBanner } from '@/components/ErrorBanner'
import { buttonSecondary } from '@/components/ui/styles'
import { tr } from '@/messages/tr'

export interface FriendAddButtonProps {
  /** Rakibin `userId`'si — henüz oynanmamışsa `null`. */
  readonly opponentId: string | null
  /** Yalnız oyun bittiğinde görünür (P2 — arkadaşlık yalnızca bitmiş oyun üzerinden kurulur). */
  readonly visible: boolean
}

/**
 * Sunucu hata gövdesi HER ZAMAN `errorResponseSchema`'dan geçirilir, `as`
 * cast'i YOK (bu gecenin dersi — `ErrorBanner` doğrulanmamış bir kodla boş
 * `role="alert"` üretebiliyordu). Gövde beklenen biçimde değilse
 * `SERVER_ERROR`'a düşülür.
 */
async function parseErrorCode(response: Response): Promise<ErrorCode> {
  const body: unknown = await response.json().catch(() => null)
  const parsed = errorResponseSchema.safeParse(body)
  return parsed.success ? parsed.data.code : 'SERVER_ERROR'
}

/**
 * KK-125/126 — oyun-sonu panelindeki "Arkadaş ekle" düğmesi. `POST
 * /api/friends` gövdesi `{userId: opponentId}`; sunucu uygunluğu
 * `hasFinishedGameTogether` ile KENDİSİ doğrular (KK-126) — bu bileşen
 * yalnız isteği tetikler, kuralı yeniden yazmaz.
 *
 * `try/catch/finally` — `pending` HER ZAMAN `finally`de düşer (bu gecenin
 * dersi: aksi hâlde bir hata dalında düğme sonsuza kadar devre dışı kalır).
 */
export function FriendAddButton(props: FriendAddButtonProps): React.ReactElement | null {
  const { opponentId, visible } = props
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ErrorCode | null>(null)
  const [sent, setSent] = useState(false)

  if (!visible || opponentId === null) return null

  async function handleClick(): Promise<void> {
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: opponentId }),
      })
      if (!response.ok) {
        setError(await parseErrorCode(response))
        return
      }
      setSent(true)
    } catch {
      setError('NETWORK')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending || sent}
        onClick={() => {
          void handleClick()
        }}
        className={`${buttonSecondary} w-fit`}
      >
        {tr.friends.add}
      </button>
      {sent ? (
        <p role="status" aria-live="polite" className="text-win text-sm font-medium">
          {tr.friends.requestSent}
        </p>
      ) : null}
      <ErrorBanner code={error} />
    </div>
  )
}
