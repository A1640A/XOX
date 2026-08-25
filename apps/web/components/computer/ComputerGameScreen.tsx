'use client'

import dynamic from 'next/dynamic'

/**
 * `/oyna/bilgisayar` ekranı — tamamen istemci tarafı (KK-027, kart §oyna/bilgisayar).
 * Kural mantığı YOKTUR: hamle geçerliliği, kazanan tespiti ve bilgisayar
 * hamlesi `use-computer-game.ts` üzerinden `game-engine.ts`'e, oradan da
 * `@xox/game-core`'a delege edilir (KK-022). Sayfa hiçbir ağ isteği yapmaz —
 * `@xox/db`, `use-room`/`ws-client` importu yok, `fetch` çağrısı yok
 * (`network-graph.test.ts` bunu modül grafiğinde ALLOWLIST ile doğrular).
 *
 * PERF-003: gövde `ComputerGameInner`'a taşındı ve BİLEREK `next/dynamic`
 * (`ssr: false`) ile eşzamansız çekiliyor — bu sayfanın kendi ilk yüklemesi
 * DEĞİŞMEZ (tek içerik zaten bu), ama bu SINIR, arama kodunu (`@xox/game-core/ai`)
 * Turbopack'in üretim derlemesinde `/`, `/giris`, `/kayit`, `/oda/[kod]` gibi
 * başka rotalarla PAYLAŞILAN bir varlığa katlanmaktan çıkarıp bu rotaya özel,
 * yalnız burada istenen bir modül grubuna taşıyor (ölçüldü, bkz. rapor).
 * `ssr: false`: sayfa zaten tamamen istemci tarafı (KK-027), sunucuda
 * render edilecek bir şey yok — server-side hydration uyumsuzluğu riski de yok.
 */
const ComputerGameInner = dynamic(
  () => import('./ComputerGameInner').then((mod) => mod.ComputerGameInner),
  { ssr: false },
)

export function ComputerGameScreen(): React.ReactElement {
  return <ComputerGameInner />
}
