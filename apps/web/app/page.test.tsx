import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * `HomePage` bir Sunucu Bileşenidir (hook'suz, `next-auth`'a bağımlılığı
 * yok) — `layout.test.tsx`'in `RootLayout` sondasıyla aynı desen: gerçek
 * `HomeActions` yerine bir CASUS mount edilir ve aldığı prop'lar iddia
 * edilir (conventions.md "casus bileşenle prop iddiası"). Böylece asıl
 * sınanan şey `getEnabledBoardSizes()`'in (ADR-0018 §3 kill switch) SUNUCUDA
 * çözülüp istemci bileşenine PROP olarak geçtiğidir — fonksiyonun kendisi
 * hiçbir zaman istemciye sızmaz.
 */
const mockGetEnabledBoardSizes = vi.fn<() => readonly number[]>()
vi.mock('@/lib/game/enabled-sizes', () => ({
  getEnabledBoardSizes: () => mockGetEnabledBoardSizes(),
}))

const homeActionsSpy = vi.fn()
vi.mock('@/components/home/HomeActions', () => ({
  HomeActions: (props: { enabledSizes: readonly number[] }) => {
    homeActionsSpy(props)
    return null
  },
}))

describe('HomePage', () => {
  it('getEnabledBoardSizes() sonucunu HomeActions-e enabledSizes PROP olarak geçer', async () => {
    mockGetEnabledBoardSizes.mockReturnValue([3, 6])

    const { default: HomePage } = await import('./page')
    render(<HomePage />)

    expect(homeActionsSpy).toHaveBeenCalledExactlyOnceWith({ enabledSizes: [3, 6] })
  })

  it('tüm boyutlar açıkken üçünü de olduğu gibi iletir (kill switch KAPALI varsayılan)', async () => {
    mockGetEnabledBoardSizes.mockReturnValue([3, 6, 11])

    const { default: HomePage } = await import('./page')
    render(<HomePage />)

    expect(homeActionsSpy).toHaveBeenCalledExactlyOnceWith({ enabledSizes: [3, 6, 11] })
  })
})
