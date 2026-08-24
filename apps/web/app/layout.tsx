import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import { TopBar } from '@/components/TopBar'
import { resolveTheme } from '@/lib/theme'
import { tr } from '@/messages/tr'
import './globals.css'

export const metadata: Metadata = {
  title: tr.app.name,
  description: tr.app.tagline,
}

/**
 * SICAK DOSYA DONDURMA #2 (kart) — bu dosya bu görevden sonra yalnız W2-04
 * (Analytics/Speed Insights) için açılır; tema değiştirici `components/profile/`
 * altında (W2-02) ayrı bir bileşendir, buraya dönmez.
 *
 * `@/auth` BİLEREK import edilmez (kart §10) — `resolveTheme` yalnız bir
 * çerezi okur, oturumu değil. `SessionProvider` (`next-auth/react`, İSTEMCİ
 * modülü) sunucu bileşeninin İÇİNDE render edilebilir; bu, oturum durumunu
 * server-only `auth()` çağırmadan istemci tarafında (`useSession`) tüketmenin
 * Auth.js v5'in belgelenmiş kalıbıdır.
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}): Promise<React.ReactElement> {
  const tema = await resolveTheme()

  return (
    <html lang="tr" data-tema={tema}>
      <body className="min-h-dvh antialiased">
        <SessionProvider>
          <TopBar />
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
