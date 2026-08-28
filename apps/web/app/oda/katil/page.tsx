import { JoinRoomPreview } from '@/components/board-config/JoinRoomPreview'
import { headingDisplay } from '@/components/ui/styles'
import { tr } from '@/messages/tr'

/**
 * `/oda/katil` — W1-04 kriter 1'in "ana sayfadaki alanın birebir eşi" kararı
 * `UI-CFG-001` ile BİLİNÇLİ olarak revize edildi: SB-09/US-B03 katılan
 * oyuncunun odaya girmeden önce oyun ayarını (boyut/K) görmesini ZORUNLU
 * kılıyor, bu da `JoinCodeField`in tek-adımlı (doğrula → hemen yönlendir)
 * akışıyla uyuşmuyor. Bu yüzden bu sayfa artık `JoinCodeField` DEĞİL,
 * kendi önizleme adımına sahip `JoinRoomPreview`i kullanır (bkz. o dosyanın
 * başlık yorumu) — Home'un hızlı-katıl alanı hâlâ eski `JoinCodeField`i
 * kullanmaya devam eder, DOKUNULMADI.
 */
export default function OdaKatilPage(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className={`${headingDisplay} text-2xl`}>{tr.home.joinRoom}</h1>
      <JoinRoomPreview />
    </main>
  )
}
