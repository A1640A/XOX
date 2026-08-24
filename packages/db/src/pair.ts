import type { Player } from '@xox/shared'

/**
 * `GameDoc.pairKey`'in üretim fonksiyonu — sıralı `${a}|${b}` (tasarım §3.3).
 * KK-113 (aynı çiftin 24 saatteki puanlı oyun sayımı) ve KK-126 buna dayanır;
 * sıra oyuncuların koltuğuna göre değişmemeli, aksi hâlde aynı çift için iki
 * farklı `pairKey` üretilip sayım bölünür.
 *
 * Kök seviyede durur (rooms/ İÇİNDE DEĞİL): hem `rooms/join.ts` hem
 * `models/game.ts`'in `pre('validate')` hook'u bunu import eder. İkisi
 * arasında bir bağımlılık kurulsaydı (`rooms -> models -> rooms`) döngü
 * oluşurdu — `import-x/no-cycle` bunu zaten reddeder.
 */
export function buildPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * `GameDoc.participants` — `[X.userId, O.userId]`, çok anahtarlı indeks için
 * türetilmiş (tasarım §3.3/§3.6). Sıra korunur: koltuk bilgisini taşımak
 * `KK-116/117`'nin `participants` eşitlik sorgusu için önemli değildir ama
 * `Game.pre('validate')`'in eşitlik kontrolü elemanların SIRASINA da bakar.
 */
export function deriveParticipants(players: Record<Player, string>): string[] {
  return [players.X, players.O]
}
