import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

/**
 * UI-003 (E2E-002'nin gerçek tarayıcıda bulduğu hata): `SessionProvider`e
 * `session` prop'u geçilmiyordu, bu yüzden her sayfa `useSession()` üzerinden
 * `GET /api/auth/session`i AĞDAN çekiyordu. Bu birim testi ağ isteğini
 * KENDİSİ göremez (onu `E2E-002`'nin ağ casusu yakalar) — burada iddia
 * edilen, `RootLayout`'un sunucu tarafında çözdüğü `session`'ı
 * `SessionProvider`e PROP OLARAK GEÇTİĞİDİR; bu, `useSession()`'ın ilk
 * render'da ağa gitmemesinin ÖN KOŞULUDUR.
 *
 * `next-auth` gerçek paketi Vitest'in native ESM yükleyicisinde ÇALIŞMAZ
 * (conventions.md), bu yüzden hem `@/auth` hem `next-auth/react` burada
 * TAMAMEN mock'lanır — `layout.tsx` gerçek `next-auth`'u hiç yüklemez.
 * `next/headers`'ın `cookies()`'i de `resolveTheme` üzerinden tetiklendiği
 * için (lib/theme.test.ts'teki KANITLANMIŞ kalıp) aynı şekilde mock'lanır.
 *
 * `TopBar` gerçek bileşeni render edilir (mock'lanmaz) — onun `useSession()`
 * çağrısının da AYNI mock'lanmış `next-auth/react`'i kullandığını, yani
 * `SessionProvider` DIŞINDA hiçbir şeyin bozulmadığını dolaylı olarak kanıtlar.
 */
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

const getMock = vi.fn<(name: string) => { value: string } | undefined>()
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: getMock }),
}))

const sessionProviderSpy = vi.fn()
vi.mock('next-auth/react', () => ({
  SessionProvider: (props: { session: unknown; children: ReactNode }) => {
    sessionProviderSpy(props)
    return props.children
  },
  useSession: () => ({ data: null }),
}))

describe('RootLayout', () => {
  it('sunucuda çözülen oturumu SessionProvidere PROP olarak geçer (UI-003)', async () => {
    const fakeSession = { user: { id: 'u1', name: 'Ayşe' }, expires: '2099-01-01' }
    mockAuth.mockResolvedValue(fakeSession)
    getMock.mockReturnValue(undefined)

    const { default: RootLayout } = await import('./layout')
    const element = await RootLayout({ children: <div>çocuk içerik</div> })
    render(element)

    expect(sessionProviderSpy).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ session: fakeSession }),
    )
  })

  it('oturum yokken (girişsiz ziyaretçi) SessionProvidere null geçer, hata fırlatmaz', async () => {
    mockAuth.mockResolvedValue(null)
    getMock.mockReturnValue(undefined)

    const { default: RootLayout } = await import('./layout')
    const element = await RootLayout({ children: <div>çocuk içerik</div> })

    await expect(Promise.resolve(render(element))).resolves.not.toThrow()
    expect(sessionProviderSpy).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ session: null }),
    )
  })
})
