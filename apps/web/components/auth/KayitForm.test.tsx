import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KayitForm } from './KayitForm'

const push = vi.fn()
const signIn = vi.fn<(...args: unknown[]) => Promise<{ error?: string }>>()

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
})
