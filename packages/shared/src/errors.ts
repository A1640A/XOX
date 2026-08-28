import * as z from 'zod/mini'

/**
 * Uygulama genelindeki tek hata kodu birliği (tasarım §2.3).
 *
 * `apps/web/messages/tr.ts` ve `apps/mobile/messages/tr.ts` içindeki `errors`
 * anahtar kümesi bu listeyle **birebir** olmak zorundadır; iki taraf da
 * `message-keys.ts` üzerinden bu enum'a karşı doğrulanır. `hata-mesaji`
 * bileşeni `data-kod` niteliğine bu kodu yazar, metni tabloya bakarak seçer —
 * bileşende gömülü metin yoktur.
 *
 * **PERF-005:** `zod` yerine `zod/mini` (v4'ün resmi ağaç-sallanabilir API'si,
 * `z.enum`/`z.infer`/`.safeParse`/`.options` klasikle BİREBİR aynı davranır —
 * `packages/shared/src/rest-contract/error-response.ts`'in yorumuna bkz).
 * Bu dosya `ws-protocol.ts` gibi klasik `zod` kullanan modüllerin İÇİNE
 * (`z.object({..., code: errorCodeSchema})`) sorunsuz İÇ İÇE geçer — zod v4
 * mini/klasik aynı `@zod/core` şema nesnelerini üretir, doğrulandı (bkz. rapor).
 */
export const errorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'EMAIL_TAKEN',
  'WEAK_PASSWORD',
  'INVALID_EMAIL',
  'INVALID_NAME',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'INVALID_CODE',
  'CODE_GENERATION_FAILED',
  'NOT_YOUR_TURN',
  'CELL_OCCUPIED',
  'GAME_OVER',
  'INVALID_MESSAGE',
  'SESSION_TAKEOVER',
  'REMATCH_EXPIRED',
  'RATE_LIMITED',
  'NOT_FRIENDS_ELIGIBLE',
  'SERVER_ERROR',
  'NETWORK',
  'INVALID_BOARD_CONFIG',
])

export type ErrorCode = z.infer<typeof errorCodeSchema>

/** Enum'un dizi biçimi — anahtar kümesi karşılaştırmaları için. */
export const ERROR_CODES: readonly ErrorCode[] = errorCodeSchema.options
