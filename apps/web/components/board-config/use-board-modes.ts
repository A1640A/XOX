'use client'

import { useMemo } from 'react'
import { BOARD_MODES, type BoardMode } from '@xox/game-core'

/**
 * ROLLOUT-BOARD-001 · ADR-0018 §3 — `BoardConfigPicker`'ın (ve her gelecekteki
 * tüketicinin) sunacağı boyut/K seçenek listesinin TEK türetme noktası.
 *
 * Bu dosya `apps/web/lib/game/enabled-sizes.ts`'i (kill switch, ortam
 * değişkeni okuyan TEK yer, API-BOARD-001) KENDİSİ İMPORT ETMEZ — o modül
 * yalnız SUNUCUDA anlamlıdır (`process.env`). `enabledSizes` çağırana
 * ("bugün sunulan boyutlar") bir Server Component zincirinden (`app/page.tsx`
 * → `getEnabledBoardSizes()`) ÇÖZÜLMÜŞ olarak gelir; bu hook YENİ bir ortam
 * okuması YAPMAZ, yalnız `BOARD_MODES`'u (kural, `game-core`, donmuş) o
 * listeye göre filtreler.
 *
 * `POST /api/rooms`'un `isBoardSizeEnabled` doğrulaması (API-BOARD-001) ve bu
 * hook AYNI kaynaktan (`getEnabledBoardSizes()`'in çağırana ürettiği liste)
 * beslenir — İKİNCİ BİR KOPYA (kendi `enabledSizes` hesaplaması, kendi filtre
 * mantığı) burada YAZILMAZ. Kapalı bir boyut bu hook'un döndürdüğü listede
 * HİÇBİR ZAMAN görünmez; bir tüketici yalnız bu listeyi render ederse kapalı
 * boyut istemcide hiç var olmaz (sessizce seçilip sonra düşürülmez).
 *
 * NOT: `BoardConfigPicker.tsx` bugün bu filtrelemeyi KENDİ İÇİNDE satır içi
 * yapıyor (`BOARD_MODES.filter(...)`, UI-CFG-001) — bu kart o dosyaya
 * DOKUNMUYOR (çakışma kümesi dışı, board-config ağacının geri kalanı donuk).
 * Aynı mantığın tek noktadan (bu hook) tüketilmesi bir sonraki temizlik
 * kartının işidir; iki yerdeki mantık ŞU AN bit bit AYNIDIR (bkz. rapor).
 */
export function useBoardModes(enabledSizes: readonly number[]): readonly BoardMode[] {
  return useMemo(
    () => BOARD_MODES.filter((mode) => enabledSizes.includes(mode.size)),
    [enabledSizes],
  )
}
