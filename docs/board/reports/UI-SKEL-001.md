```yaml
task: UI-SKEL-001
status: done
summary: >
  Web kabuğu uçtan uca teslim edildi: `/`, `/giris`, `/kayit`, `/profil`,
  `/oda/[kod]` render olur; tüm testid'ler `@xox/shared/testids`'ten gelir,
  bileşenlerde string serpiştirilmez. `components/board/Board.tsx` uygulamanın
  TEK tahta bileşenidir — `interactive: boolean` tek girdi kapısıdır, hiçbir
  oyun kuralı bilmez (`@xox/game-core`'u hiç import etmez); X/O ayrımı yalnız
  renkle değil, farklı SVG şekli + stroke kalınlığıyla sağlanır (X: iki
  <line> strokeWidth=5, O: bir <circle> strokeWidth=2.5), `Board.test.tsx`
  bunu DOM yapısı üzerinden kilitler. `components/ErrorBanner.tsx` yalnız
  `data-testid`+`data-kod` yazar, metni `tr.errors[code]`'dan okur — bileşende
  gömülü Türkçe string yok. `lib/client/use-room.ts` `ws-client`+
  `roomClientReducer`'ı `useSyncExternalStore` ile React'e bağlar ve `move`,
  `resign`, `offerRematch`, `acceptRematch`, `sendEmoji`, `reconnect`
  eylemlerinin TAMAMINI dışa verir; dosyada oyun kuralı/uzlaşma mantığı yok
  (yalnız abonelik köprüsü), GERÇEK `roomClientReducer`'a karşı sahte bir
  `SocketLike` ile test edildi (mock yalnız G/Ç sınırında).

  SICAK DOSYA DONDURMA #1: `components/room/RoomScreen.tsx` sonraki dalgaların
  bileşenlerini (`ResultPanel`, `ConnectionBadge`, `TurnTimer`, `EmojiTray`,
  `FriendAddButton`) ŞİMDİDEN mount ediyor; prop sözleşmeleri yazılı, P1/P2
  gövdeleri boş/pasif (`TurnTimer`/`EmojiTray`/`FriendAddButton` `null`
  render eder, `ConnectionBadge`/`ResultPanel` P0 kapsamındaki minimum
  gerçek davranışı taşır — rövanş KK-055…058 §9 tablosunda P0'da olduğu için).

  SICAK DOSYA DONDURMA #2: `app/layout.tsx` `<html data-tema>` yazıyor,
  temayı `lib/theme.ts` (`resolveTheme()`) ile bir çerezden okuyor (oturum
  yoksa/çerez yoksa `'acik'`), `SessionProvider` (`next-auth/react`) burada
  kuruluyor. `@/auth` HİÇBİR dosyada import edilmedi — oturum bilgisi her
  yerde `next-auth/react`'in istemci `useSession()`/`signIn()`/`signOut()`
  API'siyle okunuyor (AUTH-001 ile paralelliği koruyan sözleşme).

  `globals.css` ELLE YAZILMADI: `lib/generate-globals-css.ts`'in
  `@xox/ui-tokens` `cssVariables()`/`themeCss()` çıktısından ürettiği
  içerikle BİREBİR aynı — `app/globals.css.test.ts` bunu dosya okuyup
  desen arayarak DEĞİL, üretilen ARTEFAKTLA (`generateGlobalsCss()`)
  birebir karşılaştırarak doğruluyor. `themeCss()`'in `[data-tema='acik'|
  'koyu']` blokları Tailwind v4 `@theme` bloğunun İÇİNE değil YANINA
  kardeş kural olarak eklendi. `next.config.ts`'e `agentRules: false`
  eklendi (Next 16'nın `apps/web/AGENTS.md`/`CLAUDE.md` otomatik üretimini
  kapatır — üretim `NextConfig.agentRules` anahtarı olarak CANLI doğrulandı,
  `apps/web/node_modules/next/dist/esm/server/config-schema.js` içinde
  `agentRules: z.boolean().optional()`).

  `pnpm gates` temiz (typecheck + lint + format + test:coverage + knip,
  exit 0). `apps/web` kapsamı: satır %94.8, dal %82.8, fonksiyon %88.7,
  ifade %91.6 — eşiklerin (70/65/70/70) üzerinde. 24 test dosyası / 172 test,
  hepsi web'e ait; toplam repo genelinde (`pnpm gates` çalıştırıldığında)
  695 test PASS.
findings:
  - id: GOTCHA-RTL-CLEANUP
    severity: medium
    detail: >
      `@testing-library/react`'in otomatik `afterEach(cleanup)` kaydı test
      çerçevesinin `globalThis.afterEach`'i GÖRMESİNE bağlı; bu repoda
      `vitest.config.ts` `test.globals` KAPALI (her dosya `describe`/`it`/
      `expect`'i `'vitest'`'ten açıkça import ediyor), yani otomatik kayıt
      HİÇ tetiklenmiyor. Kanıt: `vitest.setup.ts`'e elle `afterEach(cleanup)`
      eklenmeden `RoomScreen.test.tsx`'teki ardışık `render()` çağrıları
      DOM'da BİRİKTİ, `getByTestId` "multiple elements found" ile canlı
      olarak çöktü (13 test kırmızı). `docs/memory/gotchas.md`'ye eklenmeye
      değer — bu proje ilk kez birden fazla `render()` çağıran component
      testi yazdı (önceki dalgalarda yalnız route/lib birim testleri vardı).
    fix: >
      `apps/web/vitest.setup.ts`'e `import { cleanup } from
      '@testing-library/react'` + `afterEach(() => { cleanup() })` eklendi.
    status: fixed
  - id: LINT-REFS-RULE
    severity: low
    detail: >
      `eslint-plugin-react-hooks@7` "refs" kuralı, `useRoom`'un ilk taslağında
      render SIRASINDA (`if (clientRef.current === null) { ... }` bloğu render
      gövdesinde) `createRoomWsClient(...)`'a `clientRef`'i OKUYAN bir kapanış
      (`onReauth`) geçirmesini "fonksiyon render sırasında ref'in değerini
      okuyabilir" diyerek reddetti — React'in klasik "lazy ref init" kalıbı
      (React dokümanının kendi önerdiği) bu daha sert kuralla artık YASAK.
    fix: >
      İstemci kurulumu tamamen `useEffect`'e taşındı (mount'ta oluşturulup
      bağlanır, unmount'ta kapatılır); render sırasında `clientRef`e YALNIZ
      event handler/efekt içinden erişiliyor.
    status: fixed
  - id: TYPEDROUTES-NOT-STRICT-ON-ROUTER-PUSH
    severity: info
    detail: >
      Beklenenin aksine `next.config.ts`'teki `typedRoutes: true`,
      `<Link href>` için route'u statik doğruluyor ama `useRouter().push()`
      için `string` argümanını (henüz var olmayan `/oyna/bilgisayar`,
      `/siralama`, `/gecmis`, `/arkadaslar` DAHİL) SORUNSUZ kabul ediyor —
      `tsc --noEmit` VE `next build` ikisi de temiz geçti, `as Route` cast'i
      GEREKSİZ çıktı (lint `no-unnecessary-type-assertion` ile bunu yakaladı).
      TopBar'daki `<Link href="/siralama">` gibi henüz var olmayan rota
      bağlantıları da build'i KIRMADI (typedRoutes yalnız MEVCUT rotalar için
      literal tip üretiyor, olmayan bir rotaya `Link` yazmak derleme hatası
      değil, yalnızca linter/tip güvenliği kazanımı olmuyor demek).
    fix: n/a — talimattaki varsayılan (typedRoutes route olmayanı reddeder)
      gerçeğe karşı yanlışlandı, kod buna göre sadeleştirildi.
    status: info
testid_wiring:
  tahta: components/board/Board.tsx
  hucre_0_8: components/board/Board.tsx (cellTestId, data-tas/data-kazanan/data-bekliyor)
  sira_gostergesi: components/room/RoomScreen.tsx (yalnız data-sira, metin TAŞIMAZ)
  durum_metni: components/room/RoomScreen.tsx (statusText() — status-text.ts)
  oda_kodu: components/room/RoomScreen.tsx
  baglanti_durumu: components/room/ConnectionBadge.tsx
  rakip_adi: components/room/RoomScreen.tsx
  btn_pes_et: components/room/RoomScreen.tsx
  btn_rovans_teklif_kabul: components/room/ResultPanel.tsx
  btn_bilgisayara_karsi_oda_kur_odaya_katil: components/home/HomeActions.tsx + components/JoinCodeField.tsx
  giris_eposta_parola: components/auth/GirisForm.tsx VE components/auth/KayitForm.tsx (spec §2.0 "auth ekranları" ÇOĞUL — iki form da PAYLAŞIR)
  btn_giris: components/auth/GirisForm.tsx
  btn_kayit: components/auth/KayitForm.tsx
  hata_mesaji: components/ErrorBanner.tsx (tek kaynak, her yerde reddir)
mounted_skeletons_in_room_screen:
  - ResultPanel.tsx (P0 — rövanş minimum fonksiyonel, KK-055…058 §9'da P0)
  - ConnectionBadge.tsx (P0 — data-durum sözleşmesi tam, görsel zenginleştirme sonraki dalga)
  - TurnTimer.tsx (P1 — turnDeadline P0'da her zaman null/AS-08, bilerek null render eder)
  - EmojiTray.tsx (P2 — W3-03, null render eder)
  - FriendAddButton.tsx (P2 — W3-04, null render eder)
oyun_kurallari_disaridan: >
  Board.tsx `@xox/game-core` import ETMEZ (grep ile doğrulandı). Kural kararı
  `packages/shared/src/room-client.ts` (roomClientReducer, CTR-002'de bitti)
  ve gelecekteki `apps/web/lib/game/deadlines.ts`/server tarafında kalıyor.
  `status-text.ts` yalnız `TransportStatus`'u (taşıma tipi) metne çevirir,
  hiçbir kazanan/geçerlilik hesaplaması yapmaz.
followups:
  - >
    `/oda/katil` sayfası bu görevin kapsamında DEĞİLDİ (conflictSet'te yok);
    W1-04 "kod normalleştirme ve oda hata yüzeyi" görevi hem bu sayfayı hem
    `JoinCodeField`'ın sertleştirmesini (yapıştırma, karışan karakter uyarısı)
    ekleyecek.
  - >
    `/oyna/bilgisayar`, `/siralama`, `/gecmis`, `/arkadaslar` sayfaları henüz
    YOK — `TopBar`/`HomeActions` bağlantıları şimdiden kuruldu, hedefler
    Dalga 1/3'te (W1-01, W3-01…04) gelecek; o güne dek bu bağlantılar 404
    verir (kartın kabul ettiği geçici durum).
  - >
    `POST /api/rooms` (ROOM-API-001, Dalga 0d) henüz YOK — "Oda kur" düğmesi
    (`HomeActions.tsx`) çağrıyı zaten doğru şemaya (`roomCreateResponseSchema`)
    karşı yapıyor, uç nokta gelince entegrasyon otomatik tamamlanacak.
  - >
    `lib/theme.ts`'teki `THEME_COOKIE` sabiti bilerek export EDİLMEDİ (knip
    "kullanılmayan export" derdi) — W2-02 (profil tema değiştirici) aynı
    çerez adını YENİDEN tanımlamak yerine bu dosyaya `export` ekleyip
    tüketmeli, iki ayrı sabit KOPYALANMAMALI.
  - >
    `/profil` şu an yalnız `useSession()`'dan ad/e-posta okuyor; istatistik
    sayaçları (`istatistik-galibiyet/-maglubiyet/-beraberlik`), ELO ve tema
    değiştirici W2-02'de `GET/PATCH /api/profile` ile eklenecek.
  - >
    `vitest.setup.ts`'e eklenen `afterEach(cleanup)` gotcha'sı
    `docs/memory/gotchas.md`'ye lead/memory-curator tarafından işlenmeli —
    bu repoda component testlerinin (birden fazla `render()` çağrısı yapan)
    İLK örneği bu görevde yazıldı ve boşluk canlı olarak yakalandı.
commits:
  - 'feat(web): tema altyapısı, globals.css üretimi, agentRules kapatma'
  - 'feat(web): paylaşılan bileşenler — Board, ErrorBanner, JoinCodeField, TopBar'
  - 'feat(web): useRoom köprüsü ve RoomScreen iskeleti (dondurma #1)'
  - 'feat(web): ana sayfa, giriş/kayıt/profil sayfaları, layout dondurma #2'
  - 'test(web): RTL afterEach(cleanup) — vitest.setup.ts'
  - 'docs(board): UI-SKEL-001 raporu'
```

---

## İnceleme turu 1/3 — bulgular ve düzeltmeler

```yaml
review_round: 1
blocker_fixed: 1
major_fixed: 6
minor_fixed: 7
commits:
  - '0ed8e67 fix(web): BLOKER — 4401 gecikmesiz sonsuz yeniden bağlanma fırtınası'
  - '9e75585 fix(web): MAJOR — dondurma eksik slotları, pes etme onayı, ARIA duyurusu'
  - '8e7266f fix(web): MAJOR — doğrulanmamış hata gövdesi boş hata şeridine dönüşüyordu'
  - 'f2de41c fix(web): minor — geçerli ARIA grid deseni, TopBar nullish ad, tam token sondası'
fixes:
  - id: BLOCKER-4401-STORM
    detail: >
      `use-room.ts`'nin `onReauth`'ı `attempt`i yok sayıp anında `connect()`
      çağırıyordu. Artık `nextReconnectDelay(attempt, rng)` kadar tek bir
      `setTimeout` ile bekler; `MAX_REAUTH_ATTEMPTS=5` aşılırsa `client.close()`
      ile pes eder (`connection:'kopuk'`, `lastError` zaten `'UNAUTHENTICATED'`).
      İstemci kurulumu render sırasından `useEffect`'e taşındı ve efekt artık
      `roomCode`'a bağımlı (önceden `[]` idi — aynı dinamik segment içinde
      istemci-taraflı gezinmede roomCode değişse de eski soket AÇIK kalıyordu).
    sonda_output: >
      `use-room.test.tsx` "her 4401 kapanışında nextReconnectDelay kadar
      bekler, 5 denemeden sonra pes edip kopuk kalır": 6 soket açıldı (1 ilk
      bağlantı + 5 backoff'lu yeniden deneme; her biri `nextReconnectDelay(0..4,
      rng=0.5)`'ten hesaplanan gecikmeyle — 500/1000/2000/4000/8000 ms), 6.
      kapanışta (`attempt=5`) `MAX_REAUTH_ATTEMPTS`'i AŞTIĞI için 7. soket
      AÇILMADI; nihai durum `connection:'kopuk'`, `lastError:'UNAUTHENTICATED'`.
      Düzeltmeden ÖNCE aynı test (geçici olarak eski davranışa döndürülüp)
      `expected [...] to have a length of 1 but got 2` ile İLK backoff
      penceresinde bile kırmızıydı — sonda canlı doğrulandı, vacuous değil.
    tests_added:
      - "use-room.test.tsx > 'her 4401 kapanışında...pes edip kopuk kalır'"
      - "use-room.test.tsx > 'unmount bekleyen reauth zamanlayıcısını iptal eder'"
  - id: MAJOR-GETSERVERSNAPSHOT
    detail: >
      `getServerSnapshot` her çağrıda `initialRoomClientState()` ile YENİ bir
      nesne üretiyordu; `useSyncExternalStore` üçüncü argümanın referans
      kararlılığını şart koşar. Modül-düzeyi dondurulmuş tek `SERVER_SNAPSHOT`
      sabitine geçildi.
    sonda_output: >
      `use-room.test.tsx` "hydrateRoot sırasında 'getServerSnapshot should be
      cached' uyarısı ÜRETMEZ": gerçek `renderToString` + `hydrateRoot` +
      `console.error` casusuyla PASS. Düzeltmeden ÖNCE (geçici geri alma ile)
      aynı test `expected true to be false` ile KIRMIZIYDI — React'in tam
      "should be cached to avoid an infinite loop" uyarısını bastığı canlı
      doğrulandı.
  - id: MAJOR-ROOMCODE-DEPENDENCY
    detail: >
      Efekt bağımlılığı `[]` idi (`eslint-disable-next-line exhaustive-deps`
      ile susturulmuştu). Artık `[roomCode]` — kod değişince eski soket kapanır,
      yeni koda bağlı soket açılır.
    sonda_output: >
      `use-room.test.tsx` "roomCode değiştiğinde eski soketi kapatıp yeni koda
      bağlı bir soket açar": `ABC234`→`XYZ789` `rerender`'ında ilk soket
      `closed=true`, ikinci `createSocket` çağrısının URL'i `XYZ789` içeriyor
      `ABC234` içermiyor. Düzeltmeden önce `expected false to be true` ile
      KIRMIZIYDI (soket sayısı 1'de kalıyordu).
  - id: MAJOR-ROOMSCREEN-FROZEN-SLOTS
    detail: >
      RoomScreen.tsx (a) "Kodu kopyala"yı (P0, kendi kapsamı) hiç render
      etmiyordu, (b) `graceEndsAt`/`serverOffsetMs`'i hiçbir çocuğa
      geçirmiyordu (W2-01 dosyayı açmak zorunda kalacaktı), (c) davet linki
      için hiçbir slot yoktu (W3-03 dosyayı açacaktı). Üçü de eklendi:
      `CopyButton.tsx` (P0, gerçek çalışıyor), `OpponentLeftBanner.tsx` +
      `InviteLink.tsx` (iskelet, GERÇEK state alanlarına bağlı mount edildi).
    tests_added:
      - CopyButton.test.tsx (2 test)
      - OpponentLeftBanner.test.tsx, InviteLink.test.tsx (1'er test)
      - "RoomScreen.test.tsx > 'DONDURMA #1 sözleşmesi: iskelet bileşenler
        gerçek state alanlarına bağlı mount edilir'"
  - id: MAJOR-RESIGN-CONFIRM
    detail: >
      `btn-pes-et` doğrudan `actions.resign()` çağırıyordu (KK-054 onay ister).
      `window.confirm(tr.room.resignConfirm)` eklendi.
    sonda_output: >
      "btn-pes-et yalnız window.confirm ONAYLANDIĞINDA actions.resign çağırır":
      `confirm` reddedilince `resign` HİÇ çağrılmıyor, onaylanınca çağrılıyor.
  - id: MAJOR-ERROR-BODY-VALIDATION
    detail: >
      `HomeActions.tsx` sunucu hata gövdesini `as Partial<ErrorResponse>` ile
      cast ediyordu (KayitForm.tsx'teki doğru deseni atlamıştı) —
      `errorResponseSchema.safeParse` eklendi. `ErrorBanner.tsx`'e de ikinci
      savunma katmanı eklendi (`tr.errors`'ta karşılığı olmayan kodda boş
      render etmez, `SERVER_ERROR`'a düşer).
    tests_added:
      - "HomeActions.test.tsx (yeni dosya, 6 test) — enum dışı/şemasız 504
        gövdesi SERVER_ERROR'a düşüyor, boş render OLMUYOR"
      - "ErrorBanner.test.tsx > 'tr.errors içinde karşılığı olmayan bir kodda
        BOŞ render etmez'"
  - id: MAJOR-SIGNIN-UNDEFINED
    detail: >
      `next-auth@5.0.0-beta.32`'nin `signIn`'i tipte `SignInResponse` vaat eder
      ama kaynağında (`getProviders()` null dönerse) `undefined` de dönebilir;
      `try/catch` yoktu, `result.error` TypeError fırlatınca `setPending(false)`
      hiç çalışmıyordu (düğme sonsuza dek `disabled`). `GirisForm.tsx` ve
      `KayitForm.tsx`'e `try/catch/finally` (NETWORK) + `result===undefined`
      koruması eklendi (`HomeActions.tsx`'teki desen kopyalandı).
    tests_added:
      - 'GirisForm.test.tsx: signIn undefined / signIn reddedilir — ikisinde
        de hata gösterilir VE düğme disabled KALMAZ'
      - 'KayitForm.test.tsx: aynı iki senaryo + enum dışı 504 gövdesi'
  - id: MINOR-ARIA-ROW
    detail: >
      `role=\"grid\"` doğrudan `role=\"gridcell\"` çocuklarıyla — geçersiz ARIA
      (aradaki `role=\"row\"` eksikti). Her satır `role=\"row\"` + `contents`
      (görsel grid-cols-3 bozulmadı) ile sarıldı.
  - id: MINOR-ARIA-LIVE
    detail: 'durum-metni artık `role="status" aria-live="polite"` taşıyor — sıra değişimi ve sonuç ekran okuyucuya duyuruluyor.'
  - id: MINOR-YOU-NULL
    detail: >
      `you===null` iken `opponent` sessizce `players.X`'e düşüyordu (ilk
      `state`'ten önce düşen `opponent:joined` senaryosunda kullanıcı kendi
      adını "rakip" görürdü). Artık `you===null` iken `opponent=null`.
  - id: MINOR-TOPBAR-NULLISH
    detail: "`session.user.name` nullish ise rozet boş render ediliyordu; `HomeActions.tsx`'teki email yedeği kopyalandı."
  - id: MINOR-DEAD-RECONNECT-API
    detail: "`actions.reconnect` hiçbir yere bağlı değildi; `ConnectionBadge`'e `onRetry` eklendi, yalnız `'kopuk'`da 'Tekrar dene' gösterilir."
  - id: MINOR-GLOBALS-CSS-PARTIAL-CHECK
    detail: >
      İkinci test yalnız `playerX`/`playerO`'yu doğruluyordu; artık
      `themes.acik/koyu`'nun TÜM anahtarları döngüyle doğrulanıyor. Canlı
      sondayla (`--color-bg` satırı silinerek) regresyonu yakaladığı doğrulandı.
  - id: MINOR-ROOMSCREEN-TEST-BODY-NOT-PROPS
    detail: >
      `RoomScreen.test.tsx` dondurmanın PROP YÜZEYİ sözleşmesini hiç
      iddia etmiyordu. İskelet bileşenler (`TurnTimer`, `EmojiTray`,
      `FriendAddButton`, `OpponentLeftBanner`, `InviteLink`) `vi.mock` ile
      casus bileşenlere çevrildi; aldıkları prop'lar `toStrictEqual` ile
      iddia ediliyor.
  - id: MINOR-STRICTMODE
    detail: >
      Hiçbir test `<StrictMode>` altında koşmuyordu (`reactStrictMode:true`).
      Baseline `setup()`'a `wrapper: StrictMode` eklendi — mount çift
      çalışsa da TEK soket açık kaldığı artık mekanik olarak kilitli.
gates_after_fixes:
  exit_code: 0
  web_tests: 213 (30 dosya)
  web_coverage: { statements: 93.34, branches: 85.22, functions: 92.42, lines: 96.25 }
new_gotcha_discovered:
  id: USEREVENT-CLOBBERS-CLIPBOARD-STUB
  detail: >
    `@testing-library/user-event`'in `setup()`'ı KENDİ `navigator.clipboard`
    sahtesini kurar ve `beforeEach`te (yani `userEvent.setup()`'tan ÖNCE)
    tanımlanan bir `Object.defineProperty(navigator,'clipboard',...)` stub'ını
    SESSİZCE EZER — canlı doğrulandı: `beforeEach`te tanımlanan mock ile
    `render()` sonrası okunan `navigator.clipboard.writeText` referansı
    (`===` karşılaştırması) FALSE çıktı, `writeText` hiç çağrılmadı (0 call).
    Çözüm: clipboard stub'ı HER testte `userEvent.setup()` ÇAĞRISINDAN SONRA
    kurulmalı (bkz. `RoomScreen.test.tsx`'teki `stubClipboard()` yardımcı
    fonksiyonu — `beforeEach` yerine test gövdesinde, `userEvent.setup()`'tan
    sonra çağrılıyor). `CopyButton.test.tsx` bu tuzağa hiç düşmedi çünkü
    `fireEvent.click` kullanıyor (userEvent değil).
```
