````yaml
task: PERF-008
status: done
summary: >
  W2-05'in bulduğu boşluk kapatıldı: `resolveTheme()`'in DB dalını tetikleyen tek
  yazıcı (`ProfileContent.tsx`, istemci, yalnız `/profil`de çalışıyordu) artık tek
  yazıcı DEĞİL. `proxy.ts` — Auth.js `auth()`'u KENDİ middleware'iyle sararak
  (`auth((req) => ...)`, next-auth'un belgelenmiş kalıbı) — 6 korunan rotanın
  (`/oyna`, `/oda`, `/profil`, `/siralama`, `/gecmis`, `/arkadaslar`) HERHANGİ
  birine gelen, tema çerezi OLMAYAN oturumlu bir isteği yakalayıp `users.theme`i
  BİR KEZ okuyor ve yanıta `Set-Cookie` yazıyor. Sonraki istekte çerez zaten var →
  `lib/theme.ts`teki YENİ `resolveThemeCookieValue` DB'ye HİÇ gitmiyor (testle
  kanıtlandı, aşağıda). `app/layout.tsx`/`ProfileContent.tsx`/`auth.config.ts`
  DOKUNULMADI (kart kümesi dışı) — tek fark artık İKİ yazıcı var: istemci
  (`/profil` PATCH sonrası) ve proxy (herhangi bir korunan rotadaki İLK
  çerezsiz istek).

mimari_bulgu_onemli: >
  Kartın metni `proxy.ts`'e mongoose sokmayı riskli/yasak sanmaya sevk edecek
  şekilde okunabilir (ADR-0009 E "kenar çalışma zamanı kısıtı", proxy.test.ts'in
  eski "mongoose/@xox/db doğrudan import etmez" iddiası). Canlı Next.js 16.3.2
  kaynağında (`next/dist/build/analysis/get-page-static-info.js`,
  `validateMiddlewareProxyExports` çevresi) şu satır bulundu: **"Proxy always
  runs on Node.js runtime."** — OPS-004'ün `middleware.ts` → `proxy.ts`
  taşımasıyla bu dosya ARTIK edge değil, DAİMA Node.js çalışma zamanındadır.
  ADR-0009 E'nin "kenar kısıtı" gerekçesi `middleware.ts` (edge varsayılan)
  dönemi için yazılmıştı ve `proxy.ts`'te GEÇERSİZDİR. Mekanik kanıt aşağıda
  (`proxy_nodejs_runtime_kaniti`). Bu YÜZDEN `lib/theme.ts` (→ `@xox/db`/
  mongoose) `proxy.ts`ye dolaylı olarak GÜVENLE bağlanabildi — proxy KENDİSİ
  mongoose import etmiyor (tek DB giriş kapısı hâlâ `lib/theme.ts`), ama artık
  buna izin vermek mimari bir ihlal DEĞİL.
  Aynı kaynak ayrıca proxy dosyalarının `export const runtime = ...` gibi bir
  route-segment config'i KABUL ETMEDİĞİNİ söylüyor ("Route segment config is
  not allowed in Proxy file... Proxy always runs on Node.js runtime") — yani
  BEN de elle bir `runtime` ihracı YAZMADIM (yazsaydım `pnpm build` sert
  reddederdi) ve `proxy.test.ts`e bunu regresyona karşı KİLİTLEYEN bir test
  eklendi.

kirmizi_once_kanit: |
  Önce YENİ testler (hem `lib/theme.test.ts`teki `resolveThemeCookieValue`
  bloğu hem `proxy.test.ts`teki üç yeni/güncellenen assertion) yazıldı, SONRA
  kaynak `git checkout HEAD -- apps/web/lib/theme.ts apps/web/proxy.ts` ile
  ESKİ haline döndürülüp koşuldu (fonksiyon henüz yoktu):

  ```
  ❯ |web| lib/theme.test.ts (18 tests | 4 failed)
  ❯ |web| proxy.test.ts (4 tests | 4 failed)

   FAIL  lib/theme.test.ts > resolveThemeCookieValue (...) > DB-de kullanıcı
   silinmişse (null) yine de acik döner (patlamaz), bu geçerli bir çözümdür
  TypeError: resolveThemeCookieValue is not a function

   FAIL  lib/theme.test.ts > resolveThemeCookieValue (...) > DB sorgusu
   düşerse undefined döner — çerez YAZILMAZ (kendi kendini onarma korunur)
  TypeError: resolveThemeCookieValue is not a function

   FAIL  lib/theme.test.ts > resolveThemeCookieValue (...) > connectDb-in
   kendisi düşerse de undefined döner — çerez YAZILMAZ
  TypeError: resolveThemeCookieValue is not a function

   FAIL  lib/theme.test.ts > resolveThemeCookieValue (...) > ARDIŞIK İKİ
   istek: birinci DB-ye 1 kez gider ve çerez döner, ikinci (o çerezle)
   DB-ye HİÇ gitmez
  TypeError: resolveThemeCookieValue is not a function

   Test Files  2 failed (2)
        Tests  8 failed | 14 passed (22)
  ```

  Düzeltme geri konulunca (`cp` ile eski dosyalar üzerine yazıldı) aynı 22
  test 22/22 yeşil (bkz. `test_ciktisi_ozet`).

ikinci_istek_db_ye_gitmiyor_kaniti: |
  Kartın kapanış şartı — DB-çağrısı casusu, İKİ ardışık "istek":

  ```ts
  it('ARDIŞIK İKİ istek: birinci DB-ye 1 kez gider ve çerez döner, ikinci
  (o çerezle) DB-ye HİÇ gitmez', async () => {
    mockDbTheme({ theme: 'koyu' })
    const { resolveThemeCookieValue } = await import('./theme')

    // 1. istek — proxy.ts'e göre gelen istekte tema çerezi henüz yok.
    const first = await resolveThemeCookieValue(undefined, 'u1')
    expect(first).toBe('koyu')
    expect(mockConnectDb).toHaveBeenCalledOnce()
    expect(mockFindById).toHaveBeenCalledOnce()

    // 2. istek — aynı kullanıcı, şimdi çerez MEVCUT (proxy'nin Set-Cookie'si).
    const second = await resolveThemeCookieValue(first, 'u1')
    expect(second).toBeUndefined()               // "çerez zaten var, yazma"
    expect(mockConnectDb).toHaveBeenCalledOnce()  // HÂLÂ 1 — ARTMADI
    expect(mockFindById).toHaveBeenCalledOnce()   // HÂLÂ 1
  })
  ```

  Sonuç: birinci istekte DB çağrı sayısı 1, ikinci istekte DELTA SIFIR (toplam
  hâlâ 1) — ikinci isteğin DB'ye gitmediğinin mekanik kanıtı budur. `proxy.ts`
  bu iki "isteği" gerçek dünyada birbirinden bağımsız iki HTTP navigasyonu
  olarak yaşar: proxy `next-auth` import ettiği için Vitest'te ÇALIŞTIRILAMIYOR
  (gotchas.md), bu yüzden proxy'nin ÇAĞIRDIĞI DB-karar fonksiyonu next-auth'suz,
  ayrı bir dosyada (`lib/theme.ts`) test edildi — `proxy.ts`nin kendisi yalnız
  `req.cookies`/`req.auth`'ı okuyup bu fonksiyona ilettiği için (bkz.
  `proxy.ts` kaynağı) davranış birebir örtüşür.

uc_koruma_hala_yesil:
  anonim_ziyaretci_dbye_gitmez: >
    `proxy.ts`'te DB'ye gidilen dal `userId !== undefined` koşuluna bağlı;
    `req.auth` yalnız `authConfig.callbacks.authorized` `true` DÖNDÜĞÜNDE
    (yani `auth?.user` mevcutken) sarmalayıcıya ulaşır — @auth/core'un
    `handleAuth`ı `authorized instanceof Response` (yönlendirme) durumunda
    sarmalayıcıyı HİÇ ÇAĞIRMAZ (next-auth kaynağı `lib/index.js`te
    doğrulandı). Anonim ziyaretçi zaten `/giris`e yönlendirilir, bu fonksiyon
    hiç çalışmaz. Ayrıca `resolveTheme`'in KENDİ anonim-korumasına (kart W2-05)
    hiç dokunulmadı — `theme.test.ts`teki o test HÂLÂ yeşil (bkz.
    `test_ciktisi_ozet`).
  db_hatasi_sayfayi_patlatmaz: >
    `resolveTheme` DEĞİŞMEDİ (hâlâ `lookupThemeInDb`'nin `ok:false` dalında
    `'acik'`e düşüyor, asla fırlatmıyor) — iki eski test (`DB sorgusu düşerse`,
    `connectDb-in kendisi düşerse`) AYNEN korunuyor ve yeşil. `proxy.ts` YENİ
    tarafında da aynı disiplin: `resolveThemeCookieValue` hata durumunda
    `undefined` döner, `response.cookies.set(...)` HİÇ ÇAĞRILMAZ — proxy asla
    fırlatmaz, `NextResponse.next()` her koşulda döner (kendi testiyle
    kilitlendi: "DB sorgusu düşerse undefined döner", "connectDb-in kendisi
    düşerse de undefined döner").
  cerez_hizli_yol_onceliklidir: >
    Hem `resolveTheme` (DEĞİŞMEDİ, eski test yeşil) hem YENİ
    `resolveThemeCookieValue` (`isTheme(existingCookie)` doğruysa DERHAL
    `undefined`, DB'ye HİÇ gidilmez) için ayrı ayrı kanıtlandı — bkz.
    `ikinci_istek_db_ye_gitmiyor_kaniti`ndeki ikinci adım ve
    "mevcut çerez zaten geçerliyse (koyu/acik) undefined döner" testi.

matcher_karari_gerekcesi: >
  Matcher GENİŞLETİLMEDİ, `auth.config.ts`teki `MIDDLEWARE_MATCHER`e (kart
  kümesi dışı, dokunulmadı) HİÇBİR değişiklik yapılmadı. Gerekçe: kartın
  şikayet ettiği senaryo ("/profil'e hiç uğramayan oturumlu kullanıcı") zaten
  aynen bu 6 korunan rotanın (`/oyna`, `/oda`, `/profil`, `/siralama`,
  `/gecmis`, `/arkadaslar`) TÜMÜNÜ kapsıyor — bunlar oyunun TÜM oturumlu
  deneyimidir. Matcher'ı `/` (ana sayfa) dahil TÜM rotalara genişletmek her
  ziyaretçi (anonim dahil) için proxy'yi çalıştırıp `authorized()`/JWT
  çözümleme maliyetini ana sayfaya da bulaştırırdı — kartın öngördüğü "her
  istekte proxy çalıştırma maliyeti" tam bu. Bilinen KAPSAM DIŞI boşluk:
  yalnız `/` üzerinde, `/profil`e VE korunan 6 rotanın HİÇBİRİNE hiç uğramadan
  sürekli gezinen (gerçekçi olmayan bir kullanım biçimi) oturumlu bir kullanıcı
  hâlâ her istekte `resolveTheme`'in eski DB dalını öder — bu PERF-008'in
  kapsamı DIŞINDA bırakıldı, gerekirse ayrı bir kart açılabilir.

proxy_nodejs_runtime_kaniti: |
  `pnpm --filter @xox/web build` sonrası `.next/server/functions-config-manifest.json`:

  ```json
  "/_middleware": {
    "runtime": "nodejs",
    "matchers": [ ... aynı 6 desen ... ]
  }
  ```

  `python3 -c "print(json.load(open('.next/server/functions-config-manifest.json'))['functions']['/_middleware']['runtime'])"`
  → `nodejs`. Değişiklik ÖNCESİ de (mongoose proxy.ts'e girmeden önce) bu alan
  zaten `nodejs`di — yani proxy ZATEN Node.js çalışma zamanındaydı, bu kart
  yalnız bunu FARK EDİP kullandı, yeni bir runtime AÇMADI.

build_kaniti: >
  `pnpm --filter @xox/web build` — Turbopack derlemesi TEMİZ geçti, "Route
  segment config is not allowed in Proxy file" / "matcher needs to be a
  static string" gibi hiçbir hata YOK. Çıktı: `ƒ Proxy (Middleware)` satırı
  hâlâ tek bir fonksiyon olarak listeleniyor, 6 korunan rota `ƒ` (dinamik)
  işaretli, davranış değişmedi.

test_ciktisi_ozet:
  theme_test: 'lib/theme.test.ts — 18/18 geçti (11 eski `resolveTheme` testi DOKUNULMADAN yeşil + 7 yeni `resolveThemeCookieValue` testi)'
  proxy_test: 'proxy.test.ts — 4/4 geçti (2 eski assertion + 1 güncellenmiş "mongoose doğrudan import etmez" + 1 yeni "export const runtime yok")'
  tum_paket: 'pnpm --filter @xox/web test:coverage → 96 dosya / 967 test, hepsi yeşil'
  typecheck: 'pnpm --filter @xox/web typecheck → temiz'
  gates: 'pnpm gates → exit 0 (check:dead-exports && typecheck && lint && format:check && test:coverage && knip, hepsi TEK komutla &&; herhangi biri kırılsaydı komut orada dururdu)'
  coverage_ozet: 'statements 94.26% / branches 89.63% / functions 94.02% / lines 96.44%'
  lint: 'pnpm lint apps/web → 0 uyarı/hata (--max-warnings=0)'
  size_limit: >
    `pnpm size-limit` → en ağır rota `/oda/[kod]`: 225.16 kB gzip / 235 kB bütçe
    → 9.84 kB pay kaldı (kart notundaki "~9.8 kB" ile örtüşüyor). İzolasyon
    kanıtı: `git stash` ile bu 4 dosyalık diff GERİ ALINIP aynı build+size-limit
    tekrar koşuldu → sonuç YİNE 225.16 kB, BİREBİR AYNI. Bu kart istemci
    paketine SIFIR bayt ekliyor (beklenen: değişiklik yalnız sunucu tarafı
    `proxy.ts`/`lib/theme.ts`'te, next.js istemci derlemesine hiç girmiyor).

erisilebilirlik_notu: >
  Görünür metin/etkileşim eklenmedi (yalnız sunucu tarafı proxy mantığı) —
  a11y değişmezleri ilgisiz.

dokunulan_dosyalar:
  degisen:
    - apps/web/proxy.ts
    - apps/web/lib/theme.ts
    - apps/web/proxy.test.ts
    - apps/web/lib/theme.test.ts
  eklenmedi_dondurulmus: >
    apps/web/app/layout.tsx, apps/web/components/profile/ProfileContent.tsx,
    apps/web/auth.config.ts, apps/web/auth.ts — hiçbiri açılmadı (kart kümesi
    dışı). `apps/web/lib/auth/session-callback.ts`teki `applySessionUser`
    SADECE İMPORT edildi (`proxy.ts`nin kendi NextAuth örneğine
    `callbacks.session` eklemek için — next-auth'a runtime bağımlılığı OLMAYAN
    saf bir yardımcı, dosyanın kendisi DEĞİŞTİRİLMEDİ).

neden_ozel_session_callback_gerekti: >
  `proxy.ts` `NextAuth(authConfig)` kullanıyor (edge-güvenli split config,
  `auth.ts`'in tam Credentials+argon2 kurulumu DEĞİL). `authConfig`
  `callbacks.session`i TANIMLAMAZ; next-auth'un edge-güvenli `getSession()`
  yolu (`lib/index.js`) bu durumda `session.user`i `args[0].user ?? args[0].token`e
  düşürür — yani ÇIPLAK JWT payload'ı (`sub`, `email`, ...), `.id` alanı YOK.
  `req.auth.user.id` TypeScript'te var GÖRÜNÜR (global `declare module
  'next-auth'` genişletmesi TÜM `Session` tipine uygulanır) ama bu ÖZEL
  NextAuth örneğinde ÇALIŞMA ZAMANINDA `undefined` olurdu — tipik "tip doğru,
  çalışma zamanı yalan söylüyor" sınıfı (gotchas.md). Bu yüzden `proxy.ts`
  KENDİ NextAuth örneğine `auth.ts`teki BİREBİR AYNI saf yardımcıyı
  (`applySessionUser`, next-auth'suz) `callbacks.session` olarak ekliyor —
  `callbacks.authorized` (yönlendirme kapısı) DEĞİŞMEDİ, hâlâ `authConfig`ten
  aynen geliyor.

commit_sha: 'aşağıda — bu ajan merge/push YAPMADI, worktree feat/PERF-008 dalında.'
````
