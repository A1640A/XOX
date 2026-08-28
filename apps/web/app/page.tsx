import { HomeActions } from '@/components/home/HomeActions'
import { headingDisplay } from '@/components/ui/styles'
import { getEnabledBoardSizes } from '@/lib/game/enabled-sizes'
import { tr } from '@/messages/tr'

/**
 * Sunucu bileşeni (RSC varsayılanı): `getEnabledBoardSizes()` (ADR-0018 §3
 * kill switch, `apps/web/lib/game/enabled-sizes.ts`) yalnız SUNUCUDA anlamlı
 * bir ortam değişkenine bakar — istemci bileşenine (`HomeActions`) fonksiyonun
 * KENDİSİ değil, ÇÖZÜLMÜŞ (serileştirilebilir) sonucu prop olarak geçirilir.
 */
export default function HomePage(): React.ReactElement {
  const enabledSizes = getEnabledBoardSizes()

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6">
      <h1 className={`${headingDisplay} text-4xl`}>{tr.app.name}</h1>
      <p className="text-text-muted text-center text-lg">{tr.app.tagline}</p>
      <HomeActions enabledSizes={enabledSizes} />
    </main>
  )
}
