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
 * `BoardConfigPicker.tsx` bu hook'u KULLANIR — orada ikinci bir
 * `BOARD_MODES.filter(...)` YOKTUR. (Kart yazıldığında vardı ve bu dosya
 * çakışma kümesi dışındaydı; lead merge öncesi birleştirdi.) Kapalı boyut
 * listesinin tek türetme noktası burasıdır; ikinci bir kopya açma.
 */
export function useBoardModes(enabledSizes: readonly number[]): readonly BoardMode[] {
  return useMemo(
    () => BOARD_MODES.filter((mode) => enabledSizes.includes(mode.size)),
    [enabledSizes],
  )
}
