import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProfileContent } from './ProfileContent'

const signOut = vi.fn<(...args: unknown[]) => Promise<void>>()
let sessionValue: { data: unknown; status: string } = { data: null, status: 'unauthenticated' }

vi.mock('next-auth/react', () => ({
  useSession: () => sessionValue,
  signOut: (...args: unknown[]) => signOut(...args),
}))

describe('ProfileContent', () => {
  it('görünen ad, e-posta ve Çıkış yap düğmesini gösterir', async () => {
    sessionValue = {
      status: 'authenticated',
      data: { user: { id: 'u1', name: 'Ayşe Yılmaz', email: 'ayse@example.com' } },
    }
    const user = userEvent.setup()
    render(<ProfileContent />)

    expect(screen.getByText('Ayşe Yılmaz')).toBeInTheDocument()
    expect(screen.getByText('ayse@example.com')).toBeInTheDocument()

    const signOutButton = screen.getByRole('button', { name: 'Çıkış yap' })
    await user.click(signOutButton)
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/' })
  })

  it('oturum yokken hiçbir şey render etmez (middleware zaten yönlendirir)', () => {
    sessionValue = { status: 'unauthenticated', data: null }
    const { container } = render(<ProfileContent />)

    expect(container).toBeEmptyDOMElement()
  })
})
