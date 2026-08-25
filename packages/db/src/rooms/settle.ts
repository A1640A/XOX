import type { TransitionResult } from './types'

/**
 * Tembel süre aşımı/terk kontrolü — KK-074/075/077, çift yürütme (ADR-0004,
 * tasarım §5.7). Her gelen WS mesajının işlenmesinden ÖNCE çağrılır; ölü bir
 * instance'ın zamanlayıcısı kaybolsa bile sonuç bir sonraki temasta
 * kesinleşir. Uygulanacak bir şey yoksa `null` döner (istisna değil, "bu
 * çağrının konusu yok" anlamına gelir).
 *
 * **TODO(W2-01): GÖVDE HENÜZ YAZILMADI — bugün koşulsuz `null` dönüyor.**
 *
 * Diğer iskeletlerin aksine bu fonksiyon FIRLATMIYOR. Sebep davranışsal:
 * `apps/web/lib/realtime/session.ts` bunu bağlantı kurulurken ve GEÇERLİ HER
 * mesajdan önce çağırıyor. Fırlatan bir gövde, her `ping` başına bir yakalanmış
 * istisna + bir `console.error` üretiyordu; bu (a) gerçek hataları gürültüye
 * gömüyor, (b) **aktif oda kodlarını yüksek hacimde log'a akıtıyordu** — oda
 * kodu bu sistemde odanın tek yetki anahtarıdır (kodu bilen + boş koltuk =
 * odaya girer), yani log erişimi olan biri canlı oyunlara katılabilirdi
 * (güvenlik denetimi bulgusu).
 *
 * Sessiz bir no-op'a dönüşmemesi için `settle.skeleton.test.ts` bugünkü
 * "hiçbir koşulda yazma yapmaz + daima null" davranışını AÇIKÇA iddia ediyor:
 * W2-01 gövdeyi doldurduğu anda o test kırmızıya döner ve güncellenmek
 * ZORUNDA kalır. Unutulup sessizce yaşamaya devam edemez.
 *
 * Saf karar fonksiyonu (`dueSettlement`) bugün `apps/web/lib/game/deadlines.ts`
 * içinde; W2-01 gövdeyi yazarken kuralı BURADA yeniden yazmak yerine taşımayı
 * değerlendirmeli (bağımlılık yönü `packages/db → apps/web` olamaz).
 */
export async function settleDeadlines(code: string, now: number): Promise<TransitionResult | null> {
  await Promise.resolve()
  void code
  void now
  return null
}
