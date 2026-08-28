import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MIDDLEWARE_MATCHER } from '../auth.config'

/**
 * AUTH-004 NÖBETÇİSİ — korumalı bir rotaya giden hiçbir `<Link>` otomatik prefetch
 * yapmaz.
 *
 * NEDEN: `middleware.ts`in matcher'ındaki yollar oturum gerektirir. Next.js `<Link>`in
 * varsayılan prefetch'i bu rotalara **arka planda** istek atar ve o istek oturumu
 * yeniler. Kullanıcı "Çıkış yap"a bastıktan SONRA bu isteklerden biri tamamlanırsa,
 * kendi rolling-session `Set-Cookie`'siyle `signOut()`un `Max-Age=0` silmesini **geri
 * alır**. Kullanıcı çıkış yaptığını görür, oturum teknik olarak canlı kalır —
 * paylaşılan cihazda hesap devralması.
 *
 * Kök neden `AUTH-003`ün gerçek CI trace'inden ölçüldü, tahmin değil.
 *
 * NEDEN BU TEST VAR: `AUTH-004` ilk turda yalnız `TopBar`ın DÖRT statik bağlantısını
 * kapattı; matcher'da ise **altı** kalıp var (`/oyna/:path*` ve `/oda/:path*` de dahil).
 * `HomeActions.tsx`teki `/oyna/bilgisayar` bağlantısı açıkta kalmıştı ve lead süpürmede
 * yakaladı. Tek tek yama yerine kural burada **dayatılıyor**: yeni bir `<Link>` korumalı
 * bir rotaya prefetch açık giderse bu test kırmızıya döner.
 *
 * KAPSAM: statik `href="/..."` yazan `<Link>`ler. Şablon değişkenli
 * (`href={`/oda/${kod}`}`) bağlantılar da yakalanır — aşağıdaki desen `href={\`/` ile
 * başlayanları da tarar. `router.push(...)` KAPSAM DIŞIDIR ve olmalıdır: o bir kullanıcı
 * eylemiyle tetiklenen gezinmedir, arka plan isteği değil.
 */

function tsxDosyalari(kok: string): string[] {
  const cikti: string[] = []
  for (const ad of readdirSync(kok)) {
    if (ad === 'node_modules' || ad === '.next' || ad === 'coverage') continue
    const yol = join(kok, ad)
    if (statSync(yol).isDirectory()) cikti.push(...tsxDosyalari(yol))
    else if (ad.endsWith('.tsx') && !ad.includes('.test.')) cikti.push(yol)
  }
  return cikti
}

/** `/oyna/:path*` → `/oyna/` ile başlayan her şey; `/profil` → tam eşleşme. */
function matcherKapsiyorMu(href: string): boolean {
  return MIDDLEWARE_MATCHER.some((kalip) => {
    const dinamik = kalip.indexOf('/:')
    if (dinamik === -1) return href === kalip
    return href.startsWith(kalip.slice(0, dinamik) + '/')
  })
}

/** `<Link ... href="/x" ...>` ya da `<Link ... href={`/x/${y}`} ...>` açılış etiketleri. */
const LINK_ETIKETI = /<Link\b[^>]*>/g
const HREF_STATIK = /href="([^"]+)"/
const HREF_SABLON = /href=\{`([^`$]+)/

describe('AUTH-004 nöbetçisi — korumalı rotaya prefetch açık <Link> YOK', () => {
  const dosyalar = tsxDosyalari(join(process.cwd(), 'components')).concat(
    tsxDosyalari(join(process.cwd(), 'app')),
  )

  it('taranan dosya bulundu (tarayıcının kendisi bozulmasın)', () => {
    expect(dosyalar.length).toBeGreaterThan(5)
  })

  it('matcher kalıpları okunabiliyor ve dinamik olanları da içeriyor', () => {
    expect(MIDDLEWARE_MATCHER.length).toBeGreaterThan(0)
    expect(MIDDLEWARE_MATCHER.some((k) => k.includes('/:'))).toBe(true)
  })

  it('korumalı rotaya giden her <Link> prefetch={false} taşır', () => {
    const ihlaller: string[] = []
    for (const yol of dosyalar) {
      const kaynak = readFileSync(yol, { encoding: 'utf8' })
      for (const etiket of kaynak.match(LINK_ETIKETI) ?? []) {
        const href = (HREF_STATIK.exec(etiket) ?? HREF_SABLON.exec(etiket))?.[1]
        if (!href?.startsWith('/')) continue
        if (!matcherKapsiyorMu(href)) continue
        if (etiket.includes('prefetch={false}')) continue
        ihlaller.push(`${yol.replace(process.cwd() + '/', '')} → ${href}`)
      }
    }
    expect(ihlaller).toEqual([])
  })
})
