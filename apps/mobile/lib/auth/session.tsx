import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getApiBaseUrl } from '../env'
import { refreshTokenPair } from './api'
import { signInWithBrowser } from './browser-login'
import { identityFromAccessToken, isExpiringSoon } from './jwt'
import { clearTokenPair, loadTokenPair, saveTokenPair } from './storage'

/**
 * İNCE TEL (KK-009 mobil köprüsü — istemci oturum durumu). `storage.ts`
 * (`expo-secure-store`/`react-native`) ve `browser-login.ts`
 * (`expo-web-browser`/`expo-linking`) import ettiği için Vitest'te
 * ÇALIŞTIRILAMAZ; test edilebilir mantık (`jwt.ts`, `deep-link.ts`, `api.ts`)
 * next-auth'suz ayrı dosyalarda yaşıyor (conventions.md deseni). `KK-093`
 * (Expo Go manuel doğrulama) bu dosyanın gerçek davranış kanıtıdır.
 */

// `SessionStatus`/`SessionState`/`SignInResult` BİLEREK dışa verilmez (knip) —
// tek tüketicileri bu dosyanın kendisi (`SessionContextValue`nin gövdesi);
// dışarıdaki her çağıran `useSession()`in döndürdüğü `SessionContextValue`yi
// kullanır, alt tipleri isimle import etmez.
type SessionStatus = 'yukleniyor' | 'girdi' | 'girmedi'

interface SessionState {
  readonly status: SessionStatus
  readonly userId: string | null
  readonly name: string | null
}

type SignInResult = { readonly ok: true } | { readonly ok: false; readonly code: string }

export interface SessionContextValue extends SessionState {
  readonly signIn: () => Promise<SignInResult>
  readonly signOut: () => Promise<void>
  /**
   * Geçerli (gerekirse ÖNCEDEN YENİLENMİŞ) erişim jetonunu döner. Refresh de
   * geçersizse (ADR-0005 yeniden-kullanım tespiti dahil) oturum KAPANIR ve
   * `null` döner — çağıran taraf bunu "yeniden giriş gerekir" sayar.
   */
  readonly ensureAccessToken: () => Promise<string | null>
}

const SessionContext = createContext<SessionContextValue | null>(null)

/** Erişim jetonu (`MOBILE_ACCESS_TTL_SECONDS`=900 sn) dolmadan 1 dk önce yenilenir. */
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60_000

export function SessionProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<SessionState>({
    status: 'yukleniyor',
    userId: null,
    name: null,
  })
  const accessTokenRef = useRef<string | null>(null)
  const refreshTokenRef = useRef<string | null>(null)
  // Eşzamanlı birden çok `ensureAccessToken` çağrısı TEK refresh isteğini
  // PAYLAŞIR — aksi halde iki bileşen aynı anda "yenile" derse ADR-0005'in
  // döndürmeli (rotating, TEK KULLANIMLIK) refresh token'ı ikinci çağrıdan
  // önce yanmış olur (SEC-003'ün aynı riski, bkz. `apps/web/app/api/auth/
  // mobile/refresh/route.ts`).
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function restore(): Promise<void> {
      const pair = await loadTokenPair()
      if (cancelled) return
      if (pair === null) {
        setState({ status: 'girmedi', userId: null, name: null })
        return
      }
      accessTokenRef.current = pair.access
      refreshTokenRef.current = pair.refresh
      const identity = identityFromAccessToken(pair.access)
      setState({ status: 'girdi', userId: identity?.userId ?? null, name: identity?.name ?? null })
    }

    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  async function applyPair(pair: { token: string; refresh: string }): Promise<void> {
    accessTokenRef.current = pair.token
    refreshTokenRef.current = pair.refresh
    await saveTokenPair({ access: pair.token, refresh: pair.refresh })
    const identity = identityFromAccessToken(pair.token)
    setState({ status: 'girdi', userId: identity?.userId ?? null, name: identity?.name ?? null })
  }

  async function signOut(): Promise<void> {
    accessTokenRef.current = null
    refreshTokenRef.current = null
    await clearTokenPair()
    setState({ status: 'girmedi', userId: null, name: null })
  }

  async function signIn(): Promise<SignInResult> {
    const result = await signInWithBrowser()
    if (!result.ok) return { ok: false, code: result.code }
    await applyPair({ token: result.token, refresh: result.refresh })
    return { ok: true }
  }

  async function performRefresh(): Promise<string | null> {
    const refresh = refreshTokenRef.current
    if (refresh === null) return null
    const result = await refreshTokenPair(getApiBaseUrl(), refresh)
    if (!result.ok) {
      // KK-009: silinmiş/yeniden kullanılmış bir refresh token 401 alır —
      // tek makul tepki oturumu kapatmaktır (sahte "sonsuza dek bağlanıyor"
      // yerine kullanıcı `/giris` akışına geri döner).
      await signOut()
      return null
    }
    await applyPair(result.data)
    return result.data.token
  }

  async function ensureAccessToken(): Promise<string | null> {
    const current = accessTokenRef.current
    if (current !== null && !isExpiringSoon(current, Date.now(), ACCESS_TOKEN_REFRESH_MARGIN_MS)) {
      return current
    }
    refreshInFlightRef.current ??= performRefresh().finally(() => {
      refreshInFlightRef.current = null
    })
    return refreshInFlightRef.current
  }

  const value = useMemo<SessionContextValue>(
    () => ({ ...state, signIn, signOut, ensureAccessToken }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fonksiyonlar `ref`lere kapanıyor, kimlikleri kararlı olmasa da davranışları `state`e bağlı DEĞİL
    [state],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (ctx === null) {
    throw new Error('useSession yalnız <SessionProvider> içinde çağrılabilir.')
  }
  return ctx
}
