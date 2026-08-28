import { connectDb, revokeWsTicketsForUser } from '@xox/db'
import { logError } from '../log'

/**
 * SEC-005 — `revokeWsTicketsForUser` (SEC-003, `@xox/db`) yazıldı, test
 * edildi ama HİÇBİR ÇAĞIRANI yoktu (bkz. `packages/db/src/tickets.ts`
 * dosya başındaki not). Bu fonksiyon o eksik telin karşılığıdır: `auth.ts`in
 * `events.signOut` kancasından çağrılır.
 *
 * next-auth'a HİÇBİR bağımlılığı yok (yalnız bir `userId` string'i alır) —
 * bu yüzden `next-auth`'un derlenmiş çıktısını Vitest'in native ESM
 * yükleyicisinin import edememesi sorunundan (gotchas.md) etkilenmez ve
 * gerçek, çalıştırılan bir testle kilitlenebilir.
 *
 * ⚠️ ASLA FIRLATMAZ. `@auth/core`'un `signOut` uygulaması `events.signOut`
 * çağrısını zaten bir try/catch içine alıp (hata durumunda bile) çerezi
 * TEMİZLEMEYE devam ediyor — yani bu fonksiyon içeride patlasa bile çıkış
 * tamamlanır. Ama hatayı burada da yutup KENDİ maskeleyen log sarmalayıcımız
 * (`logError`) ile raporluyoruz; @auth/core'un varsayılan logger'ına
 * (`console.error` ham `token`/hata nesnesiyle) güvenmiyoruz — o yol
 * maskeleme geçitlerinden (`session-callback.ts` no-console istisnası)
 * GEÇMEZ. Bilet iptali başarısız olursa (DB erişilemez vb.) kullanıcıyı
 * oturumda TUTMAK, biletleri iptal edememekten daha kötüdür; bu yüzden
 * çağıran (`auth.ts`) bu fonksiyonun sonucunu HİÇBİR KOŞULDA bekleyip
 * signOut akışını dallandırmamalı.
 */
export async function revokeTicketsOnSignOut(userId: string | undefined): Promise<void> {
  if (userId === undefined || userId === '') return
  try {
    await connectDb()
    await revokeWsTicketsForUser(userId)
  } catch (error) {
    logError(
      'signOut: revokeWsTicketsForUser başarısız — çıkış yine tamamlanır',
      {
        userId,
      },
      error,
    )
  }
}
