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

// Ölçüm 2026-08-25 (bkz. docs/board/reports/PERF-002.md) — `size-limit`'in KENDİ
// gzip hesabıyla (her dosya ayrı gzip'lenip toplanıyor; bu yüzden ham dosyaları tek
// akışta birleştirip gzip'leyen kaba doğrulamadan ~9 kB daha yüksek çıkıyor, rapora
// bkz.):
//   /oda/[kod]        214.65 kB gzip  ← ölçülen en ağır rota
//   /oyna/bilgisayar  213.61 kB gzip  (minimax `chooseMove`/`bestMove` burada davet
//                                      ediliyor ama kendi payı ~5 kB ham; asıl ağırlık
//                                      "heavy" grubun PAYLAŞTIĞI ortak istemci paketi)
//   /                 212.88 kB gzip
//   /kayit            212.75 kB gzip
//   /giris            212.63 kB gzip
//   /profil           142.39 kB gzip  ← ayrı, daha hafif paylaşılan JS seti
//   /_not-found       141.96 kB gzip
// Bütçe = ölçülen en ağır değer + ~%9-10 büyüme payı (mevcut değere göre DEĞİL, bu
// grubun en ağır ÖLÇÜLMÜŞ üyesine göre türetildi — "şu an ne ise o" değil):
//   heavy: 214.65 × ~1.095 ≈ 235 kB · light: 142.39 × ~1.09 ≈ 155 kB
const HEAVY_LIMIT = '235 kB'
const LIGHT_LIMIT = '155 kB'
const LIGHT_ROUTES = new Set(['/profil', '/_not-found'])

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
