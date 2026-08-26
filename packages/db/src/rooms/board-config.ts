import { DEFAULT_BOARD_CONFIG, parseBoardConfig } from '@xox/game-core'
import type { BoardConfig } from '@xox/game-core'
import type { RoomDoc } from '../models/room'

/**
 * Okuma tarafının TEK kapısı (ADR-0014 §2, KK-B31/B32). `RoomDoc.size`/
 * `winLength` OPSİYONELDİR (kural 1) — bu fonksiyonun DIŞINDA hiçbir tüketici
 * varsayılana elle nokta-koalesans ile düşmez; o satır sabitin ikinci kopyası
 * olurdu (gotcha: "sabitin kopyası = sessiz sapma"). Doğrulamayı KENDİSİ
 * yapmaz, `game-core`'un `parseBoardConfig`'ine delege eder (kural 4).
 *
 * - İki alan da yoksa → `DEFAULT_BOARD_CONFIG`, SESSİZCE (KK-B31). Bu meşru
 *   eski şekildir (TTL'den önceki oda), anormallik değildir.
 * - Alan var ama `parseBoardConfig` reddediyorsa → `console.error` + varsayılan
 *   (KK-B32). SESSİZ DÜŞÜŞ YASAK: bozuk veri görünmez kalmamalı.
 */
export function resolveBoardConfig(doc: Pick<RoomDoc, 'size' | 'winLength'>): BoardConfig {
  if (doc.size === undefined && doc.winLength === undefined) {
    return DEFAULT_BOARD_CONFIG
  }

  const parsed = parseBoardConfig({ size: doc.size, winLength: doc.winLength })
  if (parsed.ok) return parsed.config

  // packages/db'nin logError sarmalayıcısı yok; apps/web'in aksine burada ham
  // `console.error` izinlidir (eslint.config.mjs no-console allow listesi 'error'i kapsar).
  console.error('[resolveBoardConfig] rooms.size/winLength bozuk, {3,3} varsayılana düşüldü', {
    size: doc.size,
    winLength: doc.winLength,
    reason: parsed.reason,
  })
  return DEFAULT_BOARD_CONFIG
}
