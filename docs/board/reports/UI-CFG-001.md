```yaml
task: UI-CFG-001
status: done
summary: >
  Boyut/K seçici (`BoardConfigPicker`), oyun ayarı özeti (`GameConfigSummary`,
  `oyun-ayari-ozeti`) ve katılma ekranının önizlemesi (`JoinRoomPreview`)
  teslim edildi. Bu kartın merge'ü B0–B3'te hazırlanan protokol/kalıcılık/API/
  tahta/AI zincirini kullanıcıya AÇAR: `HomeActions` artık `POST /api/rooms`e
  gerçek `size`/`winLength` gönderir, `/oda/katil` katılmadan ÖNCE oyun ayarını
  gösterir, `RoomScreen` özet + fark-tabanlı canlı duyuru taşır.

tek_bilesen_kaniti:
  tasarim: >
    `apps/web/components/board-config/BoardConfigPicker.tsx` — repoda TEK
    boyut/K seçici. `HomeActions.tsx` (bu kart) onu doğrudan kullanıyor;
    `enabledSizes` prop'u OPSİYONEL ve verilmezse `BOARD_MODES`'un TAMAMINA
    düşüyor — `UI-COMP-001` (bilgisayara karşı ekran, operasyonel kısıtlama
    olmayan yerel oyun) aynı bileşeni değişiklik yapmadan varsayılanla
    kullanabilir. Kural mantığı (`@xox/game-core`'un donmuş `BOARD_MODES`
    tablosu) bileşende YENİDEN YAZILMADI, yalnız okundu.
  kanit_komutu: 'grep -rln "BoardConfigPicker" apps/web/components apps/web/app'
  kanit_sonucu: >
    Yalnız tanım dosyası (`BoardConfigPicker.tsx`), kendi testi
    (`BoardConfigPicker.test.tsx`) ve TEK tüketici (`HomeActions.tsx`) —
    ikinci bir seçici bileşeni/kopyası YOK.

3_6_11_akisinin_gercek_test_ciktisi:
  komut: 'pnpm --filter @xox/web exec vitest run components/board-config'
  sonuc: '6 test dosyası, 27 test — hepsi yeşil (aşağıda tam koşu log'undan alıntı).'
  ornekler:
    - "'enabledSizes belirtilmezse üç boyutun TAMAMINI gösterir' — tahta-boyut-3/6/11 ÜÇÜ de DOM'da"
    - "'boyut değişince GEÇERSİZ kalan K, o boyutun varsayılanına DÜŞER' — 11×11/K5 → 3×3 seçilince {size:3,winLength:3} (BOARD_MODES.defaultWinLength)"
    - "'mevcut K yeni boyutta hâlâ geçerliyse KORUNUR' — 6×6/K5 → 11×11'de K=5 aynı kalır (winLengths [4,5,6] içeriyor)"
    - "HomeActions.test.tsx → 'picker'da seçilen boyut/K TAM OLARAK POST gövdesine gider' — 11×11/K6 seçilip 'Oda kur'a basınca fetch body === '{\"size\":11,\"winLength\":6}'"

kapali_boyutun_sessizce_dusurulmedigi_kaniti:
  istemci_katmani: >
    `BoardConfigPicker`de `enabledSizes` dışındaki bir `BOARD_MODES` girdisi
    `modes` dizisine hiç GİRMİYOR (`BOARD_MODES.filter(...)`) — dolayısıyla
    kapalı boyutun düğmesi DOM'a hiç yazılmıyor, kullanıcı onu SEÇEMİYOR bile.
    Test: "kapalı bir boyut HİÇ RENDER EDİLMEZ" (`BoardConfigPicker.test.tsx`)
    ve "kapalı (enabledSizes dışı) bir boyut HİÇ RENDER EDİLMEZ" (`HomeActions.test.tsx`,
    `enabledSizes={[3,6]}` iken `tahta-boyut-11` DOM'da yok).
  sunucu_katmani_yarisi: >
    `enabledSizes` `getEnabledBoardSizes()`ten (ADR-0018 kill switch) geldiği
    ve bir redeploy arada boyutu kapatabileceği için istemci TEK savunma hattı
    DEĞİL: `HomeActions.test.tsx` → "sunucu yine de INVALID_BOARD_CONFIG
    dönerse (kill switch yarışı) net bir hata gösterir, sessizce 3×3 KURMAZ" —
    `push` ÇAĞRILMADI, `hata-mesaji` `INVALID_BOARD_CONFIG` metniyle göründü
    (oda YANLIŞ boyutla sessizce kurulmadı, hiç kurulmadı).
  api_route_degismedi: >
    `apps/web/app/api/**`e HİÇ dokunulmadı — `POST /api/rooms`'un
    API-BOARD-001'de yazılmış "kapalı boyut → 400 INVALID_BOARD_CONFIG, oda
    OLUŞTURULMAZ" kapısı olduğu gibi korundu, bu kart yalnız istemcinin o
    kapıyı DOĞRU şekilde tetiklemesini (gerçek seçilen config'i göndermesini)
    ve reddi ANLAMLI göstermesini sağladı.

eski_odanin_33_gorundugunun_kaniti:
  roomscreen: >
    `RoomScreen.test.tsx` → "size/winLength taşımayan eski oda {3,3} olarak
    görünür — 'undefined' sızmaz" — `withState({...})` HİÇBİR `size`/`winLength`
    override'ı OLMADAN çağrılıyor (yani `initialRoomClientState()`'in
    varsayılanı), `oyun-ayari-ozeti` "3×3 tahta · 3 taş yan yana" gösteriyor,
    `textContent` "undefined" İÇERMİYOR.
  joinroompreview: >
    `page.test.tsx` (`/oda/katil`) → "eski (size/winLength taşımayan sunucudan
    zaten {3,3} çözülmüş) oda önizlemesi 'undefined' GÖSTERMEZ" — sunucu
    yanıtı `{size:3, winLength:3}` (yani `resolveBoardConfig`in zaten
    ürettiği çözülmüş değer) ile mockланıyor, özet metninde "undefined" YOK.
  temel_gerekce: >
    `RoomClientState.size`/`winLength` ve `roomStateResponseSchema.size`/
    `winLength` protokolde OPSİYONEL DEĞİL (zorunlu `number`) — `undefined`
    sızma yüzeyi zaten CTR-BOARD-001/API-BOARD-001'de kapatılmıştı, bu kart
    yalnız o garantiyi TÜKETEN render kodunu (`GameConfigSummary`) yazdı ve
    "varsayımı sil, test kırmızı olsun" disipliniyle kanıtladı.

announcements_baglandigi_yer: >
  `apps/web/components/room/status-text.ts` → yeni `liveAnnouncement()`
  fonksiyonu `@/components/board/announcements`'ın (UI-BOARD-001'in BİLEREK
  bağlamadan bıraktığı `moveAnnouncement`/`winningLineAnnouncement`) SAF
  üreticilerini `statusText()`in genel metniyle TEK `durum-metni` canlı
  bölgesinde birleştiriyor (ADR-0017 §7 önceliği: kazanan ÇİZGİ > son HAMLE >
  yalnız durum). `RoomScreen.tsx` artık `durum-metni` içeriğini `statusText`
  yerine `liveAnnouncement` ile dolduruyor. Kanıt: `status-text.test.ts`teki
  yeni `describe('liveAnnouncement — ...')` bloğu (6 test) + `RoomScreen.test.tsx`
  → "durum-metni rakibin son hamlesinin FARKINI sıra metniyle birlikte
  duyurur" ("Rakip 3. satır 5. sütuna oynadı. Sıra sende").

katilma_ekraninin_onizlemesi: >
  `/oda/katil` artık `JoinCodeField` (Home'un hızlı-katıl alanı, DOKUNULMADI)
  DEĞİL, yeni `JoinRoomPreview` kullanıyor: kod 6 haneye ulaşınca otomatik
  `GET /api/rooms/[code]` ile önizleme çekiliyor, `oyun-ayari-ozeti` katılmadan
  ÖNCE gösteriliyor, "Katıl" düğmesi önizleme gelene kadar `disabled`, tıklanınca
  YÖNLENDİRİYOR (SB-09/US-B03). `JoinCodeField.tsx`'e TEK satır bile
  dokunulmadı — Home'un mevcut hızlı-katıl davranışı ve onun kırılgan W1-05
  paste/normalize testleri risk altında değil.

sert_sartlar_karsilastirma:
  - sart: "BoardConfigPicker TEK bileşen"
    durum: karsilandi
  - sart: "Kapalı boyut sessizce 3×3'e düşürülmez"
    durum: karsilandi
  - sart: "size/winLength taşımayan eski odalar {3,3}, undefined sızmaz"
    durum: karsilandi
  - sart: "Katılan oyuncu odaya girmeden önce ne oynayacağını görür"
    durum: karsilandi

bilincli_sapma: >
  Kartın orijinal beklentisi `/oda/katil`in `JoinCodeField`i (W1-04 kriter
  1'in "birebir aynı bileşen" kararı) KULLANMAYA DEVAM ETMESİYDİ, ama
  SB-09/US-B03 (katılmadan önce önizleme) `JoinCodeField`in tek-adımlı
  (doğrula→hemen yönlendir) akışıyla YAPISAL olarak uyuşmuyor. Bu yüzden
  `/oda/katil` kendi önizleme akışına (`JoinRoomPreview`, aynı normalleştirme
  kuralını KENDİ saf fonksiyonunda — `room-code-input.ts` — taşıyan) geçti;
  `JoinCodeField` ve onun kırılgan W1-05 regresyon testleri DEĞİŞMEDEN kaldı.
  Bu, kartın "Çakışma kümen" listesindeki `apps/web/app/oda/katil/page.tsx`nin
  tamamının benim sorumluluğumda olmasıyla tutarlı; `JoinCodeField.tsx` hiç
  açılmadı (`git diff` boş — aşağıda kanıtlanıyor).

degisiklikler:
  - dosya: 'apps/web/components/board-config/BoardConfigPicker.tsx (yeni)'
    ne: 'Boyut+K seçici. BOARD_MODES''tan okur, enabledSizes''i filtreler, boyut değişince geçersiz K''yi mode.defaultWinLength''e düşürür.'
  - dosya: 'apps/web/components/board-config/BoardConfigPicker.test.tsx (yeni)'
    ne: '10 test — enabledSizes filtreleme, K geçişleri, aria-pressed, sabit-K metni.'
  - dosya: 'apps/web/components/board-config/size-label.ts (yeni) + test'
    ne: '3/6/11 → "3×3"/"6×6"/"11×11" TEK türetme noktası (Picker + özet ikisi de kullanır).'
  - dosya: 'apps/web/components/board-config/summary-text.ts (yeni) + test'
    ne: '`oyun-ayari-ozeti` metninin SAF üretimi — tr.boardConfig.summary şablonu.'
  - dosya: 'apps/web/components/board-config/GameConfigSummary.tsx (yeni) + test'
    ne: '`oyun-ayari-ozeti` kancasının TEK render noktası; RoomScreen + JoinRoomPreview ikisi de çağırır.'
  - dosya: 'apps/web/components/board-config/room-code-input.ts (yeni) + test'
    ne: '`JoinRoomPreview`nin kod normalleştirmesi (JoinCodeField''ın davranışıyla AYNI, ayrı dosya — bkz. bilincli_sapma).'
  - dosya: 'apps/web/components/board-config/JoinRoomPreview.tsx (yeni) + test'
    ne: '/oda/katil''in yeni önizleme+katıl akışı. React "render sırasında state ayarlama" deseniyle (react-hooks/set-state-in-effect uyumlu) kod değişince önizleme/hata sıfırlanır.'
  - dosya: 'apps/web/app/oda/katil/page.tsx'
    ne: 'JoinCodeField → JoinRoomPreview.'
  - dosya: 'apps/web/app/oda/katil/page.test.tsx'
    ne: 'Önizleme akışına göre yeniden yazıldı (8 test) — ROOM_NOT_FOUND/ROOM_FULL/GAME_OVER/eski-oda/erken-istek-yok.'
  - dosya: 'apps/web/app/page.tsx'
    ne: 'getEnabledBoardSizes() (RSC) çözülüp HomeActions''a enabledSizes prop olarak geçiyor.'
  - dosya: 'apps/web/app/page.test.tsx (yeni)'
    ne: 'Casus HomeActions ile RSC→client prop akışı kanıtlanıyor (2 test).'
  - dosya: 'apps/web/components/home/HomeActions.tsx'
    ne: 'enabledSizes prop''u zorunlu; BoardConfigPicker eklendi; POST /api/rooms artık gerçek config gövdesiyle gidiyor.'
  - dosya: 'apps/web/components/home/HomeActions.test.tsx'
    ne: '4 yeni test (varsayılan gövde, seçilen config gövdesi, kapalı boyut render edilmez, kill-switch yarışı hatası).'
  - dosya: 'apps/web/components/room/status-text.ts'
    ne: 'liveAnnouncement() eklendi — announcements.ts''i statusText ile birleştirir.'
  - dosya: 'apps/web/components/room/status-text.test.ts'
    ne: '6 yeni test (liveAnnouncement öncelik/birleştirme).'
  - dosya: 'apps/web/components/room/RoomScreen.tsx'
    ne: 'GameConfigSummary + dar-ekran ipucu (size>3) eklendi; durum-metni artık liveAnnouncement kullanıyor.'
  - dosya: 'apps/web/components/room/RoomScreen.test.tsx'
    ne: '4 yeni test (eski-oda {3,3}, gerçek size/winLength özeti, dar-ekran ipucu, hamle duyurusu).'

dokunulmayan_dosyalar_kaniti:
  komut: 'git diff 55a7d68..3475fef --stat -- apps/web/components/JoinCodeField.tsx apps/web/components/board apps/web/components/computer apps/web/app/api packages/shared packages/db apps/web/lib/auth'
  sonuc: '(boş çıktı) — hiçbiri değişmedi.'

pnpm_gates:
  komut: 'pnpm gates'
  sonuc: 'EXIT_CODE=0 — typecheck (7/7 paket) + lint (0 hata/uyarı) + format:check (temiz) + test:coverage + knip (yalnız bilgi ipucu) hepsi yeşil.'
  test_coverage_web: '80 dosya / 819 test — hepsi yeşil. Statements 94.13% · Branches 89.21% · Functions 93.77% · Lines 96.46%.'
  build: 'pnpm --filter @xox/web build → başarılı (Next.js 16.3.2, Turbopack, 20 route derlendi).'

commit_shas:
  - '3475fef feat(web): boyut/K seçici + oyun ayarı özeti + katılma önizlemesi (UI-CFG-001)'

worktree: ".claude/worktrees/UI-CFG-001 (branch feat/UI-CFG-001, main'den ayrıldı, main'e merge/push YAPILMADI)"

blocked_reason: null

next_suggestions:
  - >
    `UI-COMP-001`: `BoardConfigPicker`i `enabledSizes` VERMEDEN (varsayılan
    tüm BOARD_MODES) bilgisayara karşı ekranda kullanabilir — hiçbir API
    değişikliği gerekmiyor.
  - >
    Lead/QA-e2e: gerçek tarayıcıda 3×3→11×11→3×3 boyut geçişlerinde
    `BoardConfigPicker`+`Board` roving-tabindex etkileşimini (bu haftanın
    "büyükten küçüğe geçiş" dersi) uçtan uca doğrulayacak bir Playwright
    senaryosu düşünülebilir — bu görev yalnız birim/entegrasyon seviyesinde.
```
