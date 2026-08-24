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
  - apps/web/auth.ts # YENİ — NextAuth wiring, adapter YOK, Credentials({authorize:authorizeCredentials})
  - apps/web/auth.static.test.ts # YENİ — metin-düzeyi: adapter yok, session:jwt açık, Credentials şekli
  - apps/web/middleware.ts # YENİ — export default auth, matcher 6 korunan rota
  - apps/web/middleware.test.ts # YENİ — metin-düzeyi: yalnız ./auth.config import, mongoose/argon2/@xox/db yok
  - apps/web/types/next-auth.d.ts # YENİ — Session.user.id modül genişletmesi (Auth.js resmi kalıbı)
  - apps/web/lib/auth/password.ts # YENİ — hashPassword/verifyPassword/verifyFakePassword (@node-rs/argon2)
  - apps/web/lib/auth/password.test.ts # YENİ — 5 test, gerçek argon2id
  - apps/web/lib/auth/authorize.ts # YENİ — authorizeCredentials, next-auth'a bağımsız (test edilebilirlik için ayrıştırıldı)
  - apps/web/lib/auth/authorize.test.ts # YENİ — 5 test, KK-005 gerçek ölçüm dahil
  - apps/web/lib/auth/tokens.ts # YENİ — signToken/verifyToken, 3 audience, jose HS256
  - apps/web/lib/auth/tokens.test.ts # YENİ — 8 test, çapraz-izleyici reddi dahil
  - apps/web/lib/auth/identity.ts # YENİ — resolveIdentity, 3 kaynak sabit sıra
  - apps/web/lib/auth/identity.test.ts # YENİ — 10 test, KK-010 aynı-userId kanıtı dahil
  - apps/web/app/api/auth/register/route.ts # YENİ — POST, zod doğrulama, argon2id, E11000→409
  - apps/web/app/api/auth/register/route.test.ts # YENİ — 8 test
  - apps/web/app/api/auth/[...nextauth]/route.ts # YENİ — export {GET,POST} from '@/auth'
  - apps/web/app/api/ws/ticket/route.ts # YENİ — POST, resolveIdentity, signToken('ws-ticket')
  - apps/web/app/api/ws/ticket/route.test.ts # YENİ — 3 test, çapraz-izleyici reddi dahil
  - docs/memory/gotchas.md # 4 yeni kayıt (next-auth/next-server ESM, jose/jsdom realm, Next16 middleware export, gitleaks generic-api-key)
  - docs/memory/api-contract.md # yeni 3 uç nokta + tek-çözücü/3-audience notu
  - docs/board/reports/AUTH-001.md

tests:
  {
    added: 68,
    passing: 100,
    web_coverage: '%94.65 ifade · %86.48 dal · %95.34 fonksiyon · %99.07 satır (eşikler 70/65/70/70 — geçti)',
    mutation: 'yok — apps/web mutasyon kapsamında değil (yalnız game-core)',
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

  Dördü de `docs/memory/gotchas.md`'ye eklendi (bu satırlar oradan birebir).

blocked_reason: null

next_suggestions:
  - >
    WS-001 `lib/auth/identity.ts`'teki `resolveIdentity`'i DOĞRUDAN import
    edip WS upgrade route'unda kullanmalı — kimlik çözme mantığını
    yeniden yazmasın (tek çözücü ilkesi, KK-010).
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
```
