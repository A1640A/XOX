# PLAN-001 — Görev panosu üretildi

- **Tarih:** 2026-08-24
- **Agent:** `xox-planner`
- **Girdi:** SPEC-001 · ARCH-001 · ADR-0001…0009 · `docs/board/README.md` · `gotchas.md` (35 kayıt)
- **Çıktı:** `docs/board/board.json` (33 yeni kart) · `docs/plans/2026-08-24-oyun-dalga-plani.md`

---

## Ne üretildi

| Ölçü                    | Değer                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Yeni kart               | 33 (+ mevcut `OPS-001` korundu, dokunulmadı)                                                          |
| Dalga                   | 12: `0a 0b 0c 0d 0e 1 1q 2 2q 3 3q 4`                                                                 |
| Kritik yol              | `CTR-001 → DB-001 → DB-002 → WS-001 → E2E-001` — beş halka, korundu                                   |
| Dalga başına azami kart | 4                                                                                                     |
| Kabul kriteri kapsaması | 88/88 (KK-102/103 iptal · KK-093 manuel · KK-100 OPS-001'e bağlı)                                     |
| Ajan dağılımı           | backend 6 · realtime 6 · web 5 · qa-e2e 7 · core 2 · designer 2 · devops 3 · mobile 1 · test-writer 1 |

**Önerilen ilk dalga: 0a — `CTR-001` ‖ `UI-001` ‖ `OPS-002` ‖ `RT-PROBE-001`** (dördü de `deps: []`).

---

## Mimarın taslağından sapmalar ve gerekçeleri

Teknik tasarım §12'deki dalga bölümlemesi **temel alındı**; dört yerde daraltıldı:

1. **`CTR-001` ikiye bölündü** → `CTR-001` (şemalar/sabitler/testid'ler) + `CTR-002` (saf reducer +
   WS taşıması). Gerekçe: tek kartta 9 yeni dosya + reducer'ın 12 davranış kuralı bir oturuma
   sığmaz. `CTR-002` 0b'de `DB-001` ile **paralel** gider → dalga sayısı artmadı.
2. **`DB-001` ikiye bölündü** → `DB-001` (modeller + 11 indeks + seed) + `DB-002` (otoriter
   geçişler + barrel). `AUTH-001` yalnız `DB-001`'e bağlı olduğu için `DB-002` ile paralel gider →
   kritik yol yine beş halka.
3. **Metin ağacı `UI-001`'den ayrıldı** → `TXT-001`. Gerekçe: tasarım §2.3 "`tr.errors` ↔ `ErrorCode`
   uyum testi UI-001'de" diyor ama `UI-001` 0a'da `CTR-001` ile **paralel** — o test o dalgada
   yazılamaz. `TXT-001` 0b'ye alındı, `CTR-001`'e bağlandı, test artık yazılabilir.
4. **REST oda uçları `WS-001`'den ayrıldı** → `ROOM-API-001` (0d, paralel). `identity.ts` ve
   `/api/ws/ticket` `AUTH-001`'e taşındı ki iki 0d kartı da aynı kimlik çözücüyü kullansın ve
   `WS-001` yalnız gerçek zamanlı katmana odaklansın.

Ayrıca **`W1-04`'ün çakışma kümesinden `packages/db/src/rooms/create.ts` çıkarıldı**: kod çakışma
yeniden denemesi (KK-035/036) `DB-002`'de bitiyor, `W1-04` yalnız istemci yüzeyine bakıyor.
Mimarın taslağında bu dosya iki karttaydı.

---

## Planın çözdüğü üç gizli çakışma

Tasarımda işaretlenmemiş, ama gece yarısı merge cehennemi üretecek üç sıcak dosya bulundu:

1. **`apps/web/components/room/RoomScreen.tsx`** — `W1-02` (ResultPanel), `W1-03`
   (ConnectionBadge), `W2-01` (TurnTimer), `W3-03` (EmojiTray), `W3-04` (FriendAddButton)
   bileşenlerini mount etmek için hepsinin bu dosyaya dokunması gerekirdi.
   **Çözüm:** `UI-SKEL-001` beş bileşeni iskelet olarak oluşturur ve `RoomScreen`'e **şimdiden**
   mount eder. Handler kayıt defteriyle aynı hile.
2. **`packages/db/src/index.ts`** — Dalga 3'te dört kart aynı anda export eklemek isterdi.
   **Çözüm:** `DB-002` `rooms/` barrel'ını, `elo.ts`'i ve `queries/*`'ı tipli iskelet olarak
   şimdi oluşturur ve dışa verir; dosya donar.
3. **`apps/web/package.json`** — `apps/web` bugün yalnız `@xox/db`'ye bağımlı. `@xox/shared`,
   `@xox/ui-tokens`, `next-auth`, `zod`, `jose`, `@node-rs/argon2`, `mongodb`,
   `@vercel/analytics` yok. 0c'de `AUTH-001` ve `UI-SKEL-001` ikisi de eklemek zorunda kalırdı ve
   ayrı worktree'lerde bağımlılık olmadan typecheck geçmezdi.
   **Çözüm:** `OPS-002` hepsini 0a'da ekler; kullanılmayanlar `knip.json` `ignoreDependencies`'e
   yazılır. **Deneyle doğrulandı:** knip gereksiz ignore girdisi için yalnız "Configuration hint"
   basar, **exit 0** verir — `pnpm gates` kırılmaz.

Ayrıca `apps/web/lib/realtime/timers.ts` no-op iskeleti `WS-001`'e eklendi ki `W2-01` süre
zamanlayıcısı için `connection.ts`'i açmak zorunda kalmasın.

---

## Karar kapısı kartlara nasıl yazıldı

`RT-PROBE-001` kabul kriteri 5:

> p95 ≤ 1500 ms ise rapor "ADR-0002 doğrulandı" der. p95 > 1500 ms ise rapor "ADR-0002 REVİZYON
> GEREKLİ — Redis pub/sub yedeği değerlendirilmeli" başlığıyla biter. **Agent hiçbir koşulda kendi
> başına pivot etmez:** Redis eklemez, ADR yazmaz, tasarımı değiştirmez. Kararı lead verir.

`WS-001`'in `deps`'ine `RT-PROBE-001` eklendi — kapı bağımlılık grafiğinde de zorunlu.

**R1 değişmezi** (süreç-içi kısayol yok) üç kartın kabul kriterine açık madde olarak girdi:
`CTR-002` (reducer kendi hamlesini yankısız uygulamaz), `WS-001` (change stream olayı
beslenmeden hiçbir mesaj çıkmaz — test), `E2E-001` (fan-out gecikmesi sayı olarak raporlanır).

---

## E2E kartlarının ayrı dalgalarda olmasının gerekçesi

88 kriterin 50'si `[E2E]`. CLAUDE.md kural 1 gereği Playwright yalnız `apps/e2e` içinde ve yalnız
`xox-qa-e2e` yazabilir; ayrıca testler ancak **merge edilmiş preview**'a karşı koşabilir.
Bu yüzden her özellik dalgasından sonra bir "q" dalgası var (`1q`, `2q`, `3q`) ve geliştirme
kartlarının kabul kriterleri **oturum içinde gözlemlenebilir** biçimde (birim/entegrasyon) yazıldı;
`[E2E]` kriterleri bir sonraki q-dalgasında kilitlenir. Her q-dalgası ≤ 2 kart, hızlı geçer.

`E2E-001` `apps/e2e/fixtures/**` ve `playwright.config.ts`'i dondurur; sonraki beş E2E kartı yalnız
`tests/` altına dosya ekler — bu yüzden ikişer E2E kartı paralel gidebilir.

---

## Mekanik doğrulamalar (hepsi koşturuldu)

| Kontrol                                             | Sonuç             |
| --------------------------------------------------- | ----------------- |
| `JSON.parse` geçerliliği                            | ✅                |
| `pnpm exec prettier --check docs/board/board.json`  | ✅ temiz          |
| Yinelenen `id`                                      | ✅ yok            |
| Var olmayan `deps` referansı                        | ✅ yok            |
| Bağımlılık döngüsü (DFS)                            | ✅ yok            |
| Şema alanlarının tamlığı (README'deki 12 alan)      | ✅ 34/34 kart     |
| Geçersiz `tier`                                     | ✅ yok            |
| Kadro dışı `agent`                                  | ✅ yok            |
| Dalga içi `conflictSet` kesişimi (glob-farkında)    | ✅ **0 kesişim**  |
| `deps` dalga sırasına uyuyor mu (geriye bakıyor mu) | ✅ 0 ihlal        |
| 88 kriterin kartlarda geçmesi                       | ✅ eksik yok      |
| `OPS-001` `status`/`attempts`/`blockedReason` aynen | ✅ değiştirilmedi |

Çakışma kontrolü `**` globlarını önek olarak çözen bir betikle yapıldı; `packages/shared/**` ile
`packages/shared/src/index.ts` gibi iç içe desenler kesişim sayıldı (farklı dalgalarda oldukları
için sorun değil, aynı dalgada olsalardı hata verirdi).

---

## Açık kalanlar

- **`OPS-001` `blocked`** — Ömer'in kararını bekliyor. Etkilediği tek kriter KK-100.
  `W2-04` ve `HRD-002` bu kriteri bekletir ve **domain bağlamayı yeniden denemez**.
- **KK-093 `[MANUEL]`** — Expo Go doğrulaması. `W2-03` adımları rapora yazar, "insan doğrulaması
  bekliyor" olarak işaretler; otomatikleştirmeye çalışmaz.
- **KK-102 / KK-103 iptal** — Sentry yok kararı (`decisions.md`, tasarım §10). `W2-04` bunları
  raporda "yapılmadı" değil **iptal** olarak listeler; yerine `lib/log.ts` maskeleme testi geçer.
- **V1 / V2 varsayımları** — `ws.close(4401)` özel kodunun istemciye ulaşması `WS-001`'de,
  Credentials+JWT çerezinin preview'da sürmesi `E2E-001`'de sondalanır. İkisi de kart içinde
  açık kabul kriteri.

---

## summary

33 yeni kart üretildi (toplam 34, `OPS-001` korundu), 12 dalgaya bölündü; kritik yol beş halka
olarak korundu (`CTR-001 → DB-001 → DB-002 → WS-001 → E2E-001`). Spec'in 88 kabul kriterinin
tamamı en az bir kartın acceptance'ında referanslandı; dalga içi çakışma kesişimi mekanik olarak
0 doğrulandı ve bağımlılık grafiğinde döngü yok. Üç gizli sıcak dosya (RoomScreen, db barrel,
apps/web package.json) Dalga 0'da dondurularak Dalga 1–3'ün paralelliği güvenceye alındı.
**Önerilen ilk dalga: 0a — `CTR-001` ‖ `UI-001` ‖ `OPS-002` ‖ `RT-PROBE-001`** (dördünün de
bağımlılığı yok, çakışma kümeleri ayrık, `RT-PROBE-001` sonucu ADR-0002'nin karar kapısı).
