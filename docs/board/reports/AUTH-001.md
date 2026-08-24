```yaml
task: AUTH-001
status: done
summary: >
  Kimlik yüzeyi uçtan uca teslim edildi: split config (`auth.config.ts`
  kenar-güvenli, yalnız `pages`+`callbacks.authorized`+boş `providers`),
  `auth.ts` (Credentials + `session.strategy:'jwt'`, `adapter` ALANI YOK),
  `middleware.ts` (KK-007, 6 korunan rota → 307 `/giris?donus=...`),
  `POST /api/auth/register` (KK-001…004), `lib/auth/tokens.ts` (jose HS256,
  ÜÇ ayrı audience: `xox-mobile-access`/`xox-mobile-refresh`/`xox-ws`,
  TTL'ler `@xox/shared` sabitlerinden), `lib/auth/identity.ts`
  (`resolveIdentity` — Bearer → Auth.js çerezi → `?ticket=` sabit sırası,
  KK-010) ve `POST /api/ws/ticket` (ADR-0006).

  **Kritik keşif — `next-auth`'un derlenmiş çıktısı Vitest'te YÜKLENEMEZ:**
  `next-auth@5.0.0-beta.32`'nin `lib/env.js`'i `next/server`'ı uzantısız
  import ediyor (kaynakta bunu `@ts-expect-error` yorumuyla kendisi kabul
  ediyor); Vitest'in native ESM yükleyicisi bunu reddediyor
  (`Cannot find module '.../next/server'`), environment (`node`/`jsdom`)
  fark etmiyor. Çözüm: `authorizeCredentials` (KK-005 sabit-zamanlı mantık
  dahil) `next-auth`'a HİÇBİR bağımlılığı olmayan `lib/auth/authorize.ts`'e
  taşındı; `auth.ts` yalnız ince bir tel dosyası. `auth.ts`/`middleware.ts`
  için mekanik kanıt gerçek `pnpm --filter @xox/web build` (temiz geçti,
  middleware "Proxy" olarak doğru derlendi) + metin-düzeyi statik testler.

  İkinci keşif: Next 16, `middleware.ts`'te destructured/computed export'u
  ("export const { auth: middleware } = ...") build-time algılamıyor —
  `const { auth } = NextAuth(authConfig); export default auth` kalıbına
  geçildi, build bunu tanıyor.

  Üçüncü keşif: `jose`nin webapi derlemesi jsdom'un ayrı `Uint8Array` realm'i
  altında `instanceof` kontrolüyle patlıyor — jose kullanan test dosyalarına
  `// @vitest-environment node` eklendi.

  Dördüncü keşif: gitleaks'in `generic-api-key` kuralı ~18+ karakter + rakam
  bloğu içeren UYDURMA test parolalarını secret sanıp commit'i reddediyor;
  test parolaları kısa tutuldu (`'test-parola1'`, 12 karakter).

  Dördü de `docs/memory/gotchas.md`'ye kayıt düşüldü.

files_changed:
  - apps/web/auth.config.ts # YENİ — kenar-güvenli split config, PROTECTED_ROUTE_PREFIXES + authorized callback
  - apps/web/auth.config.test.ts # YENİ — 16 test, KK-007 6 rota × 307 + geçiş + korunmayan rota
  - apps/web/auth.ts # YENİ — NextAuth wiring, adapter YOK, Credentials({authorize:authorizeCredentials}), jwt callback YOK (BLOCKER-1)
  - apps/web/auth.static.test.ts # YENİ — metin-düzeyi: adapter yok, session:jwt açık, Credentials şekli, jwt callback YOK
  - apps/web/lib/auth/session-callback.ts # YENİ (güvenlik turu) — applySessionUser, next-auth'suz test edilebilir
  - apps/web/lib/auth/session-callback.test.ts # YENİ (güvenlik turu) — 4 test, iki-farklı-sub kimlik hijack mutasyonu kanıtı
  - apps/web/middleware.ts # YENİ — export default auth, matcher 6 korunan rota (literal, build zorunlu kılıyor)
  - apps/web/middleware.test.ts # YENİ — parseMatcherLiteral + toStrictEqual (MIDDLEWARE_MATCHER'a karşı, güvenlik turu sonrası sıkılaştırıldı)
  - apps/web/types/next-auth.d.ts # YENİ — Session.user.id modül genişletmesi (Auth.js resmi kalıbı)
  - apps/web/lib/auth/password.ts # YENİ — hashPassword/verifyPassword/verifyFakePassword (@node-rs/argon2)
  - apps/web/lib/auth/password.test.ts # YENİ — 5 test, gerçek argon2id
  - apps/web/lib/auth/authorize.ts # YENİ — authorizeCredentials, next-auth'a bağımsız (test edilebilirlik için ayrıştırıldı)
  - apps/web/lib/auth/authorize.test.ts # YENİ — 5 test, KK-005 gerçek ölçüm dahil
  - apps/web/lib/auth/tokens.ts # YENİ — signToken/verifyToken, 3 audience, jose HS256, AUTH_SECRET≥32, algorithms:['HS256']
  - apps/web/lib/auth/tokens.test.ts # YENİ — 11 test, çapraz-izleyici reddi + secret uzunluğu + alg allowlist dahil
  - apps/web/lib/auth/identity.ts # YENİ — resolveIdentity(req,{allowTicket=false}), room claim taşıma (BLOCKER-2)
  - apps/web/lib/auth/identity.test.ts # YENİ — 14 test, KK-010 + allowTicket varsayılan-kapalı + room claim dahil
  - apps/web/app/api/auth/register/route.ts # YENİ — POST, zod doğrulama, argon2id (duplicate kontrolünden SONRA), E11000→409, 254 karakter e-posta sınırı
  - apps/web/app/api/auth/register/route.test.ts # YENİ — 10 test
  - apps/web/app/api/auth/[...nextauth]/route.ts # YENİ — export {GET,POST} from '@/auth'
  - apps/web/app/api/ws/ticket/route.ts # YENİ — POST, resolveIdentity (allowTicket GEÇMEDEN), {roomCode} zorunlu gövde, room claim
  - apps/web/app/api/ws/ticket/route.test.ts # YENİ — 9 test, YALNIZ auth() mock (BLOCKER-2 regresyon testi dahil)
  - docs/memory/gotchas.md # 6 yeni kayıt (next-auth/next-server ESM, jose/jsdom realm, Next16 middleware export, gitleaks generic-api-key, Auth.js jwt callback user-yokluğu, readFileSync testinin körlüğü)
  - docs/memory/api-contract.md # yeni 3 uç nokta + tek-çözücü/3-audience/allowTicket/room-claim sözleşmesi
  - docs/memory/conventions.md # /giris?donus= açık yönlendirme doğrulama sözleşmesi (UI agent için)
  - docs/board/reports/AUTH-001.md

tests:
  {
    added: 90,
    passing: 122,
    web_coverage: '%95.11 ifade · %86.71 dal · %95.65 fonksiyon · %99.16 satır (eşikler 70/65/70/70 — geçti; güvenlik denetimi turu sonrası)',
    mutation: 'yok (araç) — ama 3 elle-uygulanmış mutasyon (aşağıya bkz) canlı koşulup kırmızı olduğu kanıtlandı',
  }

kirmizi_yesil_kanit:
  - >
    `lib/auth/tokens.test.ts` ilk koşusu 6/8 kırmızı verdi:
    `TypeError: payload must be an instance of Uint8Array` — jsdom (varsayılan
    test ortamı) jose'nin `instanceof Uint8Array` kontrolünü kendi ayrı
    `vm` realm'i yüzünden geçiremiyordu. `// @vitest-environment node`
    eklenince 8/8 yeşile döndü; sonda ile hem `node` hem `jsdom`'da izole
    doğrulandı (jose olmadan `next/server` import problemiyle karışmaması
    için ayrı ayrı test edildi).
  - >
    İlk `auth.test.ts` (silindi, mantığı `lib/auth/authorize.test.ts`'e
    taşındı) 5/5 kırmızı verdi: `Cannot find module '.../next/server'`.
    Kök neden `next-auth`'un derlenmiş `lib/env.js`'inin uzantısız
    `next/server` import etmesi (kaynakta `@ts-expect-error` ile kabul
    ediliyor) — Vitest'in native ESM yükleyicisi bunu strict modda
    reddediyor. `authorize()` mantığı `next-auth`'a bağımlılığı olmayan
    ayrı bir dosyaya taşınınca 5/5 yeşile döndü.
  - >
    `pnpm --filter @xox/web build` ilk denemesi kırmızı verdi:
    `Error: The file "./middleware.ts" must export a function...`
    (`export const { auth: middleware } = NextAuth(authConfig)` Next 16'nın
    statik algılayıcısını geçmiyor). `const { auth } = NextAuth(authConfig);
    export default auth` kalıbına geçilince build temiz geçti, middleware
    "ƒ Proxy (Middleware)" olarak doğru derlendi.
  - >
    İlk `git commit` denemesi gitleaks pre-commit hook'unda REDDEDİLDİ: 6
    "leaks found" — `register/route.test.ts`teki 18+ karakterli, rakam içeren
    UYDURMA test parolaları `generic-api-key` kuralını tetikliyordu (canlı
    sonda: aynı kelime kökü kısa haliyle temiz, uzun+rakamlı haliyle
    yakalanıyor). Kısa `'test-parola1'` (12 karakter) ile değiştirilince
    commit temiz geçti.

kk005_sabit_zamanli_giris_kaniti:
  yontem: >
    `lib/auth/authorize.test.ts`teki test gerçek argon2id ile üretilmiş bir
    hash'e karşı "yanlış parola" (kullanıcı BULUNUR, `verifyPassword` çalışır)
    ile "kayıtsız e-posta" (kullanıcı BULUNMAZ, `verifyFakePassword` sabit
    özete karşı çalışır) senaryolarını 5'er kez ölçüp ortalamasını alıyor
    (@node-rs/argon2 varsayılan parametreleriyle: memoryCost 19456,
    timeCost 2, parallelism 1 — hiçbir yerde override edilmedi).
  olcum_sonuclari: >
    Üç ayrı `pnpm gates` koşusunda gözlenen gerçek sayılar (console.warn ile
    basılan, mocklanmamış): 25.21ms/26.32ms (fark 1.10ms) ·
    32.56ms/33.65ms (fark 1.09ms) · 34.96ms/38.15ms (fark 3.19ms).
    Üçü de kart kriterinin istediği ±100ms sınırının ÇOK altında.
  test_disiplini: >
    `User` mocklandı (`@xox/db` `vi.mock`), ama `verifyFakePassword`/
    `verifyPassword`/`hashPassword` MOCKLANMADI — gerçek argon2id
    süresi ölçüldü, sahte/hızlı bir stub'a karşı değil.

capraz_izleyici_kaniti:
  test: "lib/auth/tokens.test.ts > 'KRİTİK: bir izleyici için imzalanan token BAŞKA izleyiciye karşı reddedilir'"
  yontem: >
    Aynı `userId` ile üç farklı `kind` (`mobile-access`/`mobile-refresh`/
    `ws-ticket`) için ayrı ayrı token imzalanıp, 6 YANLIŞ kombinasyonun
    (access→refresh, access→ticket, refresh→access, refresh→ticket,
    ticket→access, ticket→refresh) TAMAMININ `null` döndüğü, 3 DOĞRU
    kombinasyonun ise `{userId}` döndürdüğü tek testte doğrulandı.
  ek_kanit: "app/api/ws/ticket/route.test.ts: gerçek üretilen bilet aud:xox-ws ile doğrulanıp, aud:xox-mobile-access'e karşı reddedildiği ayrıca kanıtlandı."
  neden_uc_ayri_aud: >
    ADR-0006/ADR-0005 mobil access/refresh için TEK aud (`xox-mobile`) +
    `typ` claim öneriyordu; kart kriter 7 açıkça "üç ayrı izleyici" istedi.
    Bilinçli sapma: üç ayrı aud, `typ` claim'i kod incelemesinde unutulsa
    bile çapraz kabulü KRİPTOGRAFİK olarak imkânsız kılıyor
    (`jwtVerify`'ın `audience` seçeneği eşleşmezse fırlatıyor).

kk010_tek_cozucu_kaniti:
  test: "lib/auth/identity.test.ts > 'KK-010: aynı userId üç kaynaktan da AYNI kimliğe çözülür'"
  yontem: >
    Aynı `userId` (`ayni-kullanici-42`) sırasıyla (1) Bearer mobil-access
    token, (2) mock Auth.js çerez oturumu, (3) WS bileti olarak sunulup
    `resolveIdentity`in üçünde de `{userId:'ayni-kullanici-42'}` döndürdüğü
    doğrulandı. Ayrı testlerle SIRA da kanıtlandı: Bearer+çerez birlikte
    varsa Bearer kazanır; çerez+ticket birlikte varsa (bearer yok) çerez
    kazanır; Bearer VARSA ama GEÇERSİZSE sıradaki kaynağa (çerez/ticket)
    DÜŞMEZ — null döner (güvenlik: kaynak seçimi netlik ister, sessiz
    fallback istismar yüzeyi açar).

middleware_yonlendirme_testi:
  test: "auth.config.test.ts > 'authorized callback — KK-007 korunan rota yönlendirmesi'"
  yontem: >
    Kart metninden ELLE kopyalanan 6 yol (`/oyna/oda-1`,`/oda/ABC234`,
    `/profil`,`/siralama`,`/gecmis`,`/arkadaslar` — middleware.ts'in
    matcher'ından TÜRETİLMEDİ, gotchas.md "kendine-referanslı test"
    dersine göre) `it.each` ile hem oturumsuz (307 + `Location:
    https://xox.test/giris?donus=<encodeURIComponent(pathname+search)>`)
    hem oturumlu (`true`, geçer) senaryoda test edildi; korunmayan bir rota
    (`/`) her koşulda `true` döndü. `/davet/:kod`ın listede OLMADIĞI ayrıca
    doğrulandı (KK-121).
  mekanik_ek_kanit: >
    `pnpm --filter @xox/web build` middleware'i "ƒ Proxy (Middleware)"
    olarak temiz derledi — gerçek Next.js edge derleyicisi
    mongoose/@node-rs/argon2 sızıntısı olmadığını onaylıyor.

pnpm_gates: >
  Repo genelinde `pnpm gates` (typecheck + lint + format:check +
  test:coverage + knip) EXIT 0. 7 paket: @xox/web (100/100 test,
  %94.65/%86.48/%95.34/%99.07 — eşiklerin üstünde), @xox/db (66/66,
  %100, bu görevde değişmedi), @xox/shared (342/342), @xox/game-core
  (91/91, %100), @xox/ui-tokens (38/38, %100), @xox/mobile ve @xox/e2e
  typecheck-only. knip: sıfır unused-file/unused-export bulgusu (`signIn`/
  `signOut` export'ları kullanılmadığı için knip tarafından yakalandı ve
  kaldırıldı — kart kriter 2'nin istediği asgari şekli (providers/session/
  pages) zaten karşılıyorlardı, eklenmemeleri işlevsel kayıp değil).
  `apps/web/package.json` ve `knip.json`'a DOKUNULMADI.
  `pnpm --filter @xox/web build` ayrıca AYRICA çalıştırıldı (gates'in
  parçası değil, kart bunu açıkça istiyor) — temiz, middleware doğru
  edge runtime'a derlendi.

vercel_env:
  auth_secret_development: "EKLENDİ (Sensitive) — .env.local'deki değerle aynı, terminale hiç yazdırılmadan boru hattıyla aktarıldı"
  auth_trust_host_preview: "EKLENDİ (`true`) — Preview URL'i deploy başına değiştiği için Auth.js host'u istekten çıkarsın diye"
  auth_url: "DOKUNULMADI — yalnız Production'da önceden vardı, kart 'sabit AUTH_URL yazma' dediği için Preview'a YENİ bir tane EKLENMEDİ"
  dogrulama: "`vercel env ls` ile üç değişkenin de doğru ortamlarda göründüğü teyit edildi (secret DEĞERLERİ hiçbir zaman terminale/log'a yazdırılmadı)"

decisions:
  - karar: >
      `authorizeCredentials` (ve KK-005 sabit-zamanlı mantığı) `auth.ts`
      yerine `next-auth`'a hiçbir bağımlılığı olmayan `lib/auth/authorize.ts`
      dosyasına yazıldı; `auth.ts` yalnız `NextAuth({...})` çağrısını yapan
      ince bir tel.
    gerekce: >
      `next-auth@5.0.0-beta.32`'nin derlenmiş çıktısı `next/server`'ı
      uzantısız import ediyor (kendi kaynağında `@ts-expect-error Next.js
      does not yet correctly use the package.json#exports field` diyor);
      bu webpack/Turbopack'te sorunsuz ama Vitest'in native ESM yükleyicisi
      bunu `Cannot find module` ile reddediyor — `node`/`jsdom` environment
      farketmiyor, canlı doğrulandı. Ayrıştırma, KK-005'in kritik ±100ms
      testinin gerçekten ÇALIŞTIRILABİLİR olmasını sağladı; aksi halde bu
      test ya yazılamaz ya da mocklanıp anlamsızlaşırdı.
    reddedilen_alternatif: >
      `auth.ts`'i mock'lu bir next-auth ile test etmek — bu, gerçek
      argon2id zamanlamasını DEĞİL, mock'un davranışını ölçerdi; KK-005'in
      "gerçek bir argon2id verify koşturur" şartını kanıtlamazdı.
  - karar: >
      `lib/auth/tokens.ts` mobil access/refresh için ADR-0005/0006'nın
      önerdiği TEK `aud` (+`typ` claim) yerine ÜÇ AYRI `aud` kullanıyor
      (`xox-mobile-access`/`xox-mobile-refresh`/`xox-ws`).
    gerekce: >
      Kartın kriter 7'si birebir "üç ayrı izleyici (audience)" diyor —
      tasarım dokümanının §6.2'sinden daha spesifik ve daha yeni bir talimat.
      Üç ayrı aud, `typ` claim'i kod incelemesinde/gelecekteki bir
      refactor'da unutulsa bile çapraz kabulü kriptografik düzeyde imkânsız
      kılıyor (savunma tek bir `if` ifadesine değil `jwtVerify`nin kendisine
      dayanıyor).
    reddedilen_alternatif: >
      Tek `aud:'xox-mobile'` + `typ:'access'|'refresh'` claim'i (ADR-0005/
      0006'nın önerdiği) — kart kriterine aykırı düşerdi.
  - karar: >
      `middleware.ts` `export default auth` kullanıyor,
      `export const { auth: middleware } = ...` DEĞİL.
    gerekce: >
      Next 16'nın build-time middleware algılayıcısı destructured/computed
      export'u tanımıyor — canlı `pnpm build` hatasıyla doğrulandı
      ("must export a function, either as a default export or as a named
      middleware export"). `export default auth` build'i geçiyor.
    reddedilen_alternatif: >
      `export { auth as middleware }` (Auth.js dokümantasyonunun sık
      gösterdiği kalıp) denenmedi çünkü default export zaten build'i
      geçti ve daha az sözdizimsel risk taşıyor; literatürde her iki
      kalıp da dolaşımda, default export burada MEKANİK olarak doğrulanmış
      olan.
  - karar: >
      `apps/web/auth.ts`'in `signIn`/`signOut` export'ları KALDIRILDI
      (yalnız `handlers:{GET,POST}` ve `auth` dışa veriliyor).
    gerekce: >
      knip bunları "unused export" olarak işaretledi (henüz hiçbir UI
      tüketmiyor — UI-SKEL-001 paralel çalışıyor ve `@/auth` import ETMEME
      kuralına tabi). Kart kriter 2'nin istediği asgari şekil
      (`providers`/`session`/`pages`) zaten sağlanıyor; `knip.json`'a
      DOKUNULAMAZ (kart kriter 10) olduğu için ignore eklenemezdi.
    reddedilen_alternatif: >
      `knip.json`'a `signIn`/`signOut`'u ignore listesine eklemek — kartın
      açık yasağı ("apps/web/package.json ve knip.json'a DOKUNULMAZ").
      Bir sonraki wave (login formu) bu export'lara ihtiyaç duyarsa
      `auth.ts`'e geri eklemek tek satırlık bir değişiklik.
  - karar: >
      Register route'ta zod hata kodunu (`WEAK_PASSWORD`/`INVALID_EMAIL`/
      `INVALID_NAME`) ilk başarısız `issue.path[0]`'a göre eşlemek; birden
      çok alan aynı anda geçersizse yalnız İLK issue'nun kodu dönüyor.
    gerekce: >
      Kart kriteri tek tek alan-kod eşlemesini istiyor (KK-001…004), birden
      fazla alan hatası aynı anda geldiğinde hangi kodun öncelikli olacağı
      belirtilmemiş; zod'un issue sırası (şemadaki alan sırası: email,
      password, displayName) deterministik ve öngörülebilir.
    reddedilen_alternatif: >
      Tüm hataları bir dizi olarak dönmek — `errorResponseSchema` tek bir
      `{code,message}` bekliyor (rest-contract.ts, dokunulmadı), sözleşmeyi
      genişletmek bu kartın çakışma kümesi dışında (`packages/shared`
      DONDU).

gotchas:
  - >
    `next-auth@5.0.0-beta.32`'nin derlenmiş `lib/env.js`'i `next/server`'ı
    UZANTISIZ import ediyor; Vitest'in native ESM yükleyicisi (environment
    farketmeksizin) bunu reddediyor. `next-auth`/`Credentials(...)` içeren
    HERHANGİ bir dosyayı Vitest'te DOĞRUDAN import etme — iş mantığını
    ayrı, next-auth'suz bir dosyaya taşı, gerçek `next-auth` telini
    yalnız `pnpm build` ile kanıtla.
  - >
    `jose`nin webapi derlemesi jsdom'un ayrı `Uint8Array` realm'i altında
    `instanceof` kontrolüyle SESSİZCE patlıyor — `pnpm why jose` tek kopya
    gösterse bile. jose kullanan test dosyalarına `// @vitest-environment
    node` ekle.
  - >
    Next 16 `middleware.ts`'te destructured/computed export'u ("export
    const { auth: middleware } = ...") build-time TANIMIYOR — `export
    default auth` kullan. Ayrıca Next 16 `middleware.ts`'i `proxy.ts` lehine
    KALDIRIYOR (henüz uyarı, hata değil) — bu ayrı bir görev.
  - >
    gitleaks `generic-api-key` kuralı ~18+ karakter + rakam bloğu içeren
    UYDURMA test parolalarını secret sanıyor. Test parolalarını KISA tut
    (8-14 karakter) ve commit'ten önce `gitleaks detect --no-git --source
    <dosya>` ile sonda at.
  - >
    (güvenlik denetimi) `@auth/core`'un JWT stratejisi `callbacks.jwt`'i
    OTURUM OKUMASINDA `user` anahtarı OLMADAN çağırır — yalnız sign-in'de
    gelir. TypeScript `user`i zorunlu gösterir ama çalışma zamanında
    opsiyoneldir; bunu varsayıp `user.id` erişmek her oturum okumasında
    `TypeError` fırlatır ve `@auth/core` bunu yakalayıp OTURUM ÇEREZİNİ
    SİLER. `jwt` callback'ini tanımlama — sign-in'de `token.sub` zaten
    otomatik kuruluyor.
  - >
    (güvenlik denetimi) `readFileSync` + `toContain` ile kaynak metin
    okuyan bir test, bir dizinin ÇALIŞMA ZAMANINDA kısaltılmasını (aynı
    metin, farklı gerçek değer) YAKALAMAZ. `toStrictEqual` ile TAM dizi
    eşitliği + doğruluk kaynağını next-auth'suz gerçekten import edilebilir
    bir dosyada tutmak gerekir. Next.js'in `matcher` gibi bazı alanları SAF
    literal olmaya build-time zorlaması, "hesaplanmış" sınıfı saldırıları
    zaten kapatır — geriye yalnız "literal içerik doğru mu" sorusu kalır.
    (Altısı da docs/memory/gotchas.md'ye eklendi — bu satırlar oradan birebir.)

security_audit_round:
  status: '2 BLOCKER + 3 test bulgusu + 2 küçük bulgu — TÜMÜ kapatıldı, sırayla'
  commits:
    - '2fe276d fix(web): BLOCKER — jwt callback kaldırıldı, oturum okumasında çerez silinmiyor'
    - '6328cde fix(web): BLOCKER — WS bileti aklanamaz artık; bilet oda koduna bağlanır'
    - 'c55edd8 test(web): middleware matcher testi toStrictEqual ile sıkılaştırıldı'
    - 'cc45006 fix(web): AUTH_SECRET uzunluk doğrulaması + jose algorithms allowlist'
    - '2794b80 perf(web): register — argon2id hash duplicate kontrolünden SONRA değil ÖNCE atlanır'
    - 'fa82364 docs(memory): güvenlik denetimi sonrası kimlik sözleşmesi + 2 yeni gotcha'

  blocker_1_jwt_callback:
    bulgu: >
      `auth.ts`teki `jwt({token,user}){ if(user.id!==undefined){token.sub=user.id} }` her
      OTURUM OKUMASINDA (sign-in değil) `@auth/core`'un `lib/actions/session.js:28`'i
      `callbacks.jwt`'i `user` ANAHTARI OLMADAN çağırması yüzünden `TypeError` fırlatıyordu;
      `session.js:58-62` bunu yakalayıp `sessionStore.clean()` ile çerezi SİLİYORDU. Kullanıcı
      giriş yapar yapmaz ilk `auth()` çağrısında oturumu kaybediyordu — KK-006/KK-010 çerez
      dalı FİİLEN ASLA çalışmıyordu, `pnpm gates` yeşildi çünkü tip `user`i zorunlu
      göstermesine rağmen çalışma zamanında opsiyoneldi.
    dogrulama_yontemi: >
      `@auth/core@0.41.3`'ün gerçek kaynağı `node_modules/.pnpm/@auth+core@.../lib/actions/
      session.js` okunarak doğrulandı: `const token = await callbacks.jwt({token:payload,
      ...(isUpdate&&{trigger:'update'}), session:newSession})` — `user` YOK. `callback/
      index.js:76`: `sub: user.id?.toString()` sign-in'de zaten atanıyor, callback GEREKSİZ.
    duzeltme: >
      `jwt` callback'i TAMAMEN SİLİNDİ. `session` callback'in mantığı next-auth'a bağımlı
      OLMAYAN `lib/auth/session-callback.ts`'e taşındı (`import type` yalnız —
      `verbatimModuleSyntax` altında silinir, çalışma zamanı bağımlılığı sıfır).
    mutasyon_kaniti: >
      `applySessionUser`de `session.user.id = token.sub` satırı `session.user.id =
      'sabit-yonetici'` ile değiştirilip canlı koşuldu: `session-callback.test.ts`in iki-farklı-
      sub testi (`user-alpha-1`/`user-beta-2`) İKİSİ DE kırmızı oldu
      (`expected 'sabit-yonetici' to be 'user-alpha-1'`). Mutasyon geri alındı, testler yeşile
      döndü. Auditor'ın orijinal mutasyonu (`jwt` callback içindeki `token.sub`) artık o kod
      SİLİNDİĞİ için birebir uygulanamaz; bu, aynı zafiyet sınıfının (kimlik hijack) EŞDEĞER
      yerdeki (yeni tek gerçek mantık noktası) kanıtıdır.

  blocker_2_ticket_aklama:
    bulgu: >
      `resolveIdentity(req)` `?ticket=`'i HER çağrıda (POST /api/ws/ticket'ın KENDİSİ dahil)
      kabul ediyordu. Denetçinin canlı sondası: `POST /api/ws/ticket?ticket=<T0>` → 200
      `{ticket:T1}` (çerez/Bearer YOK), sonra `T1` ile `PATCH /api/profile?ticket=<T1>` başka
      bir uçta kullanıcı olarak kabul ediliyordu. 25 sn'de bir tekrarla 30 saniyelik bir bilet
      SÜRESİZ hesap devralmaya dönüşüyordu — spec §6.3 ("yalnız WS upgrade'inde") ve ADR-0006
      ("başka hiçbir uçta kabul edilmeyen bir bilet") ikisi de fiilen ihlal ediliyordu.
    duzeltme: >
      `resolveIdentity(req, options: {allowTicket?:boolean}={})` — `allowTicket` VARSAYILAN
      `false`. `?ticket=` YALNIZ `allowTicket:true` AÇIKÇA geçilince denenir. `POST
      /api/ws/ticket` `allowTicket` GEÇMEDEN çağırıyor (bir bilet ÜRETİR, KABUL ETMEZ).
      **WS-001'in WS upgrade route'u `resolveIdentity(req,{allowTicket:true})` çağırmak
      ZORUNDA** — bu, docs/memory/api-contract.md'ye YAZILI bir sözleşme.
    test_kaniti: >
      `app/api/ws/ticket/route.test.ts`teki "GÜVENLİK REGRESYONU (BLOCKER-2)" testi denetçinin
      SONDASINI birebir uyguluyor: gerçek bir bilet üretilip aynı uca `?ticket=` ile tekrar
      POST ediliyor (oturum/Bearer YOK) — artık 401 UNAUTHENTICATED. Test `@/lib/auth/identity`
      DEĞİL yalnız `@/auth`'un `auth()`unu mock'luyor; `resolveIdentity`/`verifyToken`/
      `signToken` GERÇEK kodla çalışıyor (önceki sürümün tam tersi — bkz. test_bulgulari).

  yatay_yetki_karari:
    soru: "Bilete `room` claim'i bağlanmalı mı? (WS-001 başlamadan karar verilmesi istendi)"
    karar: 'EVET — bağlandı, uygulandı.'
    uygulama: >
      `POST /api/ws/ticket` gövdesi artık `{roomCode}` İSTİYOR (zod `roomCodeSchema` — route
      İÇİNDE yerel şema, `packages/shared` DONDUĞU için orada TANIMLANMADI). Dönen bilet
      `room` claim'ini taşıyor. `resolveIdentity`in `Identity` tipi opsiyonel `room?: string`
      alanı kazandı (yalnız ticket kaynağında dolar). Test: "YATAY YETKİ" senaryosu A odası
      için kesilen biletin `room` claim'inin B odasıyla EŞLEŞMEDİĞİNİ kanıtlıyor.
    ws001_zorunlulugu: >
      **WS-001'in upgrade handler'ı `identity.room`'u URL'deki oda koduyla KARŞILAŞTIRMAK
      ZORUNDA** — eşleşmezse bağlantı reddedilmeli (öneri: `4403`, ADR-0006'nın kapanış kodu
      tablosuyla tutarlı). Bu görev bu karşılaştırmayı YAPMADI (WS route henüz yok); yalnız
      claim'i üretip taşıdı ve sözleşmeyi docs/memory/api-contract.md'ye yazdı.
    gerekce: >
      Ticket'ın TEK amacı kimlik ispatıdır (ADR-0006); oda-seviyesi yetki (koltuk sahipliği)
      zaten WS-001'in ayrı bir kontrolü olacaktı, yani `room` claim'i olmadan da bugün bilinen
      bir sömürü YOK. Ama (a) least-privilege ilkesi — bir bilet yalnız istendiği amaç için
      geçerli olmalı, (b) savunma derinliği — WS-001'in oda-yetki kontrolünde ileride bir hata
      olursa `room` claim'i ikinci bir bariyer olur, (c) maliyet düşük — istemci zaten
      bileti istediği anda hangi odaya bağlanacağını biliyor (`/oda/[kod]` sayfasında).
      Bu üçü YOK'a göre daha güçlü bir sözleşme sunuyor.

  test_bulgulari:
    - dosya: 'auth.static.test.ts'
      bulgu: >
        `readFileSync` + regex ile `auth.ts`'i METİN olarak okuyordu, dosya HİÇ ÇALIŞMIYORDU.
        Denetçinin `token.sub='sabit-yonetici'` mutasyonu (eski `jwt` callback içinde) 100
        testin TAMAMINI yeşil bırakıyordu.
      duzeltme: >
        Gerçek mantık (`session` callback'in davranışı) `lib/auth/session-callback.ts`'e
        taşınıp `session-callback.test.ts`de GERÇEK bir davranış testiyle kilitlendi (yukarıya
        bkz, blocker_1). `auth.static.test.ts` artık yalnız GERÇEKTEN test edilemeyen
        yapısal iddiaları (adapter yokluğu, next-auth wiring şekli) taşıyor VE bunu açıkça
        belgeliyor — "bu test bir kanıt DEĞİL, ikincil sinyal" yorumuyla.
    - dosya: 'middleware.test.ts'
      bulgu: >
        `toContain` ile alt-dize arıyordu; `matcher.slice(0,1)`e eşdeğer bir çalışma-zamanı
        kısaltması metinde tüm 6 rotayı bırakıp gerçek diziyi 1 öğeye indirebiliyordu, test
        bunu GÖRMÜYORDU.
      duzeltme: >
        Next.js'in `matcher`ı SAF literal olmaya build-time ZORLADIĞI kanıtlandı (`.slice()`
        denendi, build SERT reddetti — "matcher needs to be a static string or array of static
        strings"). Geriye kalan risk (literal içerik) `parseMatcherLiteral` + `toStrictEqual`
        ile `auth.config.ts`teki (next-auth'suz, GERÇEKTEN import edilebilir, kart metniyle
        ayrı testte kilitli) `MIDDLEWARE_MATCHER`'a karşı kapatıldı.
      mutasyon_kaniti: >
        `middleware.ts`teki literal `['/oyna/:path*']`e kısaltıldı, canlı koşuldu:
        `middleware.test.ts` KIRMIZI oldu (`expected ['/oyna/:path*'] to strictly equal
        [6 öge]`). Mutasyon geri alındı, test yeşile döndü.
    - dosya: 'app/api/ws/ticket/route.test.ts'
      bulgu: >
        `@/lib/auth/identity`'nin TAMAMINI mock'luyordu — rotanın gerçek kimlik kararı
        (dolayısıyla BLOCKER-2) HİÇBİR testte sınanmıyordu.
      duzeltme: >
        Dosya baştan yazıldı: artık YALNIZ `@/auth`'un `auth()` fonksiyonu mock'lanıyor
        (denetçinin canlı sondasıyla AYNI sınır); `resolveIdentity`/`verifyToken`/`signToken`
        GERÇEK kodla çalışıyor. "GÜVENLİK REGRESYONU (BLOCKER-2)" testi denetçinin bilet-replay
        senaryosunu birebir uyguluyor.

  auth_secret_uzunluk:
    bulgu: "`getSecretKey()` yalnız boş/undefined reddediyordu; `AUTH_SECRET='x'` ile imzalama+doğrulama KABUL EDİLDİ (canlı sondayla kanıtlandı)."
    duzeltme: "32 karakter (256 bit, HS256 asgarisi) altı reddediliyor. Sınır değeri (`'a'.repeat(32)`→kabul, `'x'`→red) testle kanıtlandı."

  kucuk_bulgular:
    - "`verifyToken`'a `algorithms:['HS256']` allowlist'i eklendi (savunma derinliği); HS384 ile imzalanmış (aynı sırla) bir token'ın reddedildiği testle kanıtlandı."
    - "Register route'ta 254 karakterden uzun e-posta artık route seviyesinde 400 INVALID_EMAIL — Mongo'nun indeks anahtarı sınırını aşıp 500'e dönüşme riski kapatıldı (`emailSchema.max(254)` kalıcı çözüm, packages/shared dondu, buraya eklenmedi)."
    - "Register route'ta argon2id hash artık ucuz bir `findOne` ön kontrolünden SONRA çalışıyor — zaten kayıtlı e-postaya yağdırılan istekler tam maliyeti ödemiyor. hashPassword'ün çağrılmadığı testle kanıtlandı."

  spec_adr_celiskisi_tavsiyesi: >
    Denetçi spec §6.3'ün "tek kullanımlık bilet" dediğini, ADR-0006'nın tek kullanımlığı
    AÇIKÇA reddettiğini, uygulamanın ADR'ı izlediğini not etti ve hangisinin güncellenmesi
    gerektiğini sordu. TAVSİYE: **spec §6.3 güncellensin, ADR-0006 olduğu gibi kalsın.**
    Gerekçe: ADR-0006 tek-kullanımlık-olmama kararını ayrıntılı gerekçelendiriyor (30 sn içinde
    tekrar kullanım zaten aynı kullanıcının kendi bağlantısını devralması, DB yazma maliyeti
    Z2'nin sık rotasyonuyla çarpınca gereksiz) ve BLOCKER-2 düzeltmesiyle (ticket artık yalnız
    WS upgrade'inde, `allowTicket` ile açıkça izinli) bu karar hâlâ güvenli. Spec'in "tek
    kullanımlık" ifadesi muhtemelen ADR'dan ÖNCE yazılmış, ADR'ın revize ettiği erken bir
    varsayım. Koordinatörün "ben yaparım" dediği güncelleme budur.

blocked_reason: null

next_suggestions:
  - >
    **WS-001 ZORUNLU:** `lib/auth/identity.ts`'teki `resolveIdentity`'i
    DOĞRUDAN import edip `resolveIdentity(req, {allowTicket:true})` ile
    çağırmalı (yalnız burada `allowTicket:true` — başka HİÇBİR yerde değil,
    BLOCKER-2) VE dönen `identity.room`'u URL'deki oda koduyla
    KARŞILAŞTIRMALI (eşleşmezse bağlantıyı reddet, öneri `4403` — yatay
    yetki kararı, bu raporun `security_audit_round.yatay_yetki_karari`
    bölümüne bkz). Kimlik çözme mantığını yeniden yazmasın (tek çözücü
    ilkesi, KK-010).
  - >
    Mobil köprü rotaları (`/api/auth/mobile/{authorize,callback,refresh}`,
    dalga 2) `lib/auth/tokens.ts`teki `signToken('mobile-access'|
    'mobile-refresh', ...)`/`verifyToken` çiftini kullanmalı; `refresh`
    rotası ayrıca `MobileRefreshToken` koleksiyonuna (DB-001'de zaten
    tanımlı) `jti` kaydedip döndürmeli — bu görev o entegrasyonu YAPMADI
    (yalnız token imzalama/doğrulama altyapısını kurdu).
  - >
    Login/kayıt UI'ı (`/giris`, `/kayit` — UI-SKEL-001 ya da sonraki bir
    dalga) `signIn`/`signOut`'a ihtiyaç duyarsa `auth.ts`'e geri eklensin;
    bu görev knip temizliği için kaldırdı, işlevsel bir eksiklik değil.
  - >
    KK-006 (Credentials+JWT oturumunun tarayıcı kapanıp açıldıktan sonra
    sürmesi) hâlâ Doğrulanmamış varsayım (ADR-0009) — gerçek preview'da
    (Dalga 0e KAPI) koşulmalı, birim testiyle kanıtlanamaz.
  - >
    `middleware.ts` → `proxy.ts` geçişi (Next 16 deprecation uyarısı)
    ayrı, küçük bir görev olarak planlanabilir; şu an sert hata değil,
    Auth.js'in kendi dokümantasyonu da bu değişikliğe henüz uymuyor.
  - >
    Koordinatör spec §6.3'ü ADR-0006 ile uyumlu hâle getirmeli — "tek
    kullanımlık bilet" ifadesi kaldırılıp ADR-0006'nın tekrar-kullanılabilir
    (30 sn, tek amaçlı) kararına referans verilmeli. Detaylı gerekçe
    `security_audit_round.spec_adr_celiskisi_tavsiyesi`de.
  - >
    `emailSchema`ya (`packages/shared/src/rest-contract.ts`) `.max(254)`
    eklenmesi kalıcı çözüm — bu görev `packages/shared` DONDUĞU için yalnız
    `register/route.ts` seviyesinde savunma amaçlı bir kontrol ekledi.
    packages/shared açıldığında bu satır oraya taşınmalı.
  - >
    `/giris` sayfasını yazacak agent `docs/memory/conventions.md`teki
    "`/giris?donus=` sözleşmesi"ni okumalı: `donus` kullanılmadan önce
    `startsWith('/')` VE `!startsWith('//')` doğrulanmalı (açık yönlendirme
    savunması, bugün risk yok ama sözleşme yazılı olmalı).
```
