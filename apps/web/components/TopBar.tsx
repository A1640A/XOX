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
 *
 * **AUTH-004 güvenlik düzeltmesi — `prefetch={false}`:** bu dört bağlantı
 * (`/profil`, `/siralama`, `/gecmis`, `/arkadaslar`) `middleware.ts`'in
 * `config.matcher`'ıyla BİREBİR aynı korumalı kümedir (bkz. `auth.config.ts`
 * `MIDDLEWARE_MATCHER`). Next.js `<Link>`'in varsayılan otomatik prefetch'i
 * (görünüme girince/hover'da) bu yolları arka planda GET'ler; istek
 * `middleware.ts`'teki `auth()` sarmalayıcısından geçer ve JWT hâlâ geçerliyse
 * oturum çerezini YENİDEN YAZAR (rolling `Set-Cookie`). Kullanıcı `/profil`
 * sayfasındayken bu dört bağlantı zaten viewport'ta olduğu için otomatik
 * prefetch tetiklenir; "Çıkış yap" tıklanıp `signOut()` çerezi `Max-Age=0`
 * ile sildikten SONRA bu prefetch isteklerinden biri tamamlanırsa, kendi
 * `Set-Cookie`'siyle silmeyi geri alır — kullanıcı çıkış yaptığını görür ama
 * oturum teknik olarak canlı kalır (paylaşılan cihazda hesap devralma).
 * `middleware.ts` YALNIZ bu altı yolu eşliyor (matcher), dolayısıyla prefetch'i
 * tam bu dört bağlantıda kapatmak yarışın KAYNAĞINI SIFIRLAR — kısmi bir
 * yama değil. Diğer bağlantılar (`/`, `/giris`, `/kayit`) matcher'a girmediği
 * için `middleware.ts` onlarda hiç çalışmaz, dokunulmadı.
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
          {/* İnceleme minor bulgusu: `name` Auth.js'in varsayılan tipinde
              `string | null | undefined` — nullish ise rozet BOŞ render
              edilirdi. `HomeActions.tsx`'teki aynı yedek (`email`) kullanılır. */}
          <Link href="/profil" prefetch={false}>
            {session.user.name ?? session.user.email}
          </Link>
          <Link href="/siralama" prefetch={false}>
            {tr.leaderboard.title}
          </Link>
          <Link href="/gecmis" prefetch={false}>
            {tr.history.title}
          </Link>
          <Link href="/arkadaslar" prefetch={false}>
            {tr.friends.title}
          </Link>
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
