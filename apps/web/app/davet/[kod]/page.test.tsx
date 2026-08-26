import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * `@/auth` GERÇEK `next-auth` paketini yüklüyor ve o paket Vitest'in native ESM
 * yükleyicisinde çalışmıyor (CLAUDE.md / conventions.md). Fabrikalı `vi.mock`
 * modülün hiç yüklenmemesini sağlar — `layout.test.tsx`teki KANITLANMIŞ kalıp.
 */
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

/**
 * `redirect()` üretimde fırlatarak render'ı keser. Burada fırlatmayan bir casus
 * kullanılıyor ki "yönlendirdi Mİ" ile "yönlendirmeden ne render etti"yi AYRI
 * AYRI görebilelim: gerçek `redirect` kullanılsaydı, sayfa yönlendirmeye ek
 * olarak bir hata şeridi de üretse bunu hiç fark edemezdik.
 */
const redirect = vi.fn()
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirect(url)
  },
}))

const { default: DavetPage } = await import('./page')

function params(kod: string): Promise<{ kod: string }> {
  return Promise.resolve({ kod })
}

describe('/davet/[kod] — KK-121', () => {
  it('girişli kullanıcıyı doğrudan odaya yönlendirir', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1', name: 'Ada' }, expires: '2099-01-01' })

    await DavetPage({ params: params('abc234') })

    expect(redirect).toHaveBeenCalledExactlyOnceWith('/oda/ABC234')
  })

  it('oturumsuz kullanıcıyı /giris`e yollar ve oda kodunu donus`ta KORUR', async () => {
    mockAuth.mockResolvedValue(null)

    await DavetPage({ params: params('ABC234') })

    expect(redirect).toHaveBeenCalledExactlyOnceWith('/giris?donus=%2Foda%2FABC234')
  })

  it('oturum var ama user yoksa oturumsuz sayılır', async () => {
    mockAuth.mockResolvedValue({ expires: '2099-01-01' })

    await DavetPage({ params: params('ABC234') })

    expect(redirect).toHaveBeenCalledExactlyOnceWith('/giris?donus=%2Foda%2FABC234')
  })

  it('geçersiz kod TEK bir hata-mesaji düğümü gösterir ve YÖNLENDİRMEZ', async () => {
    mockAuth.mockResolvedValue(null)

    render(await DavetPage({ params: params('bozuk-kod') }))

    // UI-002'nin bulduğu tuzak: iki `hata-mesaji` düğümü olursa
    // `getByTestId` "found multiple elements" ile patlar. Tek bölge.
    const hatalar = screen.getAllByTestId('hata-mesaji')
    expect(hatalar).toHaveLength(1)
    expect(hatalar[0]).toHaveAttribute('data-kod', 'INVALID_CODE')
    expect(hatalar[0]).toHaveTextContent(
      'Oda kodu 6 haneli olmalı ve yalnızca harf-rakam içermeli.',
    )
    expect(redirect).not.toHaveBeenCalled()
  })

  it('geçersiz kodda oturum HİÇ okunmaz (gereksiz auth() çağrısı yok)', async () => {
    mockAuth.mockResolvedValue(null)

    render(await DavetPage({ params: params('yok') }))

    expect(mockAuth).not.toHaveBeenCalled()
    // "Yokluk" iddiasının pozitif eşi: geçerli kodda auth() GERÇEKTEN çağrılıyor.
    await DavetPage({ params: params('ABC234') })
    expect(mockAuth).toHaveBeenCalledTimes(1)
  })
})
