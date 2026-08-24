import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'

let sessionValue: { data: unknown } = { data: null }

vi.mock('next-auth/react', () => ({
  useSession: () => sessionValue,
}))

describe('TopBar', () => {
  it('girişsizken giriş/kayıt bağlantılarını gösterir', () => {
    sessionValue = { data: null }
    render(<TopBar />)

    expect(screen.getByRole('link', { name: 'Giriş yap' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kayıt ol' })).toBeInTheDocument()
  })

  it('girişliyken profil rozetinde görünen adı gösterir', () => {
    sessionValue = { data: { user: { id: 'u1', name: 'Ayşe', email: 'ayse@example.com' } } }
    render(<TopBar />)

    expect(screen.getByRole('link', { name: 'Ayşe' })).toBeInTheDocument()
  })

  it('inceleme minor bulgusu: görünen ad null ise rozet BOŞ render edilmez, e-postaya düşer', () => {
    sessionValue = {
      data: { user: { id: 'u1', name: null, email: 'ayse@example.com' } },
    }
    render(<TopBar />)

    expect(screen.getByRole('link', { name: 'ayse@example.com' })).toBeInTheDocument()
  })
})
