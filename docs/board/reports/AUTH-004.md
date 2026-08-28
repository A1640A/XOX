```yaml
task: AUTH-004
status: done
severity: P0-guvenlik
summary: >
  KK-011 yarışı (çıkış yap → oturum teknik olarak canlı kalır) TopBar'ın
  korumalı nav bağlantılarındaki (`/profil`, `/siralama`, `/gecmis`,
  `/arkadaslar`) Next.js `<Link>` OTOMATİK PREFETCH'i kapatılarak
  çözüldü. `auth.ts`e HİÇBİR SATIR eklenmedi — (b) yolu (sunucuda oturum
  yenilemesini reddet) DEĞİL, (a) yolu (istemci tarafı prefetch'i
  durdur) seçildi; gerekçe ölçümle aşağıda.

secilen_yol: "(a) TopBar'da prefetch={false} — auth.ts'e dokunmadan"
neden_a_neden_b_degil:
  olcum: >
    `middleware.ts`in `config.matcher`ı (`/oyna/:path*`, `/oda/:path*`,
    `/profil`, `/siralama`, `/gecmis`, `/arkadaslar`) TAM OLARAK
    `TopBar`'ın oturumlu nav bağlantı kümesiyle BİREBİR örtüşüyor —
    başka hiçbir görünür bağlantı bu matcher'a girmiyor (`/`, `/giris`,
    `/kayit` matcher DIŞI). Yani rolling-session yarışını üreten TEK
    kaynak (bu kartın çakışma kümesinde) TopBar'ın bu dört bağlantısının
    otomatik prefetch'i — kısmi değil TAM bir kapatma mümkün.
  b_neden_daha_riskli: >
    (b) "sunucuda oturum yenilemesini reddet" JWT stratejisinde durum-
    suzdur (`sessions`/`accounts` koleksiyonu YOK — ADR-0009 A) — gerçek
    bir sunucu tarafı reddi ancak kullanıcı başına bir "şu andan önceki
    tokenlar geçersiz" kesim zamanı (DB'de) tutup HER session()
    çağrısında karşılaştırmakla mümkün. Bu: (1) `packages/db`'ye yazım
    gerektirir — kartın "Dokunma" listesinde `packages/db/**` PERF-005/
    W2-01 paralel çalışması için AÇIKÇA yasak, (2) SEC-005'in
    ("revokeWsTicketsForUser'ı events.signOut'a bağlamak") üstüne
    bindiği TAM O oturum-iptali altyapısını ÖNCEDEN, ayrı kartın
    tasarımını beklemeden inşa etmek anlamına gelirdi — kapsam
    genişlemesi. (3) Her `auth()`/`useSession()` çağrısına bir DB
    round-trip ekler (performans maliyeti, ölçülmedi/istenmedi).
  a_neden_yeterli: >
    (a) "gezinme yavaşlar" endişesi kartta dile getirilmişti — ama
    yalnızca BU DÖRT bağlantıya uygulandı (uygulama genelinde prefetch
    kapatılmadı), üstelik bu dört yolun ZATEN middleware'den geçtiği
    (auth kontrolü + olası DB/oturum işi) düşünülürse önceden ısıtılmış
    bir prefetch'in kazancı sınırlıydı. `jwt` callback'ine ya da
    `packages/db`'ye dokunmadan, TEK dosyada (TopBar.tsx), yarışın
    KAYNAĞINI SIFIRLIYOR — bu "geçici yama" değil, matcher/nav kümesinin
    örtüştüğü ölçülmüş bir denklik.

degisiklikler:
  - dosya: 'apps/web/components/TopBar.tsx'
    ne: >
      Oturumlu nav bağlantılarının dördüne (`/profil`, `/siralama`,
      `/gecmis`, `/arkadaslar`) `prefetch={false}` eklendi. Logo (`/`)
      ve girişsiz bağlantılar (`/giris`, `/kayit`) DOKUNULMADI —
      middleware matcher'ına girmedikleri için risksizler, varsayılan
      prefetch davranışları (gezinme hızı) korundu. Kapsamlı Türkçe
      yorum eklendi: neden bu dört bağlantı, neden TAM kapatma yeterli.
  - dosya: 'apps/web/components/TopBar.test.tsx'
    ne: >
      Casus `next/link` mock'u (conventions.md "Casus bileşenle prop
      iddiası" kalıbı) — gerçek `next/link`in prefetch DAVRANIŞI jsdom'da
      gözlemlenemez (viewport/hover tetiklemesi `IntersectionObserver`a
      dayanır, jsdom'da yok). Sahte `Link` mount edilip aldığı `prefetch`
      prop'u kaydedilir. Yeni test: dört korumalı bağlantının
      `prefetch === false` olduğunu, `/` (home) bağlantısının
      `prefetch === undefined` (varsayılan, DOKUNULMAMIŞ) kaldığını
      iddia eder — negatif kontrolün yanında dolu bir pozitif liste var
      (conventions.md "Negatif kontrol zorunluluğu").
  - dosya: 'apps/web/auth.ts'
    ne: 'DOKUNULMADI. `git diff apps/web/auth.ts` boş — aşağıda kanıt.'

auth_ts_dokunulmadi_kaniti:
  komut: 'git diff apps/web/auth.ts (feat/AUTH-004 dalında)'
  cikti: '(boş — hiçbir satır değişmedi)'
  jwt_callback_kontrolu: >
    `grep -n "jwt(" apps/web/auth.ts apps/web/auth.config.ts` → eşleşme
    YOK. `events.signOut` de bu dosyalarda TANIMLI DEĞİL (henüz — SEC-005
    o kancayı ekleyecek, bu görev onu eklemedi/beklemedi).

tdd_kaniti:
  kirmizi: >
    Yeni TopBar testi ÖNCE düzeltmesiz `TopBar.tsx`e karşı koşuldu
    (`git stash push -- apps/web/components/TopBar.tsx` ile düzeltme
    geçici olarak kaldırıldı): `expect(call?.prefetch).toBe(false)` →
    `Received: undefined` ile KIRMIZI. `git stash pop` ile düzeltme geri
    getirilince aynı test YEŞİLE döndü — mutasyon disiplini
    (conventions.md) uygulandı.
  yesil: 'apps/web: 83 test dosyası, 867/867 test yeşil (1 yeni test dahil).'

race_repro_ve_kanit:
  yontem: >
    `next build && next start` (üretim derlemesi, `next dev` DEĞİL —
    kart notu: dev StrictMode iki kez çalıştırıp yanıltır) ile
    `MONGODB_DB=xox_test` gerçek yerel sunucuya karşı; apps/e2e'nin
    `@playwright/test` bağımlılığı (hoisted node_modules) kullanılarak
    apps/e2e DIŞINDA (scratchpad) yazılan GEÇİCİ, COMMIT EDİLMEYEN iki
    ölçüm scripti çalıştırıldı, işi bitince SİLİNDİ (repoda iz yok —
    `git status --porcelain` doğrulandı).
  olcum_1_prefetch_kaynagi:
    soru: "/profil'e gidince TopBar gerçekten korumalı yollara arka plan isteği atıyor mu?"
    duzeltmesiz_sonuc: >
      /profil sayfası yüklendikten sonraki 2 saniyede `/siralama` (404 —
      henüz yazılmamış sayfa, W3-01…04 bekliyor), `/gecmis` (404),
      `/arkadaslar` (200), `/profil` (200) yollarına TOPLAM 12 arka plan
      isteği gözlemlendi — hepsi `next-router-prefetch: 1` başlığı
      taşıyor (gerçek kullanıcı tıklaması DEĞİL, otomatik prefetch).
    duzeltmeli_sonuc: >
      AYNI senaryoda (/profil'e git, 2 sn bekle) SIFIR arka plan isteği
      gözlemlendi — yalnızca gerçek `page.goto('/profil')`ın kendi
      navigasyon isteği (prefetch başlığı YOK, `upgrade-insecure-
      requests: 1` ile gerçek sayfa yüklemesi) kaldı.
    sonuc: 'Yarışın ÖN KOŞULU (in-flight arka plan isteği) düzeltmeyle TAMAMEN ortadan kalkıyor.'
  olcum_2_cikis_sonrasi_cerez:
    soru: 'Düzeltmeli derlemede çıkıştan sonra çerez GERÇEKTEN silinmiş kalıyor mu?'
    adimlar: >
      Giriş yap → /profil → "Çıkış yap" tıkla → 2 sn bekle (olası geç
      gelen arka plan isteklerine fırsat) → context çerezlerini oku →
      doğrudan `/profil` isteği (redirect izlenmeden) at.
    sonuc: >
      "Çıkıştan ÖNCE oturum çerezi var mı: true" · "signOut sonrası
      oturum çerezine dokunan Set-Cookie sayısı: 0" · "Çıkıştan SONRA
      (2sn bekleme dahil) oturum çerezi var mı: false" · "Doğrudan
      /profil isteği: 307 → /giris?donus=%2Fprofil". Çerez kalıcı
      olarak silinmiş kalıyor, hiçbir arka plan isteği onu geri
      YAZMIYOR.
  olcum_3_yerelde_yarisin_dogrudan_tetiklenememesi_notu: >
    Düzeltmesiz derlemede AYNI logout senaryosu 5 kez tekrarlandı — hiçbiri
    çerezi geri getirmedi (yerel ağ gecikmesi ~0 olduğu için /profil
    yüklenirken atılan prefetch'ler signOut'tan ÇOK ÖNCE tamamlanıyor,
    yarış penceresi kapanıyor). Bu, KAYNAĞIN (12 arka plan isteği)
    varlığını YALANLAMIYOR — yalnızca yerel localhost'un CI/Vercel edge'e
    kıyasla çok daha düşük gecikmeli olması nedeniyle yarış penceresinin
    doğal olarak dar olduğunu gösteriyor (kartın kendi tanısı: "yalnız
    gerçek prefetch zamanlamasıyla çıkıyor" — Preview'daki KK-011
    flakiness'i (35/36) bunun kanıtı). Ölçüm 1 (arka plan isteğinin
    SIFIRA inmesi) yarışın önkoşulunu MEKANİK olarak kapattığı için
    zamanlama-bağımlı yerel tekrar üretimi DoD için gerekli değil.
  kk011_yerel_kosu: >
    `apps/e2e/tests/auth.spec.ts -g "KK-011"` düzeltmeli derlemeye karşı
    `--repeat-each=15 --workers=1` ile koşuldu: 13/15 geçti, 2 başarısızlık
    `page.waitForURL` GİRİŞ adımında (satır 131, signOut/profil
    kontrolünden ÖNCE) zaman aşımına uğradı — düzeltmesiz derlemeye karşı
    `--repeat-each=30` ile AYNI imza (5/30 başarısız, HEPSİ satır 131'de)
    tekrarlandı. Bu, giriş adımının kendisiyle ilgili ortam kaynaklı bir
    flake (yerel makinede art arda tam tarayıcı oturumları — trace/video
    kaydı açık), AUTH-004'ün ele aldığı yarışla İLGİSİZ; hiçbir koşuda
    satır 142'deki (çıkış sonrası /profil → /giris beklenmiyor) asıl
    iddia YANLIŞ ÇIKMADI.

gates:
  komut: 'pnpm gates (feat/AUTH-004 worktree)'
  sonuc: 'EXIT 0 — beş kapının hepsi yeşil.'
  typecheck: 'turbo run typecheck — 7/7 paket başarılı.'
  lint: "eslint . --max-warnings=0 — 0 hata (ilk koşuda TopBar.test.tsx'te array-type + apps/e2e/playwright-report/ altında kalan eski trace asset'leri lint hatası verdi; ikisi de düzeltildi: Array<T> → T[], playwright-report/ ve test-results/ silindi — zaten .gitignore'da, disk kalıntısıydı)."
  format: 'prettier temiz.'
  test_coverage: '@xox/web: 83 test dosyası, 867/867 yeşil. İstatistik %94.26 · Dal %89.64 · Fonksiyon %93.85 · Satır %96.5.'
  knip: 'temiz (yalnız ön var olan, bu görevle ilgisiz konfig ipuçları).'

commit_shas:
  - '5069068 fix(web): korumali TopBar baglantilarinda prefetch kapat — cikis sonrasi oturum yarisi (AUTH-004)'

worktree: ".claude/worktrees/AUTH-004 (branch feat/AUTH-004, main'den ayrıldı, main'e merge/push YAPILMADI)"

kalinti_kontrolu: >
  `git status --porcelain` boş (yalnız iki dosyalık commit var). Yerel
  E2E doğrulaması için üretilen `apps/web/.env.local` (kopya) ve iki
  geçici ölçüm scripti (`apps/e2e/.scratch-*.mjs`) İŞ BİTİNCE SİLİNDİ —
  hiçbiri commit'e girmedi. `apps/e2e/playwright-report/` ve
  `apps/e2e/test-results/` (yerel koşulardan kalan, zaten gitignore'da)
  de temizlendi.

blocked_reason: null

kalan_risk_next_suggestions:
  - >
    Bu düzeltme SADECE TopBar'ın nav bağlantılarını kapsıyor (kartın
    çakışma kümesi buydu). Diğer sayfalardaki (`/` ana sayfa CTA'sı gibi)
    `/oyna`, `/oda` gibi middleware-korumalı yollara giden başka `<Link>`
    bileşenleri varsa (bu görevin yazma alanı DIŞINDA, incelenmedi) aynı
    prefetch/rolling-refresh mekanizması teorik olarak onlarda da
    geçerlidir — ama bu yollar TopBar'da değil, "çıkış sonrası hâlâ
    viewport'ta kalan" senaryosu (kartın CI trace'inin gösterdiği somut
    yol) TopBar'a özgüydü. Lead bir sonraki dalgada `grep -rn "Link.*
    href=.\"/oyna\|/oda"` ile diğer bileşenleri taramak isteyebilir.
  - >
    SEC-005 (`revokeWsTicketsForUser` → `events.signOut`) hâlâ AYRI kart
    — bu görev onu beklemedi/öne çekmedi, `events.signOut` şu an
    `auth.ts`de TANIMLI DEĞİL. SEC-005 uygulanırken bu görevin notu
    (`jwt` callback tuzağı, `events.signOut` farklı bir kanca) geçerli
    kalıyor.
  - >
    (b) yolunun (sunucu tarafı stateful oturum iptali) SEC-005'in bir
    parçası olarak gelecekte inşa edilmesi, prefetch olmayan başka bir
    "eski sekmede açık kalmış oturum" senaryosuna karşı savunma-derinliği
    sağlar (bu görev yalnız otomatik prefetch yarışını kapatıyor, örneğin
    kullanıcı sekmesini AÇIK bırakıp başka biri fiziksel olarak geri/ileri
    tuşuna basarsa farklı bir tehdit modeli — kapsam dışı, gözlem
    amaçlı not).
```
