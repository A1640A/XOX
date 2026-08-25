import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/auth'
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
 * DÜZELTME (UI-003, E2E-002'nin bulduğu gerçek hata): bu dosyaya dokunuş
 * KASITLI OLARAK yalnız `session` prop'uyla SINIRLI — tema okuması,
 * `data-tema`, `SessionProvider` DIŞINDA hiçbir şey değişmedi.
 *
 * `@/auth` artık import EDİLİR (eski notun aksine): `SessionProvider`e
 * `session` prop'u geçilmediği için istemci `useSession()` (`TopBar`) her
 * sayfada `GET /api/auth/session`i AĞDAN çekiyordu — KK-027 "/oyna/bilgisayar
 * hiç ağ isteği yapmaz" şartını ihlal ediyordu. Kök layout zaten `cookies()`
 * okuduğu için (`resolveTheme`) tüm rotalar ZATEN dinamik (`decisions.md`) —
 * `auth()` çağırmak yeni bir statik-render maliyeti GETİRMİYOR. `SessionProvider`
 * (`next-auth/react`, İSTEMCİ modülü) sunucu bileşeninin İÇİNDE render
 * edilebilir; sunucuda ÖNCEDEN çözülmüş `session`'ı prop olarak geçmek,
 * `useSession()`'ın ilk render'da zaten elindeki veriyi tekrar ağdan
 * istemesini engeller (Auth.js v5'in belgelenmiş kalıbı).
 */
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}): Promise<React.ReactElement> {
  const [tema, session] = await Promise.all([resolveTheme(), auth()])

  return (
    <html lang="tr" data-tema={tema}>
      <body className="min-h-dvh antialiased">
        <SessionProvider session={session}>
          <TopBar />
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
