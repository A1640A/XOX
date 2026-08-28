'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  errorResponseSchema,
  historyRowTestId,
  matchesResponseSchema,
  type ErrorCode,
  type Match,
} from '@xox/shared'
import { ErrorBanner } from '@/components/ErrorBanner'
import { tr } from '@/messages/tr'
import { matchReasonText } from './reason-text'

/**
 * Sunucu hata gövdesi HER ZAMAN `errorResponseSchema`'dan geçirilir — aynı
 * disiplin `FriendsContent`/`ProfileContent`'le.
 */
async function parseErrorCode(response: Response): Promise<ErrorCode> {
  const body: unknown = await response.json().catch(() => null)
  const parsed = errorResponseSchema.safeParse(body)
  return parsed.success ? parsed.data.code : 'SERVER_ERROR'
}

const dateFormatter = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })

/** KK-116: puanlı bir oyunda `+12`/`-11`/`0`; puansızda em-dash (`—`). */
function formatEloDelta(match: Match): string {
  if (!match.rated || match.eloDelta === null) return '—'
  return match.eloDelta > 0 ? `+${String(match.eloDelta)}` : String(match.eloDelta)
}

function resultLabel(result: Match['result']): string {
  if (result === 'win') return tr.history.win
  if (result === 'loss') return tr.history.loss
  return tr.history.drawResult
}

/**
 * `/gecmis` (W3-02, KK-116/117). Tek ağ katmanı burasıdır: `GET /api/matches`
 * ile son `HISTORY_PAGE_SIZE` bitmiş oyunu çeker. `@/auth` import EDİLMEZ;
 * middleware zaten girişsizi `/giris`e yönlendirir (`FriendsContent`/
 * `ProfileContent` ile aynı disiplin) — `session === null` dalı yalnızca
 * bir güvenlik ağıdır.
 */
export function HistoryContent(): React.ReactElement | null {
  const { data: session, status } = useSession()

  const [matches, setMatches] = useState<Match[] | null>(null)
  const [loadError, setLoadError] = useState<ErrorCode | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') return

    let cancelled = false

    async function loadMatches(): Promise<void> {
      try {
        const response = await fetch('/api/matches')
        if (!response.ok) {
          if (!cancelled) setLoadError(await parseErrorCode(response))
          return
        }
        const body: unknown = await response.json()
        const parsed = matchesResponseSchema.safeParse(body)
        if (cancelled) return
        if (parsed.success) {
          setMatches(parsed.data.matches)
        } else {
          setLoadError('SERVER_ERROR')
        }
      } catch {
        if (!cancelled) setLoadError('NETWORK')
      }
    }

    void loadMatches()
    return () => {
      cancelled = true
    }
  }, [status])

  if (status === 'loading') return <p>{tr.common.loading}</p>
  // Middleware zaten girişsizi `/giris`e yönlendirir; bu yalnız bir güvenlik ağıdır.
  if (session === null) return null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{tr.history.title}</h1>

      {loadError !== null ? <ErrorBanner code={loadError} /> : null}
      {matches === null && loadError === null ? <p>{tr.common.loading}</p> : null}
      {matches !== null && matches.length === 0 ? <p>{tr.history.empty}</p> : null}

      {matches !== null && matches.length > 0 ? (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-border border-b">
              <th scope="col" className="p-2 font-semibold">
                {tr.history.date}
              </th>
              <th scope="col" className="p-2 font-semibold">
                {tr.history.opponent}
              </th>
              <th scope="col" className="p-2 font-semibold">
                {tr.history.result}
              </th>
              <th scope="col" className="p-2 font-semibold">
                {tr.history.eloChange}
              </th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match, index) => (
              <tr key={match.gameId} data-testid={historyRowTestId(index)} className="align-top">
                <td className="p-2 whitespace-nowrap">
                  {dateFormatter.format(new Date(match.finishedAt))}
                </td>
                <td className="p-2">{match.opponent.name}</td>
                <td className="p-2">
                  <span>{resultLabel(match.result)}</span>
                  <p className="text-xs opacity-80">
                    {matchReasonText(match.result, match.endReason)}
                  </p>
                </td>
                <td className="p-2">
                  {formatEloDelta(match)}
                  {!match.rated ? <span className="sr-only"> ({tr.history.unrated})</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
