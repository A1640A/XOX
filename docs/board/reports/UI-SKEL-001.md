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
