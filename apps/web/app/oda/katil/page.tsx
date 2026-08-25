import { JoinCodeField } from '@/components/JoinCodeField'
import { tr } from '@/messages/tr'

/**
 * `/oda/katil` — ana sayfadaki oda kodu alanının derin bağlanabilir eşi
 * (W1-04 kriter 1). `JoinCodeField` BİREBİR aynı bileşen; normalleştirme,
 * doğrulama ve hata yüzeyi tek bir yerde yaşar, burada tekrarlanmaz.
 */
export default function OdaKatilPage(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">{tr.home.joinRoom}</h1>
      <JoinCodeField />
    </main>
  )
}
