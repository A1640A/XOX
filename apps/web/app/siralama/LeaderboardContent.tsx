'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  errorResponseSchema,
  leaderboardResponseSchema,
  leaderboardRowTestId,
  type ErrorCode,
  type LeaderboardEntry,
  type LeaderboardResponse,
} from '@xox/shared'
import { ErrorBanner } from '@/components/ErrorBanner'
import { tr } from '@/messages/tr'

/**
 * Sunucu hata gövdesi HER ZAMAN `errorResponseSchema`'dan geçirilir — aynı
 * disiplin `HistoryContent`/`FriendsContent`/`ProfileContent`'le.
 */
async function parseErrorCode(response: Response): Promise<ErrorCode> {
  const body: unknown = await response.json().catch(() => null)
  const parsed = errorResponseSchema.safeParse(body)
  return parsed.success ? parsed.data.code : 'SERVER_ERROR'
}

/** `tr.leaderboard.record` başlığının ("G/M/B") gövde karşılığı — yeni metin ICAT ETMEZ. */
function recordText(entry: LeaderboardEntry): string {
  return `${String(entry.wins)}/${String(entry.losses)}/${String(entry.draws)}`
}

/**
 * `/siralama` (W3-03, KK-115/117). Tek ağ katmanı burasıdır: `GET
 * /api/leaderboard` ile ilk `LEADERBOARD_SIZE` (50) uygun oyuncuyu ve — ilk
 * 50'de değilse — çağıranın kendi satırını çeker. `@/auth` import EDİLMEZ;
 * middleware zaten girişsizi `/giris`e yönlendirir (`HistoryContent` ile aynı
 * disiplin) — `session === null` dalı yalnızca bir güvenlik ağıdır.
 */
export function LeaderboardContent(): React.ReactElement | null {
  const { data: session, status } = useSession()

  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loadError, setLoadError] = useState<ErrorCode | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') return

    let cancelled = false

    async function loadLeaderboard(): Promise<void> {
      try {
        const response = await fetch('/api/leaderboard')
        if (!response.ok) {
          if (!cancelled) setLoadError(await parseErrorCode(response))
          return
        }
        const body: unknown = await response.json()
        const parsed = leaderboardResponseSchema.safeParse(body)
        if (cancelled) return
        if (parsed.success) {
          setData(parsed.data)
        } else {
          setLoadError('SERVER_ERROR')
        }
      } catch {
        if (!cancelled) setLoadError('NETWORK')
      }
    }

    void loadLeaderboard()
    return () => {
      cancelled = true
    }
  }, [status])

  if (status === 'loading') return <p>{tr.common.loading}</p>
  // Middleware zaten girişsizi `/giris`e yönlendirir; bu yalnız bir güvenlik ağıdır.
  if (session === null) return null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{tr.leaderboard.title}</h1>
      <p className="text-xs opacity-80">{tr.leaderboard.requirement}</p>

      {loadError !== null ? <ErrorBanner code={loadError} /> : null}
      {data === null && loadError === null ? <p>{tr.common.loading}</p> : null}
      {data !== null && data.entries.length === 0 ? <p>{tr.leaderboard.empty}</p> : null}

      {data !== null && data.entries.length > 0 ? (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-border border-b">
              <th scope="col" className="p-2 font-semibold">
                {tr.leaderboard.rank}
              </th>
              <th scope="col" className="p-2 font-semibold">
                {tr.leaderboard.player}
              </th>
              <th scope="col" className="p-2 font-semibold">
                {tr.leaderboard.elo}
              </th>
              <th scope="col" className="p-2 font-semibold">
                {tr.leaderboard.record}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((entry) => (
              <tr
                key={entry.userId}
                data-testid={leaderboardRowTestId(entry.rank - 1)}
                className="align-top"
              >
                <td className="p-2">{entry.rank}</td>
                <td className="p-2">{entry.name}</td>
                <td className="p-2">{entry.elo}</td>
                <td className="p-2">{recordText(entry)}</td>
              </tr>
            ))}
            {data.you !== null ? (
              <tr
                data-testid={leaderboardRowTestId(data.you.rank - 1)}
                className="border-border align-top border-t font-semibold"
              >
                <td className="p-2">{data.you.rank}</td>
                <td className="p-2">
                  {data.you.name}
                  <span className="ml-2 text-xs font-normal opacity-80">
                    ({tr.leaderboard.yourRank})
                  </span>
                </td>
                <td className="p-2">{data.you.elo}</td>
                <td className="p-2">{recordText(data.you)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
