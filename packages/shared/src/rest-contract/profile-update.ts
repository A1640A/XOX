import { z } from 'zod'
import { displayNameSchema } from './display-name'
import { themeSchema } from './theme'

// ─── PATCH /api/profile ───────────────────────────────────────────────────
// Yalnızca sunucu (`apps/web/app/api/profile/route.ts`) tüketir — istemci
// bileşenleri (`EditNameForm.tsx`) alan uzunluğu sabitlerini (`DISPLAY_NAME_
// MAX/MIN`) kullanır ama bu şemayı hiç import etmez. Bilerek `./profile-
// response`'tan AYRI dosyada: aksi hâlde `/profil`'in gerçekten ihtiyaç
// duyduğu tek profil şemasıyla (`profileResponseSchema`) aynı modülde kalıp
// hiç kullanılmasa bile istemciye taşınırdı (modül-granülerlik tree-shaking).
/**
 * Kısmi güncelleme: yalnız ad ve tema değiştirilebilir (KK-082/083).
 * `theme: z.optional(themeSchema)` — METOT DEĞİL fonksiyon çağrısı: `themeSchema`
 * artık `zod/mini` (bkz. `./theme.ts`), mini şemalarda `.optional()` METODU
 * YOK (yalnız klasik `zod`'un sarmalayıcı FONKSİYONU `z.optional(x)` iki
 * paketin şemalarını da kabul ediyor — doğrulandı). `displayNameSchema` hâlâ
 * klasik olduğu için `.optional()` metodu üzerinde çalışmaya devam ediyor.
 */
export const profileUpdateBodySchema = z.strictObject({
  name: displayNameSchema.optional(),
  theme: z.optional(themeSchema),
})
export type ProfileUpdateBody = z.infer<typeof profileUpdateBodySchema>
