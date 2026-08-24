import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KayitForm } from './KayitForm'

const push = vi.fn()
const signIn = vi.fn<(...args: unknown[]) => Promise<{ error?: string } | undefined>>()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}))

describe('KayitForm', () => {
  beforeEach(() => {
    push.mockClear()
    signIn.mockClear()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('başarılı kayıtta oturum açar ve ana sayfaya yönlendirir', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ userId: 'u1' }), { status: 201 }),
    )
    signIn.mockResolvedValue({})
    const user = userEvent.setup()
    render(<KayitForm />)

    await user.type(screen.getByLabelText('Görünen ad'), 'Ayşe')
    await user.type(screen.getByTestId('giris-eposta'), 'ayse@example.com')
    await user.type(screen.getByTestId('giris-parola'), 'gecerli-sifre1')
    await user.click(screen.getByTestId('btn-kayit'))

    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(signIn).toHaveBeenCalledWith('credentials', {
      email: 'ayse@example.com',
      password: 'gecerli-sifre1',
      redirect: false,
    })
    expect(push).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('e-posta zaten kayıtlıysa hata-mesaji EMAIL_TAKEN gösterir', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'EMAIL_TAKEN', message: 'x' }), { status: 409 }),
    )
    const user = userEvent.setup()
    render(<KayitForm />)

    await user.type(screen.getByLabelText('Görünen ad'), 'Ayşe')
    await user.type(screen.getByTestId('giris-eposta'), 'ayse@example.com')
    await user.type(screen.getByTestId('giris-parola'), 'gecerli-sifre1')
    await user.click(screen.getByTestId('btn-kayit'))

    expect(signIn).not.toHaveBeenCalled()
    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'EMAIL_TAKEN')
  })

  it('İNCELEME MAJOR #7: sunucu enum dışı/şemasız bir gövde dönerse SERVER_ERROR-a düşer, boş render etmez', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('<html>Gateway Timeout</html>', { status: 504 }),
    )
    const user = userEvent.setup()
    render(<KayitForm />)

    await user.type(screen.getByLabelText('Görünen ad'), 'Ayşe')
    await user.type(screen.getByTestId('giris-eposta'), 'ayse@example.com')
    await user.type(screen.getByTestId('giris-parola'), 'gecerli-sifre1')
    await user.click(screen.getByTestId('btn-kayit'))

    const banner = screen.getByTestId('hata-mesaji')
    expect(banner).not.toBeEmptyDOMElement()
    expect(banner).toHaveAttribute('data-kod', 'SERVER_ERROR')
  })

  it('İNCELEME MAJOR #7: kayıt sonrası signIn undefined dönerse hata gösterir, düğme KİLİTLİ KALMAZ', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ userId: 'u1' }), { status: 201 }),
    )
    signIn.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<KayitForm />)

    await user.type(screen.getByLabelText('Görünen ad'), 'Ayşe')
    await user.type(screen.getByTestId('giris-eposta'), 'ayse@example.com')
    await user.type(screen.getByTestId('giris-parola'), 'gecerli-sifre1')
    await user.click(screen.getByTestId('btn-kayit'))

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'SERVER_ERROR')
    expect(screen.getByTestId('btn-kayit')).not.toBeDisabled()
  })

  it('İNCELEME MAJOR #7: fetch reddedilirse (ağ kesik) NETWORK hatası gösterir, düğme KİLİTLİ KALMAZ', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<KayitForm />)

    await user.type(screen.getByLabelText('Görünen ad'), 'Ayşe')
    await user.type(screen.getByTestId('giris-eposta'), 'ayse@example.com')
    await user.type(screen.getByTestId('giris-parola'), 'gecerli-sifre1')
    await user.click(screen.getByTestId('btn-kayit'))

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'NETWORK')
    expect(screen.getByTestId('btn-kayit')).not.toBeDisabled()
  })
})
