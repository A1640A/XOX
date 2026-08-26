'use client'

import { useEffect, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import {
  DATA_ATTR,
  errorResponseSchema,
  profileResponseSchema,
  TESTID,
  type ErrorCode,
  type ProfileResponse,
} from '@xox/shared'
import type { Theme } from '@xox/ui-tokens'
import { ErrorBanner } from '@/components/ErrorBanner'
import { EditNameForm } from '@/components/profile/EditNameForm'
import { ThemeToggle } from '@/components/profile/ThemeToggle'
import { THEME_COOKIE } from '@/lib/theme-cookie'
import { tr } from '@/messages/tr'

/**
 * Sunucu hata gövdesi HER ZAMAN `errorResponseSchema`'dan geçirilir, `as`
 * cast'i YOK (bu gecenin dersi — doğrulanmamış bir cast boş bir `role="alert"`
 * üretebiliyordu ve E2E `getByTestId` iddiası boş elemana karşı GEÇİYORDU).
 * Gövde beklenen biçimde değilse `SERVER_ERROR`'a düşülür, asla `undefined`
 * bir koda geçilmez.
 */
async function parseErrorCode(response: Response): Promise<ErrorCode> {
  const body: unknown = await response.json().catch(() => null)
  const parsed = errorResponseSchema.safeParse(body)
  return parsed.success ? parsed.data.code : 'SERVER_ERROR'
}

/**
 * `<html data-tema>` mutasyonu + çerez yazımı SAYFA YENİLENMEDEN uygulanır
 * (kart KK-083). `apps/web/lib/theme.ts`'in `resolveTheme()`'i bir sonraki
 * SSR'da AYNI çerezi okuyacağı için FOUC olmadan kalıcı olur; `app/layout.tsx`
 * bu görevde AÇILMADI (kart notu) — kök `<html>` öğesinin ilk render'ı
 * hâlâ sunucu tarafı `resolveTheme()`'e ait, biz yalnız istemci tarafında
 * ÜZERİNE yazıyoruz (`next-themes` kütüphanesinin de kullandığı kalıp).
 */
function applyThemeLocally(theme: Theme): void {
  document.documentElement.setAttribute(DATA_ATTR.tema, theme)
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`
}

/**
 * Profil konteyneri (kart W2-02): `GET /api/profile` ile ad/e-posta/istatistik/
 * ELO/tema çeker, `PATCH /api/profile` ile ad ve tema günceller. Tek ağ
 * katmanı burasıdır — `EditNameForm`/`ThemeToggle` saf sunum bileşenleridir,
 * `fetch` çağırmazlar (davranışı burada test etmek, iki ayrı mock kaynağını
 * senkronize tutmaktan daha güvenilir).
 *
 * `@/auth` import EDİLMEZ; middleware zaten girişsizi `/giris`e yönlendirir,
 * `session === null` dalı yalnızca bir güvenlik ağıdır.
 */
export function ProfileContent(): React.ReactElement | null {
  const { data: session, status } = useSession()

  const [profile, setProfile] = useState<ProfileResponse | null>(null)
  const [loadError, setLoadError] = useState<ErrorCode | null>(null)

  const [namePending, setNamePending] = useState(false)
  const [nameError, setNameError] = useState<ErrorCode | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const [themePending, setThemePending] = useState(false)
  const [themeError, setThemeError] = useState<ErrorCode | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') return

    let cancelled = false

    async function loadProfile(): Promise<void> {
      try {
        const response = await fetch('/api/profile')
        if (!response.ok) {
          if (!cancelled) setLoadError(await parseErrorCode(response))
          return
        }
        const body: unknown = await response.json()
        const parsed = profileResponseSchema.safeParse(body)
        if (cancelled) return
        if (parsed.success) {
          setProfile(parsed.data)
        } else {
          setLoadError('SERVER_ERROR')
        }
      } catch {
        if (!cancelled) setLoadError('NETWORK')
      }
    }

    void loadProfile()
    return () => {
      cancelled = true
    }
  }, [status])

  async function handleSaveName(name: string): Promise<void> {
    setNamePending(true)
    setNameError(null)
    setSavedMessage(null)
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!response.ok) {
        setNameError(await parseErrorCode(response))
        return
      }
      const body: unknown = await response.json()
      const parsed = profileResponseSchema.safeParse(body)
      if (!parsed.success) {
        setNameError('SERVER_ERROR')
        return
      }
      setProfile(parsed.data)
      setSavedMessage(tr.profile.nameSaved)
    } catch {
      setNameError('NETWORK')
    } finally {
      setNamePending(false)
    }
  }

  async function handleChangeTheme(theme: Theme): Promise<void> {
    if (profile === null || theme === profile.theme) return
    const previous = profile.theme

    setThemePending(true)
    setThemeError(null)
    applyThemeLocally(theme)
    setProfile({ ...profile, theme })

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      })
      if (!response.ok) {
        setThemeError(await parseErrorCode(response))
        applyThemeLocally(previous)
        setProfile((current) => (current !== null ? { ...current, theme: previous } : current))
      }
    } catch {
      setThemeError('NETWORK')
      applyThemeLocally(previous)
      setProfile((current) => (current !== null ? { ...current, theme: previous } : current))
    } finally {
      setThemePending(false)
    }
  }

  if (status === 'loading') return <p>{tr.common.loading}</p>
  // Middleware zaten girişsizi `/giris`e yönlendirir; bu yalnız bir güvenlik ağıdır.
  if (session === null) return null

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{tr.profile.title}</h1>
      <button
        type="button"
        onClick={() => {
          void signOut({ callbackUrl: '/' })
        }}
        className="self-start"
      >
        {tr.auth.signOut}
      </button>

      {loadError !== null ? <ErrorBanner code={loadError} /> : null}

      {profile === null && loadError === null ? <p>{tr.common.loading}</p> : null}

      {profile !== null ? (
        <>
          <p className="opacity-70">{profile.email}</p>

          <dl className="grid grid-cols-3 gap-4 text-center">
            <div>
              <dt>{tr.profile.wins}</dt>
              <dd data-testid={TESTID.istatistikGalibiyet}>{profile.stats.wins}</dd>
            </div>
            <div>
              <dt>{tr.profile.losses}</dt>
              <dd data-testid={TESTID.istatistikMaglubiyet}>{profile.stats.losses}</dd>
            </div>
            <div>
              <dt>{tr.profile.draws}</dt>
              <dd data-testid={TESTID.istatistikBeraberlik}>{profile.stats.draws}</dd>
            </div>
          </dl>

          <p>
            {tr.profile.elo}: <span data-testid={TESTID.eloPuani}>{profile.elo}</span>
          </p>

          <EditNameForm
            currentName={profile.name}
            pending={namePending}
            error={nameError}
            savedMessage={savedMessage}
            onSave={(name) => {
              void handleSaveName(name)
            }}
          />

          <div className="flex flex-col gap-2">
            <ThemeToggle
              theme={profile.theme}
              pending={themePending}
              onChange={(theme) => {
                void handleChangeTheme(theme)
              }}
            />
            <ErrorBanner code={themeError} />
          </div>
        </>
      ) : null}
    </div>
  )
}
