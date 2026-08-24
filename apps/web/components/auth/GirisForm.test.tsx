import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GirisForm } from './GirisForm'

const push = vi.fn()
const signIn = vi.fn<(...args: unknown[]) => Promise<{ error?: string }>>()
let searchParamsValue = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}))

vi.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}))

describe('GirisForm', () => {
  it('başarılı girişte donus parametresine yönlendirir', async () => {
    searchParamsValue = 'donus=%2Foda%2FABC234'
    signIn.mockResolvedValue({})
    const user = userEvent.setup()
    render(<GirisForm />)

    await user.type(screen.getByTestId('giris-eposta'), 'ayse@example.com')
    await user.type(screen.getByTestId('giris-parola'), 'gecerli-sifre1')
    await user.click(screen.getByTestId('btn-giris'))

    expect(signIn).toHaveBeenCalledWith('credentials', {
      email: 'ayse@example.com',
      password: 'gecerli-sifre1',
      redirect: false,
    })
    expect(push).toHaveBeenCalledExactlyOnceWith('/oda/ABC234')
  })

  it('protokol-göreli donus (//evil.com) güvenli varsayılana düşer', async () => {
    searchParamsValue = 'donus=%2F%2Fevil.com'
    signIn.mockResolvedValue({})
    const user = userEvent.setup()
    render(<GirisForm />)

    await user.type(screen.getByTestId('giris-eposta'), 'ayse@example.com')
    await user.type(screen.getByTestId('giris-parola'), 'gecerli-sifre1')
    await user.click(screen.getByTestId('btn-giris'))

    expect(push).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('başarısız girişte hata-mesaji INVALID_CREDENTIALS gösterir', async () => {
    searchParamsValue = ''
    signIn.mockResolvedValue({ error: 'CredentialsSignin' })
    const user = userEvent.setup()
    render(<GirisForm />)

    await user.type(screen.getByTestId('giris-eposta'), 'ayse@example.com')
    await user.type(screen.getByTestId('giris-parola'), 'yanlis-sifre1')
    await user.click(screen.getByTestId('btn-giris'))

    expect(push).not.toHaveBeenCalled()
    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'INVALID_CREDENTIALS')
  })
})
