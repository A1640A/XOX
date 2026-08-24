import { TESTID, type ErrorCode } from '@xox/shared'
import { tr } from '@/messages/tr'

export interface ErrorBannerProps {
  readonly code: ErrorCode | null
}

/**
 * Görünür hata yüzeyi (spec §2.0). Metin BURADA gömülü DEĞİLDİR — `code` ile
 * `tr.errors`'a bakılır, çağıran hiçbir Türkçe string geçmez. `code === null`
 * iken hiçbir şey render etmez (yani "aktif hata yok" durumunun görsel karşılığı
 * DOM'da yoktur; ekran okuyucular sessiz kalır, gürültü üretmez).
 *
 * Savunma katmanı (inceleme MAJOR #6): `code` prop'u tip düzeyinde `ErrorCode`
 * olsa da, çağıran taraf sunucudan gelen HAM bir string'i doğrulamadan
 * geçirirse (ör. bir `as` cast'iyle) çalışma zamanında `tr.errors`'ta
 * KARŞILIĞI OLMAYAN bir değer buraya sızabilir — `tr.errors[code]` o zaman
 * `undefined` döner ve `data-testid="hata-mesaji"` BOŞ render edilirdi:
 * kullanıcı sessiz bir şerit görür, ekran okuyucu hiçbir şey duyurmaz, E2E'nin
 * `getByTestId('hata-mesaji')` iddiası boş elemana karşı yine de GEÇER. Bu
 * yüzden metin `code in tr.errors` ile doğrulanır; eşleşmezse `SERVER_ERROR`
 * metnine düşülür — asla boş render edilmez.
 */
export function ErrorBanner({ code }: ErrorBannerProps): React.ReactElement | null {
  if (code === null) return null

  const message = code in tr.errors ? tr.errors[code] : tr.errors.SERVER_ERROR

  return (
    <p role="alert" data-testid={TESTID.hataMesaji} data-kod={code}>
      {message}
    </p>
  )
}
