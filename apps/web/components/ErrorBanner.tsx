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
 */
export function ErrorBanner({ code }: ErrorBannerProps): React.ReactElement | null {
  if (code === null) return null

  return (
    <p role="alert" data-testid={TESTID.hataMesaji} data-kod={code}>
      {tr.errors[code]}
    </p>
  )
}
