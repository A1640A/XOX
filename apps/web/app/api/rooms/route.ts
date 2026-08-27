import { connectDb, createRoom } from '@xox/db'
import { parseBoardConfig } from '@xox/game-core'
import {
  roomCreateBodySchema,
  roomCreateResponseSchema,
  type ErrorCode,
  type ErrorResponse,
} from '@xox/shared'
import { resolveIdentity } from '@/lib/auth/identity'
import { isBoardSizeEnabled } from '@/lib/game/enabled-sizes'
import { logError } from '@/lib/log'

export const dynamic = 'force-dynamic'

function errorJson(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ code, message } satisfies ErrorResponse, { status })
}

/**
 * Gövde OPSİYONELDİR (KK-B14/B15, ADR-0015 §2). `req.json()` boş gövdede
 * FIRLATIR (`SyntaxError`) — bugünkü istemcilerin TAMAMI gövdesiz POST
 * atıyor; bu satır try/catch'siz yazılırsa BÜTÜN oda kurma yolu kırılır.
 * Yakalanan her hata (boş gövde, bozuk JSON) aynı şekilde `{}`'a düşer;
 * `roomCreateBodySchema` onu `.partial()` olduğu için kabul eder ve
 * `parseBoardConfig(undefined)` zaten `DEFAULT_BOARD_CONFIG`'e (3×3) düşer —
 * davranış bit düzeyinde korunur.
 */
async function readBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return {}
  }
}

/**
 * `— → waiting` (tasarım §4/§7, KK-030/031/035/036). İnce route: kimliği
 * çöz, gövdeyi doğrula, otoriter geçişi çağır, sonucu HTTP'ye çevir.
 * **Kural yok, koşullu yazma yok** — tamamı `@xox/db`'nin `createRoom`'unda
 * (DB-002) ve `@xox/game-core`'un `parseBoardConfig`'inde (kural 4).
 *
 * `resolveIdentity` `allowTicket` GEÇMEDEN çağrılır (varsayılan `false`):
 * bilet yalnız WS upgrade'inde geçerlidir, burada değil.
 *
 * Doğrulama zinciri (API-BOARD-001, spec §5.1): `roomCreateBodySchema`
 * (şekil) → `parseBoardConfig` (kombinasyon kuralı, `game-core`'da tek
 * kaynak) → `isBoardSizeEnabled` (ADR-0018 operasyonel kill switch — kural
 * DEĞİL, `apps/web`'e özel). Üçü de reddederse **400 `INVALID_BOARD_CONFIG`**,
 * oda **oluşturulmaz** — kapalı bir boyut istenirse sessizce 3×3'e
 * düşürülmez (kullanıcı 11×11 istedi, nedenini bilmeden 3×3 almak en kötü
 * hata sınıfıdır).
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const identity = await resolveIdentity(req)
    if (identity === null) {
      return errorJson('UNAUTHENTICATED', 'Oturum bulunamadı.', 401)
    }

    const bodyParsed = roomCreateBodySchema.safeParse(await readBody(req))
    if (!bodyParsed.success) {
      return errorJson('INVALID_BOARD_CONFIG', 'Tahta boyutu/kazanma uzunluğu geçersiz.', 400)
    }

    const configParsed = parseBoardConfig(bodyParsed.data)
    if (!configParsed.ok) {
      return errorJson('INVALID_BOARD_CONFIG', 'Tahta boyutu/kazanma uzunluğu geçersiz.', 400)
    }

    if (!isBoardSizeEnabled(configParsed.config.size)) {
      return errorJson('INVALID_BOARD_CONFIG', 'Bu tahta boyutu şu anda sunulmuyor.', 400)
    }

    await connectDb()
    const result = await createRoom(
      { userId: identity.userId, name: identity.name },
      configParsed.config,
    )

    if (!result.ok) {
      if (result.code === 'CODE_GENERATION_FAILED') {
        return errorJson(
          'CODE_GENERATION_FAILED',
          'Oda kodu üretilemedi, lütfen tekrar deneyin.',
          503,
        )
      }
      // Beklenmeyen bir dal (`createRoom`'un savunmacı SERVER_ERROR'ı gibi) —
      // sürücü ayrıntısı istemciye sızdırılmaz.
      logError('POST /api/rooms beklenmeyen sonuç kodu', { userId: identity.userId }, result.code)
      return errorJson('SERVER_ERROR', 'Oda oluşturulamadı.', 500)
    }

    const body = roomCreateResponseSchema.parse({ code: result.room.code })
    return Response.json(body, { status: 201 })
  } catch (error) {
    logError('POST /api/rooms hata', {}, error)
    return errorJson('SERVER_ERROR', 'Oda oluşturulamadı.', 500)
  }
}
