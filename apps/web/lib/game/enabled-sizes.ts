import { BOARD_MODES } from '@xox/game-core'
import { logWarn } from '../log'

/**
 * Kill switch (ADR-0018 §3, geri alma kademe 1). Bu dosya `game-core`'a,
 * `shared`'a ya da `db`'ye GİRMEZ — kural motoru bir ortam değişkenine
 * bakmaz, `BOARD_MODES` daralmaz. Bu ayrım BİLİNÇLİDİR: `BOARD_MODES` bir
 * KURALDIR (hangi kombinasyonlar geçerli, donmuş), bu dosyanın okuduğu
 * `XOX_ENABLED_BOARD_SIZES` bir OPERASYONDUR (bugün hangileri sunuluyor,
 * redeploy ile değişir).
 *
 * İKİ tüketicisi vardır ve İKİSİ DE bu fonksiyonu çağırır: `POST /api/rooms`
 * doğrulaması ve seçicinin (`use-board-modes.ts`) seçenek listesi — ikinci
 * bir kopya YAZILMAZ (sabitin regex kopyası gotcha'sıyla aynı sınıf).
 *
 * **Geriye dönük daraltma yapmaz**: bu modül yalnız YENİ oda kurma kapısını
 * etkiler. Kapatılan bir boyutla ÖNCEDEN kurulmuş odalar `resolveBoardConfig`
 * üzerinden okunmaya devam eder — o modül bu dosyayı hiç import ETMEZ.
 */
const ENV_VAR = 'XOX_ENABLED_BOARD_SIZES'

/** `BOARD_MODES`'un izin verdiği kenar uzunlukları — kural katmanından TEK OKUMA. */
const KNOWN_SIZES: readonly number[] = BOARD_MODES.map((mode) => mode.size)

function parseKnownSize(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number.parseInt(trimmed, 10)
  return Number.isInteger(value) && KNOWN_SIZES.includes(value) ? value : null
}

/**
 * Bugün sunulan tahta boyutları. Ayarlanmamışsa (ya da boşsa) varsayılan
 * TÜM boyutlardır — ADR-0018: "kapalı kalma riski yok".
 *
 * Ayrıştırma İKİ farklı bozukluk sınıfını AYRI ele alır (gürültülü/sessiz
 * ayrımı, bkz. gotchas.md örüntü 2 nüansı):
 * - **Kısmen** bozuk (`"3,7"`) → bilinmeyen parça sessizce ATLANIR, geçerli
 *   kalanlar (`[3]`) uygulanır. Bu, kill switch'in NORMAL kullanımıdır
 *   (`XOX_ENABLED_BOARD_SIZES=3` gibi bilinçli bir daraltma).
 * - **Tamamen** anlaşılmaz (`"abc"`, tek bir geçerli boyut bile yok) →
 *   `logWarn` ile GÜRÜLTÜLÜ biçimde tüm boyutlara düşülür. Sessiz düşseydi
 *   bir yazım hatası (ör. `XOX_ENABLED_BOARD_SIZES=3x`) tüm oda kurmayı
 *   fark edilmeden kilitlerdi — bu, `resolveBoardConfig`'in "bozuksa
 *   {3,3} + logError" disipliniyle aynı sınıf.
 */
export function getEnabledBoardSizes(): readonly number[] {
  const raw = process.env[ENV_VAR]
  if (raw === undefined || raw.trim() === '') return KNOWN_SIZES

  const parsed = raw
    .split(',')
    .map(parseKnownSize)
    .filter((size): size is number => size !== null)
  const unique = [...new Set(parsed)]

  if (unique.length === 0) {
    logWarn(`${ENV_VAR} çözümlenemedi, tüm tahta boyutları açık varsayılana düşüldü`, { raw })
    return KNOWN_SIZES
  }
  return unique
}

/** `POST /api/rooms` ve seçicinin ortak sorgusu — bkz. dosya başlığı. */
export function isBoardSizeEnabled(size: number): boolean {
  return getEnabledBoardSizes().includes(size)
}
