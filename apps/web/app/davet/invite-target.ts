import { roomCodeSchema } from '@xox/shared'
import type { RoomCode } from '@xox/shared'

/**
 * `/davet/[kod]` iş mantığı — `next-auth`'a HİÇBİR bağımlılığı yok, bu yüzden
 * Vitest'te gerçekten koşturulabilir (conventions.md "ince tel dosyası +
 * next-auth'suz iş mantığı"). `page.tsx` yalnız oturumu çözüp buraya sorar.
 */

/** `/oda/[kod]` ile AYNI normalleştirme: kırp + büyüt, sonra şemaya sor. */
export function normalizeInviteCode(raw: string): RoomCode | null {
  const parsed = roomCodeSchema.safeParse(raw.trim().toUpperCase())
  return parsed.success ? parsed.data : null
}

/**
 * KK-121. Girişliyse doğrudan odaya; değilse `/giris`e — **ama oda yolunu
 * `donus`ta taşıyarak**. Kod bu turda kaybolursa davet linki değersizdir:
 * kullanıcı giriş yapar ve ana sayfada kalır, kodu artık hiçbir yerde yoktur.
 *
 * `/davet/*` middleware matcher'ında YOKTUR (AUTH-001) — yani bu yönlendirmeyi
 * middleware değil, bu sayfa yapar. Eğer davet linki doğrudan `/oda/<KOD>`e
 * işaret etseydi middleware devreye girer ve AYNI `donus`u üretirdi; fark,
 * davet URL'sinin oda URL'sinden ayrı bir yüzey olarak kalması (ileride
 * "davet edildin" ekranı ya da kod doğrulaması eklenebilir).
 *
 * `encodeURIComponent` ZORUNLU: kodlanmamış bir `/oda/X` değeri sorgu dizesinde
 * ayrıştırılırken bozulabilir ve `donus` sessizce kısalabilir.
 */
export function inviteRedirect(code: RoomCode, signedIn: boolean): string {
  const roomPath = `/oda/${code}`
  if (signedIn) return roomPath
  return `/giris?donus=${encodeURIComponent(roomPath)}`
}
