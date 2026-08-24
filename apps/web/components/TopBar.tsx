'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { tr } from '@/messages/tr'

/**
 * Global üst çubuk (spec §4.1 "Global öğeler"): logo + girişliyse profil
 * rozeti ve sosyal katman bağlantıları. Hedef sayfalar (`/siralama`, `/gecmis`,
 * `/arkadaslar`) Dalga 2-3'te (W3-01…04) yazılır — bağlantılar şimdiden
 * kurulur, o sayfalar gelene kadar 404 verirler; bu, dalga bölümlemesinin
 * kabul ettiği geçici bir durumdur (kart §8).
 *
 * `@/auth` import EDİLMEZ (kart §10): oturum bilgisi yalnız `next-auth/react`
 * istemci hook'undan okunur, `SessionProvider` `app/layout.tsx`'te kurulur.
 */
export function TopBar(): React.ReactElement {
  const { data: session } = useSession()

  return (
    <header className="border-border flex items-center justify-between border-b p-4 text-sm">
      <Link href="/" className="font-bold">
        {tr.app.name}
      </Link>
      {session ? (
        <nav className="flex items-center gap-4">
          <Link href="/profil">{session.user.name}</Link>
          <Link href="/siralama">{tr.leaderboard.title}</Link>
          <Link href="/gecmis">{tr.history.title}</Link>
          <Link href="/arkadaslar">{tr.friends.title}</Link>
        </nav>
      ) : (
        <nav className="flex items-center gap-4">
          <Link href="/giris">{tr.auth.signIn}</Link>
          <Link href="/kayit">{tr.auth.signUp}</Link>
        </nav>
      )}
    </header>
  )
}
