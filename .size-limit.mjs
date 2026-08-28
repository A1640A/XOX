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
// PERF-003: `/oyna/bilgisayar` `next/dynamic` sınırı sayesinde hafif grupta —
// minimax'ın ilk yüklemede payı YOK.
//
// ⚠️ 2026-08-26, W2-02 sonrası: `/profil` hafif gruptan ÇIKARILDI (142.51 → 216.54 kB).
//
// 🔴 DÜZELTME 2026-08-27 (PERF-004) — AŞAĞIDAKİ ESKİ GEREKÇE YANLIŞTI.
//
// Bu yorum, `PERF-003`'ün raporu ve `PERF-004`'ün kart gerekçesi ağırlığın kaynağı olarak
// şu zinciri gösteriyordu:
//     components/profile → `@xox/shared`   (DISPLAY_NAME_MAX, ErrorCode — MEŞRU)
//     shared/index.ts    → `export * from './room-client'`
//     room-client.ts     → `@xox/game-core` (ana barrel) → `ai.ts` ⟹ minimax
// Zincirin her halkası GERÇEKTİ. Ama kimse **parça düzeyinde** ölçmemişti.
//
// Ölçüldüğünde (PERF-004, ilk kez): ağır rotalara ÖZEL parça 275.6 kB ham / **68.7 kB
// gzip** ve içinde **485 `zod` izi, SIFIR minimax izi**. Ağır (216 kB) ile hafif (146 kB)
// arasındaki ~70 kB farkın TAMAMI **zod** — `@xox/shared`'ın barrel'ı zod şemalarını
// istemci paketine sokuyor. Zinciri kırmak için iki değişiklik denendi, toplam kazanç
// **~4 kB**; teori doğru olsaydı ~70 kB olmalıydı.
//
// DERS: bir zincirin VAR OLDUĞUNU doğrulamak, o zincirin maliyetin KAYNAĞI olduğunu
// kanıtlamaz. Sızıntıyı düzeltmeden önce parçayı aç ve içinde ne olduğuna bak.
//
// "Hafif" sınıflandırması bir HEDEF değil, BETİMLEME idi. HEAVY_LIMIT'e (235 kB)
// DOKUNULMADI.
//
// ✅ PERF-005 (2026-08-28) — zod istemci yolundan AYRILDI, ama `/profil` hafif GRUBA
// DÖNMEDİ. Bulgu PERF-004'ün varsayımını YİNE düzeltti — bu sefer yönü doğruydu (zod),
// ama "485 iz = 20+ kullanılmayan şema tanımı" teorisi de eksikti.
//
// Yapılan: `packages/shared/src/rest-contract.ts` uç nokta başına ayrı dosyalara
// bölündü (`rest-contract/*.ts`, her biri kendi şemasını taşır) + `package.json`'a
// `"sideEffects": false` eklendi. Bu, bir rotanın hiç zod şeması KULLANMADIĞI
// durumda TÜM zod grafiğinin (`primitives`/`errors`/`game-status`/`rest-contract`/
// `ws-protocol`) modül-granülerliğinde tamamen düşmesini SAĞLADI — `/giris` (hiç
// runtime şeması kullanmıyor, yalnız `ErrorCode` TİPİ) 216 kB'den **146.65 kB**'ye
// düştü (−70 kB, TAM olarak PERF-004'ün beklediği kazanç, ama başka bir rotada).
//
// AMA `/profil` yalnız ~3-5 kB kazandı çünkü `ProfileContent.tsx` (dokunulamaz
// tüketici dosyası) GERÇEKTEN `errorResponseSchema`+`profileResponseSchema`'yı
// runtime'da kullanıyor (`.safeParse()` ile sunucu yanıtını doğruluyor). Parça
// içeriği incelendiğinde (`485 zod izi` — PERF-004'ünkiyle AYNI SAYI) asıl maliyetin
// "kullanılmayan şema tanımları" değil, **klasik `zod`'un kendi çekirdeğinin taban
// ağırlığı** (~60-65 kB gzip, HANGİ şemanın tanımlı olduğundan bağımsız — `z.object()`
// tek başına tüm `ZodType` hiyerarşisini sürüklüyor) olduğu ortaya çıktı. Dosya
// bölme bunu ÇÖZEMEZ; zod'un KENDİSİ ağaç-sallanabilir değil.
//
// Çözüm: yalnız `/profil`'in gerçekten kullandığı zincir (`errors.ts` →
// `rest-contract/error-response.ts` → `rest-contract/profile-response.ts` →
// `stats.ts`/`theme.ts`) `zod` yerine **`zod/mini`**'ye (v4'ün resmi ağaç-sallanabilir
// API'si) taşındı — `.safeParse()`/`.options`/`z.infer` klasikle BİREBİR aynı davranır
// ve mini şemalar klasik `z.object()`'in İÇİNE sorunsuz iç içe geçer (doğrulandı,
// `ws-protocol.ts` klasik kalmaya devam ediyor ve `errorCodeSchema`'yı hâlâ kendi
// `z.discriminatedUnion`'ının içinde kullanıyor). `profileUpdateBodySchema` (yalnız
// SUNUCU route'unun tükettiği PATCH şeması) `profileResponseSchema`'dan AYRI dosyaya
// (`profile-update.ts`) taşındı — aksi hâlde istemci hiç kullanmasa bile aynı modülde
// kalıp taşınırdı.
//
// Ölçülen SONUÇ (`pnpm --filter @xox/web build && pnpm exec size-limit`):
//   /profil    217.16 → **168.36 kB** (−48.8 kB) — hafif bütçeye (158 kB) hâlâ 10 kB UZAK
//   /kayit     216.42 → **167.18 kB** (−49.2 kB) — aynı sebep (KayitForm `errorCodeSchema` kullanıyor)
//   /giris     216.30 → **146.65 kB** (−69.7 kB) — HİÇ zod kullanmıyor, tamamen düştü
//   /oda/[kod] 222.82 → 223.87 kB (+1.05 kB)     — heavy bütçenin (235) rahat içinde;
//                                                  `zod/mini` + klasik `zod`'un AYNI ANDA
//                                                  bulunması küçük bir çakışma payı ekliyor
//   /,/oda-katil/arkadaslar: küçük net iyileşme (~1-2 kB)
//
// `/profil` (ve `/kayit`) 158 kB'ye NEDEN ULAŞAMIYOR: kalan ~10-23 kB `zod/mini`'nin
// KENDİ çekirdek taban maliyeti (obje/dize/sayı/enum doğrulama motoru + `safeParse`
// altyapısı) — bu, TANIMLANAN şema sayısından bağımsız bir TABAN, daha fazla dosya
// bölme ya da tree-shaking ayarıyla küçültülemez. Gerçek kapanış iki yoldan biri:
//   (a) `components/profile/**` (ve `KayitForm.tsx`) istemci tarafı yanıt doğrulamasını
//       (`errorResponseSchema`/`errorCodeSchema.safeParse`) TAMAMEN kaldırır — sunucu
//       zaten otoriter (KK-003), istemci kendi yanıtını doğrulamak yerine TS tipine
//       güvenebilir. Bu, PERF-005'in çakışma kümesi DIŞINDA bir tüketici dosyası
//       değişikliği ister.
//   (b) Ya da bu iki rota `HEAVY_LIMIT`'in altında ama `LIGHT_LIMIT`'in üstünde YENİ
//       bir "medium" katmana taşınır (dürüst bir üçüncü bütçe — bkz. `docs/board/
//       reports/PERF-005.md` önerisi) — bütçe GERÇEĞİ ölçmeye devam eder, `/profil`
//       "hafif" ETİKETİNİ zorla almaz.
// PERF-005 bilerek (a)'yı YAPMADI (dokunma listesi `components/profile/**`'i açıkça
// yasaklıyor) ve (b)'yi tek başına KARARLAŞTIRMADI (bütçe politikası, paralel kartları
// etkileyebilir) — ikisi de lead onayı bekliyor, rapora bkz.
const LIGHT_ROUTES = new Set(['/_not-found', '/oyna/bilgisayar'])

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
