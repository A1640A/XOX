'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  errorResponseSchema,
  friendsResponseSchema,
  type ErrorCode,
  type Friend,
} from '@xox/shared'
import { ErrorBanner } from '@/components/ErrorBanner'
import {
  buttonGhostSmall,
  buttonSecondary,
  headingDisplay,
  mutedText,
} from '@/components/ui/styles'
import { tr } from '@/messages/tr'

interface FriendsView {
  friends: Friend[]
  incoming: Friend[]
  outgoing: Friend[]
}

/**
 * Sunucu hata gövdesi HER ZAMAN `errorResponseSchema`'dan geçirilir, `as`
 * cast'i YOK (bu gecenin dersi — `ErrorBanner` doğrulanmamış bir kodla boş
 * `role="alert"` üretebiliyordu).
 */
async function parseErrorCode(response: Response): Promise<ErrorCode> {
  const body: unknown = await response.json().catch(() => null)
  const parsed = errorResponseSchema.safeParse(body)
  return parsed.success ? parsed.data.code : 'SERVER_ERROR'
}

/**
 * `/arkadaslar` (W3-04, KK-125/126/127). Tek ağ katmanı burasıdır: `GET
 * /api/friends` ile listeyi çeker, `PATCH` ile bekleyen bir isteğe
 * yanıt verir, `DELETE` ile arkadaşlıktan çıkarır. `@/auth` import EDİLMEZ;
 * middleware zaten girişsizi `/giris`e yönlendirir (bkz. `ProfileContent`
 * ile aynı disiplin) — `session === null` dalı yalnızca bir güvenlik ağıdır.
 */
export function FriendsContent(): React.ReactElement | null {
  const { data: session, status } = useSession()

  const [view, setView] = useState<FriendsView | null>(null)
  const [loadError, setLoadError] = useState<ErrorCode | null>(null)

  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<ErrorCode | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') return

    let cancelled = false

    async function loadFriends(): Promise<void> {
      try {
        const response = await fetch('/api/friends')
        if (!response.ok) {
          if (!cancelled) setLoadError(await parseErrorCode(response))
          return
        }
        const body: unknown = await response.json()
        const parsed = friendsResponseSchema.safeParse(body)
        if (cancelled) return
        if (parsed.success) {
          setView(parsed.data)
        } else {
          setLoadError('SERVER_ERROR')
        }
      } catch {
        if (!cancelled) setLoadError('NETWORK')
      }
    }

    void loadFriends()
    return () => {
      cancelled = true
    }
  }, [status])

  async function handleRespond(userId: string, action: 'accept' | 'reject'): Promise<void> {
    setPendingUserId(userId)
    setActionError(null)
    try {
      const response = await fetch('/api/friends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      })
      if (!response.ok) {
        setActionError(await parseErrorCode(response))
        return
      }
      setView((current) => {
        if (current === null) return current
        const moved = current.incoming.find((entry) => entry.userId === userId)
        const incoming = current.incoming.filter((entry) => entry.userId !== userId)
        const friends =
          action === 'accept' && moved !== undefined ? [...current.friends, moved] : current.friends
        return { ...current, incoming, friends }
      })
    } catch {
      setActionError('NETWORK')
    } finally {
      setPendingUserId(null)
    }
  }

  async function handleRemove(userId: string): Promise<void> {
    setPendingUserId(userId)
    setActionError(null)
    try {
      const response = await fetch('/api/friends', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!response.ok) {
        setActionError(await parseErrorCode(response))
        return
      }
      setView((current) =>
        current === null
          ? current
          : { ...current, friends: current.friends.filter((entry) => entry.userId !== userId) },
      )
    } catch {
      setActionError('NETWORK')
    } finally {
      setPendingUserId(null)
    }
  }

  if (status === 'loading') return <p className={mutedText}>{tr.common.loading}</p>
  // Middleware zaten girişsizi `/giris`e yönlendirir; bu yalnız bir güvenlik ağıdır.
  if (session === null) return null

  const isEmpty = view !== null && view.friends.length === 0 && view.incoming.length === 0
  const rowClassName =
    'border-border bg-surface flex items-center justify-between gap-4 rounded-[6px] border px-3 py-2'

  return (
    <div className="flex flex-col gap-6">
      <h1 className={`${headingDisplay} text-2xl`}>{tr.friends.title}</h1>

      {loadError !== null ? <ErrorBanner code={loadError} /> : null}
      {view === null && loadError === null ? (
        <p className={mutedText}>{tr.common.loading}</p>
      ) : null}
      {actionError !== null ? <ErrorBanner code={actionError} /> : null}

      {view !== null && isEmpty ? <p className={mutedText}>{tr.friends.empty}</p> : null}

      {view !== null && view.incoming.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-text">{tr.friends.pending}</h2>
          <ul className="flex flex-col gap-2">
            {view.incoming.map((entry) => (
              <li key={entry.userId} className={rowClassName}>
                <span className="text-text">
                  {entry.name} · {entry.elo}
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={pendingUserId === entry.userId}
                    onClick={() => {
                      void handleRespond(entry.userId, 'accept')
                    }}
                    className={buttonSecondary}
                  >
                    {tr.friends.accept}
                  </button>
                  <button
                    type="button"
                    disabled={pendingUserId === entry.userId}
                    onClick={() => {
                      void handleRespond(entry.userId, 'reject')
                    }}
                    className={buttonGhostSmall}
                  >
                    {tr.friends.reject}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view !== null && view.friends.length > 0 ? (
        <section className="flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {view.friends.map((entry) => (
              <li key={entry.userId} className={rowClassName}>
                <span className="text-text">
                  {entry.name} · {entry.elo}
                </span>
                <button
                  type="button"
                  disabled={pendingUserId === entry.userId}
                  onClick={() => {
                    void handleRemove(entry.userId)
                  }}
                  className={buttonGhostSmall}
                >
                  {tr.friends.remove}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
