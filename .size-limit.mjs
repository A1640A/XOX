import { readFileSync } from 'node:fs'

// Next.js 16 `next build` "First Load JS" konsol tablosunu KALDIRDI ("bu metrikler
// RSC mimarilerinde yanıltıcıydı" — next/dist/docs/.../version-16.md, "Performance
// Improvements" bölümü). Yerine resmi bir diagnostic dosyası üretiyor: rota başına
// gerçek ilk-yükleme JS parça listesi (`next build`in kendisi üretir, ekstra kod
// gerektirmez: `.next/diagnostics/route-bundle-stats.json`). Bu dosyayı okuyup ROTA
// BAŞINA bütçe kuruyoruz — tek bir glob'un TÜM rotaların JS'ini tek bütçede
// toplamasının (PERF-002) önüne geçmek için.
//
// Turbopack çıktısı dosya adlarını içerik-hash'i ile üretiyor (rota/rol bilgisi
// TAŞIMIYOR — `apps/web/.next/static/chunks/*.js` düz, hash'li bir dizin; hiçbir
// dosya adı deseni belirli bir rotaya sabit bağlanamaz). Bu yüzden dosya adlarını
// SABİT KODLAMIYORUZ: her `size-limit` çalışmasında `pnpm build`'in az önce ürettiği
// manifesti TAZE okuyoruz. Manifest yoksa (build hiç koşmadıysa) tek genel bütçeye
// düşüyoruz — bu düşüş CI'da hiç YAŞANMAMALI çünkü CI her zaman `pnpm build`'den
// SONRA `size-limit` çalıştırıyor (.github/workflows/ci.yml, `build` işi); yaşanırsa
// bu bir kapı arızasıdır, "geçti" sayılmamalı.
const distDir = 'apps/web/.next'
const statsPath = `${distDir}/diagnostics/route-bundle-stats.json`

// Ölçüm 2026-08-25 (bkz. docs/board/reports/PERF-002.md), YENİDEN ÖLÇÜLDÜ
// 2026-08-26 PERF-003 SONRASI (bkz. docs/board/reports/PERF-003.md) —
// `size-limit`'in KENDİ gzip hesabıyla:
//   /oda/[kod]        214.79 kB gzip  ← ölçülen en ağır rota (DEĞİŞMEDİ, kasıtlı —
//                                      aşağıya bkz.)
//   /                 213.22 kB gzip
//   /kayit            212.88 kB gzip
//   /oda/katil        212.83 kB gzip
//   /giris            212.76 kB gzip
//   /oyna/bilgisayar  143.75 kB gzip  ← PERF-003 ÖNCESİ 213.61 kB idi (bkz. eski
//                                      yorum altta): `next/dynamic` (`ssr:false`)
//                                      ile `chooseMove`/`bestMove`'u (ve tüm
//                                      `ComputerGameInner` alt ağacını) eşzamansız
//                                      çekmek bu rotayı "heavy" gruptan "light"
//                                      gruba TAŞIDI — −69.86 kB gzip, ölçüldü.
//   /profil           142.51 kB gzip
//   /_not-found       142.09 kB gzip
//
// PERF-003 BULGUSU (rapora bkz. — ÖNEMLİ, CORE-AI-001 için okunmalı): "heavy"
// grubun (/, /giris, /kayit, /oda/[kod], /oda/katil) sayısı KASITLI OLARAK
// DEĞİŞMEDİ. `chooseMove`/`bestMove`'un `apps/web/components/computer/**`
// (bu kartın çakışma kümesi) üzerinden statik/dinamik hangi yoldan alındığının
// bu beş rota için HİÇBİR ETKİSİ YOK — onların sızıntısı ayrı, bu kartın
// dışındaki bir zincirden geliyor: `packages/shared/src/room-client.ts`
// (kapsam dışı) `@xox/game-core` ANA barrel'ını (`evaluateStatus`,
// `boardFromCells`) statik olarak içe aktarıyor; `packages/game-core/src/
// index.ts` (B1 `CORE-CFG-001`'e kadar dokunulamaz) `ai.ts`'yi KOŞULSUZ yeniden
// dışa verdiği için bu, TÜM `@xox/game-core`'u (minimax dahil) `@xox/shared`
// barrel'ıyla (`export *`, o da kapsam dışı) TEK atomik varlığa katlıyor;
// `TESTID` gibi küçücük bir şey için `@xox/shared`'a dokunan HER rota (/, /giris,
// /kayit) bu varlığın TAMAMINI da indiriyor. Bu yüzden heavy bütçe BİLEREK
// DÜŞÜRÜLMEDİ — sızıntı bu beş rota için kalıcı ve `CORE-AI-001` onlara da
// büyüyerek yansıyacak (yalnız `/oyna/bilgisayar`'ınki değil).
//
// Bütçe = ölçülen en ağır değer + ~%9-10 büyüme payı (mevcut değere göre DEĞİL, bu
// grubun en ağır ÖLÇÜLMÜŞ üyesine göre türetildi — "şu an ne ise o" değil):
//   heavy: 214.79 × ~1.095 ≈ 235 kB (DEĞİŞMEDİ — yukarıdaki gerekçe)
//   light: 143.75 × ~1.10  ≈ 158 kB (143.75 → 157.4, `/oyna/bilgisayar`'ın YENİ
//                                     en ağır üye olması payı biraz büyüttü)
const HEAVY_LIMIT = '235 kB'
const LIGHT_LIMIT = '158 kB'
// PERF-003: `/oyna/bilgisayar` artık `/profil`/`/_not-found` ile AYNI hafif
// grupta — `next/dynamic` sınırı sayesinde minimax'ın ilk yüklemede payı YOK.
const LIGHT_ROUTES = new Set(['/profil', '/_not-found', '/oyna/bilgisayar'])

function limitFor(route) {
  return LIGHT_ROUTES.has(route) ? LIGHT_LIMIT : HEAVY_LIMIT
}

// `@size-limit/time` her check için ayrı bir headless Chrome örneği açıyor. 7 rota
// check'i PARALEL çalışınca (size-limit'in kendi `Promise.all`'ı) eşzamanlı Chrome
// örnekleri birbirini navigasyon zaman aşımına düşürüyor (yerelde doğrulandı:
// `TimeoutError: Navigation timeout of 20000ms exceeded`). Bu kart yalnız BOYUT
// bütçesini onarıyor — "running time" hiçbir kabul kriterinde istenmiyor — bu yüzden
// zaman ölçümünü check başına kapatıp gereksiz bir kırılganlık kaynağını (ve CI
// süresini ~7x Chrome açılışı kadar) ortadan kaldırıyoruz. Bkz. rapor.
const disablePlugins = ['@size-limit/time']

let checks
try {
  const rows = JSON.parse(readFileSync(statsPath, 'utf8'))
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('empty manifest')
  checks = rows.map((row) => ({
    name: `web — ${row.route}`,
    path: row.firstLoadChunkPaths.map((p) => `apps/web/${p}`),
    limit: limitFor(row.route),
    gzip: true,
    disablePlugins,
  }))
} catch {
  checks = [
    {
      name: 'web — ilk yükleme JS (rota manifesti yok, build önce koşulmalı — KAPI ARIZASI)',
      path: `${distDir}/static/chunks/**/*.js`,
      limit: HEAVY_LIMIT,
      gzip: true,
      disablePlugins,
    },
  ]
}

export default checks
