# AUTH-003 — preview E2E'de iki auth akışı kırmızı

## Özet (TL;DR)

| Test                                                                                         | Lead'in briefindeki iddia                              | Gerçek kök neden                                                                                                                                                                                                                                                                       | Sınıf                                            |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `auth.spec.ts:121` KK-011 (çıkış yap)                                                        | çerez silinmiyor olabilir                              | **DOĞRULANDI — gerçek ürün hatası.** Çıkış (`signOut`) çerezi doğru siliyor, ama `TopBar`'ın arka planda önceden başlattığı (Next.js `<Link>` prefetch) bir istek GEÇ CEVAP VERİP çıkıştan SONRA gelirse, o isteğin "rolling session" yenileme çerezi geçerli oturumu GERİ DİRİLTİYOR. | **blocker**                                      |
| ~~`auth-register.spec.ts:18` KK-001~~ → gerçekte **`session-persistence.spec.ts:13` KK-006** | brief bu testi `auth-register.spec.ts` olarak gösterdi | **Brief'te dosya yanlış atıflanmış — gerçek CI logunda KK-001 HER İKİ koşuda da YEŞİL.** Asıl kırmızı `session-persistence.spec.ts` KK-006; kök neden test artefaktı (bkz. altında).                                                                                                   | **düzeltildi** (bu görev kapsamında, `apps/e2e`) |

**Önemli düzeltme lead'e:** Task brief'indeki "ikinci kırmızı `auth-register.spec.ts:18` KK-001, `getByRole('main').getByText(...)`" ifadesi **gerçek CI çıktısıyla eşleşmiyor**. İki gerçek CI koşusunu da (`gh run view --log-failed`) doğrudan okudum: KK-001 (`auth-register.spec.ts`) HER İKİ koşuda da **✓ yeşil**. Hatanın tam metni (`getByRole('main').getByText('Test Oyuncu 1') → element(s) not found`) gerçekte **`session-persistence.spec.ts:13` KK-006**'ya ait. Muhtemelen kopyala-yapıştır sırasında dosya karıştı. Bu raporun geri kalanı gerçek kök nedenlere dayanıyor.

## Kanıt zinciri — nasıl doğrulandı

Preview'a karşı kendim yeni bir koşu tetikleyemedim (workflow yalnız `deployment_status` ile tetikleniyor, `workflow_dispatch` yok; görev talimatı zaten "merge/push yok" diyor). Bunun yerine **gerçek GEÇMİŞ CI koşularının** `gh run view --log-failed` çıktısını ve **playwright-report artifact'ının içindeki gerçek trace/network kayıtlarını** (`gh api .../artifacts/<id>/zip` ile indirip açtım) adli düzeyde inceledim:

- Run `33064369984` (branch `chore/size-limit-yorum-duzeltme`, head `5bd8edb` — **bu commit `main`'de**, preview `https://xox-aa6x03gly-omeerdursunn.vercel.app`): **34 geçti / 2 kaldı** — lead'in bahsettiği koşu tam olarak bu. Kırmızılar: KK-011 (3/3 deneme kırmızı) + KK-006 (3/3 deneme kırmızı). KK-001 dahil auth-register.spec.ts **yeşil**.
- Run `33063968305` (aynı branch, önceki deploy `f8a07a1`, preview `https://xox-pxsv28t92-omeerdursunn.vercel.app`): KK-006 **yine kırmızı** (2/2 — cross-run tekrarlanabilirlik kanıtı, flaky DEĞİL). KK-011 bu koşuda **geçti** (aşağıda açıklanan yarışın zamanlamaya bağlı olması bununla tutarlı). Bu koşuda ayrıca KK-007 ve WS smoke testleri de kırmızıydı ama bunlar OPS-008 bypass-header zincirinin (`f8a07a1`→`5bd8edb` arası) henüz tamamlanmadığı ARA bir deploy'a ait — 10:45 koşusunda (stabil durum) tamamen yeşiller, konumuzla ilgisiz gürültü.

### KK-006 — gerçek erişilebilirlik ağacı (error-context.md, CI artifact'ından)

```
- main:
  - heading "Profil" [level=1]
  - button "Çıkış yap"
  - paragraph: e2e1@xox.test
  ...
  - text: Görünen ad
  - textbox "Görünen ad": Test Oyuncu 1     ← AD BURADA, DOĞRU DEĞERLE
  - button "Kaydet"
```

`contextB` (kapatılıp yeniden açılan) `/profil`'e 200 ile ulaşıyor, doğru kullanıcı verisini (`Test Oyuncu 1`) gösteriyor — **oturum sürekliliği ÇALIŞIYOR**. Tek sorun: bu ad artık bir `<input value="Test Oyuncu 1">` içinde, düz metin değil. Playwright'ın `getByText()`'i bir `<input>`'ın `value` özniteliğini asla eşleştirmez (DOM metin düğümü değildir) — test hep yanlış tekniği kullanıyordu.

**Git tarihçesi bunu doğruluyor:**

- `cb4fc22` (2026-08-25 01:39) — `ProfileContent.tsx` ilk sürümü: `<p>{session.user.name}</p>` (düz metin).
- `0b1f397` (2026-08-25 03:23) — `session-persistence.spec.ts` YAZILDI, o anki `<p>` metnine karşı gerçek preview'da yeşildi.
- `5a73009` (2026-08-26 02:51) — "profil sayfasına ad düzenleme" kartı `<p>{session.user.name}</p>`'i `EditNameForm`'un düzenlenebilir `<input>`'ıyla DEĞİŞTİRDİ. Bu commit'ten beri `main`'deki `/profil`'de ad **hiçbir yerde düz metin olarak görünmüyor** (nav'daki link hariç, o da `main` dışında/banner'da — test zaten bunu `getByRole('main')` ile kasıtlı dışlıyor).
- Sonuç: KK-006, `5a73009`'dan bu yana preview'da **hiç çalışmıyordu**, kimse fark etmemiş (unit testler `ProfileContent.test.tsx` muhtemelen mock session kullanıyor, bu path'i sınamıyor).

**Düzeltme (bu görevde, `apps/e2e` sınırım içinde):** `apps/e2e/tests/session-persistence.spec.ts` — iddia `getByText(name)` yerine `getByLabel('Görünen ad')`'a (input) `toHaveValue(name)` oldu. KK-006'nın asıl amacı (ikinci context'in doğru kullanıcı verisini hidratladığını kanıtlamak) korunuyor, yalnız doğrulama tekniği güncel DOM biçimine uyarlandı. `pnpm --filter @xox/e2e exec tsc --noEmit`, `eslint`, `prettier --check` temiz. **`apps/web`'e hiç dokunulmadı.**

### KK-011 — gerçek ağ izi (network trace, CI artifact'ından) — GERÇEK GÜVENLİK HATASI

`SEC-003` önce elendi: `git show e46bd1b -- apps/web/lib/auth/identity.ts` diff'i yalnız `options.allowTicket === true` bloğunu (satır 93-118, WS bileti dalı) değiştiriyor. Çerez/oturum dalı (satır 87-91, `const session = await auth(); ...`) **tek karakter bile değişmemiş**. SEC-003 elendi.

Trace'i (`gh api repos/.../artifacts/<id>/zip`) indirip Playwright'ın `*.network` dosyalarını ham JSON olarak ayrıştırdım (her giden isteğin gerçek `Cookie` başlığı + her gelen yanıtın gerçek `Set-Cookie` başlığı, milisaniye zaman damgasıyla). Kronolojik sıra (gerçek zaman damgaları, `_rsc=` olan istekler Next.js'in arka plan prefetch'leri, olmayanlar `page.goto()`'nun gerçek doküman navigasyonları):

```
t=29.060  GET /profil?_rsc=...        (TopBar Link prefetch, ESKİ geçerli çerezle başladı)
t=29.062  GET /arkadaslar?_rsc=...    (aynı prefetch dalgası)
t=29.174  POST /api/auth/signout      (kullanıcı "Çıkış yap"a tıkladı)
t=29.372  ← signout YANITI geldi: Set-Cookie: __Secure-authjs.session-token=; Max-Age=0  ✓ DOĞRU
t=29.374  GET /  (signOut'un window.location.href='/' navigasyonu — Cookie header'ında session-token YOK ✓ TEMİZ)
t=29.542  ← 29.060'ta başlayan ESKİ prefetch'in YANITI GEÇ GELDİ:
             Set-Cookie: __Secure-authjs.session-token=eyJ...  (YENİ, geçerli, "rolling session" yenilemesi)
             → bu Set-Cookie tarayıcının çerez kavanozuna YAZILDI, 29.372'deki silmeyi GERİ ALDI
t=29.862  GET /profil (page.goto('/profil') — Cookie header'ında session-token YENİDEN VAR)
             → sunucu 200 döner, tam profil içeriği render eder → test kırmızı
```

**Kök mekanizma:** `TopBar` her kimliklendirilmiş sayfada `/profil`, `/arkadaslar`, `/siralama`, `/gecmis`'e `<Link>` render ediyor; Next.js App Router bu linkleri varsayılan olarak **arka planda prefetch eder** (RSC veri isteği). Bu uygulamada oturumlu HER istek yanıtı Auth.js'in "rolling session" davranışıyla **yeni bir `session-token` çerezi yeniden yazıyor** (istek anında oturum geçerliyse). `ProfileContent.tsx`'teki `signOut({callbackUrl:'/'})` çağrısı `fetch(POST /signout)` ile çerezi doğru temizliyor, ARDINDAN `window.location.href` ile yönlendiriyor — ama sayfada ZATEN uçuşta olan (kullanıcı tıklamadan ÖNCE TopBar tarafından başlatılmış) prefetch istekleri iptal edilmiyor. Bu isteklerden biri signout'un yanıtından SONRA tamamlanırsa, kendi "rolling session" Set-Cookie'si silme işlemini **sessizce geri alıyor**. Sonuç: kullanıcı "Çıkış yap"a bastığını, `/`'a yönlendirildiğini görüyor ama oturumu TEKNİK OLARAK hâlâ canlı — `/profil`'e elle gidince hâlâ içeride.

Bu **flaky değil** — zamanlamaya bağlı bir yarış ama TopBar'ın HER kimliklendirilmiş sayfada aynı prefetch'leri başlatması nedeniyle preview/production'da sistematik olarak yüksek olasılıkla tetikleniyor (10:45 koşusunda 3/3, başka bir deploy'da 10:39'da 1/1 geçti — muhtemelen o koşuda prefetch'ler signout'tan önce tamamlanacak kadar hızlıydı). **Paylaşılan bir cihazda bu gerçek bir hesap devralma riskidir** — lead'in vurguladığı güvenlik endişesi doğrulandı.

**Bu benim yazma sınırımın (`apps/e2e`, `docs/board/reports`) dışında — düzeltmedim.** Şüpheli dosyalar (yeni bir kart için):

- `apps/web/components/TopBar.tsx` — kimliklendirilmiş nav linkleri varsayılan prefetch ile render ediliyor; olası düzeltme: bu linklere `prefetch={false}` ya da signOut çağrılırken bekleyen prefetch'leri iptal etmek.
- `apps/web/components/profile/ProfileContent.tsx` (`signOut({callbackUrl:'/'})` çağrı noktası) — olası düzeltme: `signOut` öncesi `router.refresh()`/tüm bekleyen fetch'leri `AbortController` ile iptal, ya da signOut sonrası çerezi TEKRAR MongoDB/versiyon tabanlı bir oturum-iptal listesiyle (session versioning) sunucu tarafında geçersiz kılmak — yalnız istemci çerez yarışına güvenmemek.
- `apps/web/auth.ts` — "rolling session" davranışının HER istekte (değil yalnızca `updateAge` eşiğinde) çerezi yeniden yazıp yazmadığını doğrulamaya değer; eşiği genişletmek yarış penceresini daraltır ama KÖKÜ çözmez (sunucu tarafı iptal listesi asıl çözüm).

## Ayrı, acil bulgu: bypass secret'ı CI artifact'ına sızıyor

Trace incelemesi sırasında **`VERCEL_AUTOMATION_BYPASS_SECRET`'ın ham değerinin** Playwright'ın `*.network` trace dosyalarında düz metin `x-vercel-protection-bypass` istek başlığı olarak kaydedildiğini, bunun da `playwright-report` artifact'ı (GitHub Actions "Artifacts" sekmesinden reponun herhangi bir okuma erişimi olan herkesin indirebileceği) içinde **7 gün saklandığını** gördüm. Repo public (`CLAUDE.md` kural #3) — bu, Vercel Deployment Protection'ı (SSO duvarı) etkisiz kılan bir sızıntı: bu artifact'ı indiren biri bypass secret'ını çıkarıp TÜM preview'lara SSO'suz erişebilir. Bu raporda değeri REDAKTE ettim, hiçbir yerde tam değeri yazmadım. **Bu AUTH-003'ün kapsamı dışında ama P0/blocker düzeyinde ayrı bir güvenlik kartı gerektirir** (muhtemel çözüm: CI job'ında trace'i `retain-on-failure` yerine hassas başlığı redakte eden bir post-processing adımı eklemek, ya da secret'ı düzenli rotate etmek, ya da workflow'da `actions/upload-artifact`'tan önce trace zip'lerindeki bu başlığı temizlemek).

## Sonuç / lead'e dönüş

1. **KK-011 kök nedeni:** test artefaktı DEĞİL — gerçek ürün hatası (**blocker**). Çıkış işlemi çerezi doğru temizliyor ama TopBar'ın arka plan prefetch'leriyle yarışıyor; geç gelen bir prefetch yanıtı "rolling session" çerezini geri yüklüyor. `apps/web` değişikliği gerekiyor (yukarıdaki şüpheli dosyalar) — benim yazma sınırımın dışında, düzeltmedim.
2. **SEC-003 elendi** — kanıt: `git show e46bd1b` diff'i yalnız WS bileti dalına dokunuyor, çerez dalı değişmemiş.
3. **Çerez gerçekten siliniyor mu?** EVET, signout yanıtı doğru `Max-Age=0` gönderiyor — sorun silme değil, SONRASINDA bir başka yanıtın onu GERİ YAZMASI (yarış).
4. **İkinci kırmızı `auth-register.spec.ts` DEĞİL** — brief'te dosya yanlış atıflanmış. Gerçek ikinci kırmızı `session-persistence.spec.ts` KK-006, kök nedeni **test artefaktı** (input value vs text content) — **düzelttim**, `apps/e2e/tests/session-persistence.spec.ts`, commit bekliyor (aşağıda).
5. **36/36 çıktısı vermedim** — KK-006 düzeltmesi statik olarak doğru (tsc/eslint/prettier temiz, gerçek CI'ın erişilebilirlik ağacına dayanıyor) ama canlı preview'a karşı YENİDEN ÇALIŞTIRAMADIM (workflow yalnız `deployment_status` ile tetikleniyor, elimde push/merge yetkisi yok, bypass secret'ını API üzerinden çekmek izin sistemi tarafından engellendi — bkz. yukarıdaki sızıntı bulgusu, o değeri KULLANMADIM). Lead bir sonraki preview deploy'unda bu testi çalıştırıp doğrulamalı. KK-011 zaten `apps/web` düzeltmesi olmadan YEŞİL OLAMAZ.
6. **Commit SHA'ları:**
   - `SEC-003` (elenen şüpheli): `e46bd1bfcfed8786d98be31f4b991d225408fd2c`
   - KK-006'yı kıran regresyon: `5a7300920317ad70e0286a21069e2d2991c70123` ("profil sayfasına ad düzenleme…")
   - KK-006 testinin yazıldığı (o zamanki `<p>` metnine karşı yeşil): `0b1f397050a62420b8fcd1645d848813239e8302`
   - Referans CI koşuları: run `33064369984` (head `5bd8edbd43e5f16c424b47f3098b08114cd91e40`, main'de), run `33063968305` (head `f8a07a1b9253a27c1a29d42c8426c1257d832c5c`)
   - Bu görevin düzeltmesi: worktree `feat/AUTH-003`, henüz commit edilmedi — aşağıda commit atılacak.

## Değiştirilen dosyalar

- `apps/e2e/tests/session-persistence.spec.ts` — KK-006 iddiası `getByText` → `getByLabel(...).toHaveValue(...)`.
- `apps/web/**`, `packages/**` — **dokunulmadı.**
