import * as z from 'zod/mini'
import { errorCodeSchema } from '../errors'

/**
 * PERF-005: `zod/mini` — bu şema `ProfileContent.tsx`/`HomeActions.tsx`/
 * `JoinCodeField.tsx`/`FriendAddButton.tsx`/`FriendsContent.tsx`/
 * `JoinRoomPreview.tsx` gibi İSTEMCİ bileşenlerinin HEPSİNİN `@xox/shared`'dan
 * çektiği tek gerçek çalışma-zamanı şemasıdır (`.safeParse()` dışında hiçbir
 * API kullanmıyorlar — ölçüldü, bkz. rapor). Klasik `zod`'un `z` nesnesi TÜM
 * doğrulayıcı metotları tek objede taşıdığı için tek bir `z.object()`
 * çağrısı bile ~60-65 kB gzip'lik çekirdeği İSTEMCİYE sürüklüyordu (PERF-004
 * ölçümü: 485 iz, hangi şemanın kullanıldığından BAĞIMSIZ — asıl maliyet
 * kütüphanenin kendisiydi, tanımlanan şema sayısı değil). `zod/mini` yalnız
 * KULLANILAN doğrulayıcı fonksiyonları içe aktarır.
 */
export const errorResponseSchema = z.object({ code: errorCodeSchema, message: z.string() })
export type ErrorResponse = z.infer<typeof errorResponseSchema>
