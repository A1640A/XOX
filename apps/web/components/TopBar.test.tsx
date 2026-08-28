import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'

let sessionValue: { data: unknown } = { data: null }

vi.mock('next-auth/react', () => ({
  useSession: () => sessionValue,
}))

/**
 * AUTH-004 casus bileşen (conventions.md "Casus bileşenle prop iddiası"):
 * gerçek `next/link`'in prefetch DAVRANIŞI jsdom'da gözlemlenemez (hover/
 * viewport prefetch'i `IntersectionObserver`'a dayanır, jsdom'da yok) —
 * bu yüzden bileşenin YERİNE geçen bir sahte `Link` mount edilip aldığı
 * `prefetch` prop'u kaydedilir; `next/link`'in kendisi asla açılmaz.
 */
const linkCalls: { href: string; prefetch: boolean | undefined }[] = []

vi.mock('next/link', () => ({
  default: ({
    href,
    prefetch,
    children,
    className,
  }: {
    href: string
    prefetch?: boolean
    children: React.ReactNode
    className?: string
  }) => {
    linkCalls.push({ href, prefetch })
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  },
}))

describe('TopBar', () => {
  beforeEach(() => {
    linkCalls.length = 0
  })

  it(
    'AUTH-004: middleware.ts korumalı yollarına (/profil, /siralama, /gecmis, ' +
      '/arkadaslar) giden bağlantılar prefetch={false} — otomatik prefetch, ' +
      'çıkıştan sonra rolling-session çerezini geri getiren yarışı üretmesin',
    () => {
      sessionValue = { data: { user: { id: 'u1', name: 'Ayşe', email: 'ayse@example.com' } } }
      render(<TopBar />)

      const protectedHrefs = ['/profil', '/siralama', '/gecmis', '/arkadaslar']
      for (const href of protectedHrefs) {
        const call = linkCalls.find((c) => c.href === href)
        expect(call).toBeDefined()
        expect(call?.prefetch).toBe(false)
      }

      // Negatif kontrol (conventions.md): "yokluk" iddiasının yanında dolu bir
      // liste olmalı — logo bağlantısı middleware matcher'a girmez, prefetch
      // elle KAPATILMAMALI (varsayılan davranışı korur).
      const homeLink = linkCalls.find((c) => c.href === '/')
      expect(homeLink).toBeDefined()
      expect(homeLink?.prefetch).toBeUndefined()
    },
  )

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
