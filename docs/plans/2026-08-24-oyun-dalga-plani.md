# XOX — Oyun Dalga Planı

- **Tarih:** 2026-08-24
- **Görev:** PLAN-001
- **Girdi:** SPEC-001 (`2026-08-24-xox-oyun-spec.md`) · ARCH-001 (`2026-08-24-xox-teknik-tasarim.md`) · ADR-0001…0009 · `gotchas.md`
- **Çıktı:** `docs/board/board.json` — 33 yeni kart (+ mevcut `OPS-001`)
- **Okuyucu:** lead (dalga döngüsünü bu dokümandan sürer)

> Bu doküman `board.json`'ın **anlatımıdır**, kaynağı değil. Çelişki olursa `board.json` kazanır.

---

## 0. Özet

| Ölçü                        | Değer                                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| Yeni kart                   | 33                                                                          |
| Dalga                       | 12 (`0a · 0b · 0c · 0d · 0e · 1 · 1q · 2 · 2q · 3 · 3q · 4`)                |
| Kritik yol                  | `CTR-001 → DB-001 → DB-002 → WS-001 → E2E-001` — beş halka                  |
| Bir dalgadaki azami kart    | 4                                                                           |
| Kapsanan kabul kriteri      | 88/88 (KK-102/103 **iptal**, KK-093 **manuel**, KK-100 **OPS-001'e bağlı**) |
| Doğrulanan çakışma kesişimi | 0 (mekanik kontrol edildi)                                                  |
| Bağımlılık döngüsü          | yok                                                                         |

**Önerilen ilk dalga: 0a — `CTR-001` ‖ `UI-001` ‖ `OPS-002` ‖ `RT-PROBE-001`.**

---

## 1. Planın iki taşıyıcı fikri

### 1.1 Kritik yol beş halkadır ve kısaltılamaz

```
CTR-001  →  DB-001  →  DB-002  →  WS-001  →  E2E-001
sözleşme    modeller    otorite    gerçek     KAPI
                        geçişleri  zamanlı
```

Her halka bir öncekinin **tipini** import eder. `AUTH-001` bu zincirin dışında, `DB-002` ile
**paralel** ilerler (yalnız `DB-001`'e ihtiyacı var) — bu sayede mimarın beş alt dalgası korunurken
kartlar tek oturumda bitecek kadar küçüldü.

Mimarın `CTR-001` ve `DB-001` kartları ikiye bölündü (`CTR-001`/`CTR-002`, `DB-001`/`DB-002`) ve
metin ağacı `UI-001`'den ayrıldı (`TXT-001`). Bölme **dalga sayısını artırmadı**: yeni kartlar
zaten var olan alt dalgalara paralel yerleşti.

### 1.2 Sıcak dosyalar Dalga 0'da bitirilir, bir daha açılmaz

Dalga 1–3'ün paralel gidebilmesinin **tek** koşulu bu. Yedi dosya Dalga 0'da eksiksiz yazılır:

| Dosya                                        | Yazan         | Sonra dokunan                           |
| -------------------------------------------- | ------------- | --------------------------------------- |
| `apps/web/lib/realtime/handlers/index.ts`    | `WS-001`      | **hiç kimse** (iskeletler doldurulur)   |
| `apps/web/lib/realtime/timers.ts` (no-op)    | `WS-001`      | yalnız `W2-01` (gövde)                  |
| `packages/db/src/index.ts` (tam barrel)      | `DB-002`      | **hiç kimse**                           |
| `apps/web/components/room/RoomScreen.tsx`    | `UI-SKEL-001` | **hiç kimse** (slotlar mount edildi)    |
| `apps/web/messages/tr.ts` (P0+P1+P2)         | `TXT-001`     | **hiç kimse**                           |
| `apps/web/package.json` + `knip.json`        | `OPS-002`     | **hiç kimse**                           |
| `apps/e2e/fixtures/**` + `playwright.config` | `E2E-001`     | **hiç kimse** (yalnız `tests/` eklenir) |

`OPS-002`'nin `apps/web/package.json`'ı dondurması bir keşif sonucudur: `apps/web` bugün yalnız
`@xox/db`'ye bağımlı — `@xox/shared`, `@xox/ui-tokens`, `next-auth`, `zod`, `jose`,
`@node-rs/argon2`, `mongodb`, `@vercel/analytics` **yok**. Bu bağımlılıklar 0c'de iki agent
tarafından aynı anda eklenmek zorunda kalırdı. Hepsi 0a'da eklenir; henüz kullanılmayanlar
`knip.json → apps/web.ignoreDependencies`'e yazılır. **Doğrulandı:** kullanılmaya başlandığında
knip yalnız "Configuration hint" üretir, exit kodu 0 kalır — kapı kırılmaz.

### 1.3 R1 değişmezi kartlara gömüldü

"Bir bağlantı, başka bir bağlantının ürettiği hiçbir mesajı change stream dışında almaz."
Bu, üç kartın kabul kriterine **açık madde** olarak girdi:

- `CTR-002`: reducer kendi hamlesini sunucu yankısı olmadan kalıcı uygulamaz, yalnız `pending` işaretler.
- `WS-001`: iki bağlantıya change stream olayı beslenmediğinde **hiçbir** mesaj çıkmaz (test).
- `E2E-001`: iki oyuncu aynı instance'a düşse bile fan-out yolu ölçülür ve gecikme sayı olarak raporlanır.

---

## 2. Dalga dalga

### Dalga 0a — sözleşme ve risk · 4 paralel · deps yok

| Kart           | Agent              | Neden ayrık                                        |
| -------------- | ------------------ | -------------------------------------------------- |
| `CTR-001`      | `xox-dev-core`     | `packages/shared/**`                               |
| `UI-001`       | `xox-designer`     | `packages/ui-tokens/**` + `eslint.config.mjs`      |
| `OPS-002`      | `xox-devops`       | manifest/konfig dosyaları (kök, `apps/web` paketi) |
| `RT-PROBE-001` | `xox-dev-realtime` | `apps/web/app/api/health/realtime/**`              |

**`RT-PROBE-001` bir karar kapısıdır.** Change stream yazma→olay gecikmesini preview üzerinde
≥20 örnekle ölçer. **p95 > 1500 ms ise ADR-0002 revize edilir ve Redis pub/sub yedeğine geçilir.**
Agent bu kararı **vermez**: Redis eklemez, ADR yazmaz, tasarımı değiştirmez — yalnız sayıyı rapora
yazar ve "revizyon gerekli" der. Karar lead'indir. Ölçüm UI yazılmadan önce alınır çünkü yanlış
temele beş dalga inşa edilmez.

`UI-001` `eslint.config.mjs`'in tek sahibidir (hex literal yasağı, KK-084). Sonraki dalgalarda
lint konfigürasyonu değişmesi gerekirse bir dalgada **yalnız bir kart** dokunabilir; kararı lead verir.

**Kapı:** dördü de `done` ve `RT-PROBE-001` raporu p95 sayısını içeriyor.

---

### Dalga 0b — otorite tabanı ve istemci çekirdeği · 3 paralel

| Kart      | deps      | Agent             | Çakışma kümesi                                             |
| --------- | --------- | ----------------- | ---------------------------------------------------------- |
| `DB-001`  | `CTR-001` | `xox-dev-backend` | `packages/db/src/{models,client,index,seed,reset,indexes}` |
| `CTR-002` | `CTR-001` | `xox-dev-core`    | `packages/shared/src/{room-client,ws-client,index}.ts`     |
| `TXT-001` | `CTR-001` | `xox-designer`    | `apps/web/messages/**` · `apps/mobile/messages/**`         |

Üçü de `CTR-001`'in tiplerine ihtiyaç duyar, birbirine değil. `CTR-002` ile `DB-001` farklı
paketlerde; `TXT-001` `@xox/shared/message-keys`'i **okur**, `packages/shared`'a yazmaz.

`CTR-002` KK-046/047/060/061/065'i **birim testine** indirger — bu kriterler E2E'ye bırakılmaz.
Reducer saf olduğu için `jsdom` bile gerekmez.

**Kapı:** üçü de `done`; `packages/db` testleri gerçek `xox_test`'e karşı yeşil.

---

### Dalga 0c — geçişler, kimlik, yüzey · 3 paralel

| Kart          | deps                                                 | Agent             |
| ------------- | ---------------------------------------------------- | ----------------- |
| `DB-002`      | `DB-001`                                             | `xox-dev-backend` |
| `AUTH-001`    | `DB-001`, `CTR-001`, `OPS-002`                       | `xox-dev-backend` |
| `UI-SKEL-001` | `CTR-001`, `CTR-002`, `UI-001`, `TXT-001`, `OPS-002` | `xox-dev-web`     |

Aynı ajan tipi (`xox-dev-backend`) iki kartta görünür; worktree'ler ayrı olduğu için sorun değil.

**Paralelliği ayakta tutan üç kural:**

1. `UI-SKEL-001` **`@/auth` import etmez.** Oturum kapısı middleware'dedir. Bu kural ihlal edilirse
   iki worktree aynı modülü yazar ve typecheck kırılır.
2. `AUTH-001` `apps/web/package.json`'a dokunmaz — bağımlılıklar 0a'da eklendi.
3. `DB-002` `packages/db/src/index.ts`'i **son kez** açar ve ileri dalgaların tüm fonksiyonlarını
   (`resign`, `rematch`, `settle`, `emoji`, `finish`, `elo`, `queries/*`) tipli iskelet olarak
   dışa verir. Dalga 1–3'te bu dosya için sıra beklenmez.

`AUTH-001` mimarın kartından biraz geniş: `tokens.ts`, `identity.ts` ve `/api/ws/ticket` de burada.
Gerekçe: `identity.ts` `auth.ts`'i import eder, ayrı karta konursa 0c ile 0d arasına altıncı bir
halka girer. Kartın içindeki her dosya küçük ve tasarım §6'da imzasıyla yazılı.

**Kapı:** `pnpm --filter @xox/web build` başarılı **ve** middleware bundle'ında `mongoose`/`argon2`
yok (R6 sondası, `AUTH-001` raporunda).

---

### Dalga 0d — gerçek zamanlı · 2 paralel

| Kart           | deps                                                       | Agent              |
| -------------- | ---------------------------------------------------------- | ------------------ |
| `WS-001`       | `AUTH-001`, `DB-002`, `CTR-002`, `RT-PROBE-001`, `OPS-002` | `xox-dev-realtime` |
| `ROOM-API-001` | `AUTH-001`, `DB-002`                                       | `xox-dev-backend`  |

`WS-001` `apps/web/app/api/rooms/[code]/ws/**`, `ROOM-API-001` `apps/web/app/api/rooms/route.ts` ve
`[code]/route.ts` — aynı ağaçta, **farklı dosyalarda**. Git dosya düzeyinde birleştirir, kesişim yok.
İkisi de kimliği `AUTH-001`'in `resolveIdentity`'sinden alır; bu yüzden mobil geldiğinde
(Dalga 2) REST uçlarında **yeniden yazım olmaz**.

`WS-001` planın en büyük kartıdır ve bilinçli olarak bölünmedi: `room-hub` + `connection` + route
üçü birbirinin tipini import eder, bölünürse altıncı bir halka doğar. Tasarım §5 her dosyayı adıyla
ve imzasıyla verdiği için belirsizlik düşük. Kart içinde **V1 sondası** var: `ws.close(4401)` özel
kapanış kodunun istemciye ulaştığı preview'da doğrulanır; ulaşmazsa upgrade öncesi HTTP 401 yoluna
geçilir ve KK-008 metninin güncellenmesi gerektiği rapora yazılır (R4).

**Kapı:** `WS-001` raporunda "instance başına tek stream" testi ve R1 testi yeşil.

---

### Dalga 0e — KAPI · 1 kart

`E2E-001` — `xox-qa-e2e` — deps `WS-001`, `ROOM-API-001`, `UI-SKEL-001`.

Gerçek preview, gerçek Atlas. **Bu yeşil yanmadan Dalga 1 başlamaz.**

Çıkış kriteri: KK-001, KK-006, KK-030, KK-031, KK-032, KK-040, KK-041 yeşil **ve** ölçülen fan-out
gecikmesi raporda sayı olarak (min/ort/maks).

Bu kart aynı zamanda `apps/e2e/fixtures/**` ve `playwright.config.ts`'i **dondurur**: `storageState`
auth fixture'ı, `twoPlayers`, oda yardımcıları. Sonraki beş E2E kartı yalnız `tests/` altına dosya
ekler — bu yüzden `1q`, `2q`, `3q` dalgalarında iki E2E kartı paralel gidebilir.

KK-006'nın çalışması için `UI-SKEL-001` minimum bir `/profil` sayfası üretir (ad + e-posta + çıkış);
`W2-02` onu Dalga 2'de doldurur.

---

### Dalga 1 — P0 tamamlama · 4 paralel · hepsi `E2E-001`'e bağlı

| Kart    | Başlık                                    | Agent              | Kriterler  |
| ------- | ----------------------------------------- | ------------------ | ---------- |
| `W1-01` | Bilgisayara karşı (tamamen istemci)       | `xox-dev-web`      | KK-020…027 |
| `W1-02` | Sonuç + pes + rövanş (`finishGame` CAS'ı) | `xox-dev-realtime` | KK-050…058 |
| `W1-03` | Kopma, resync, takeover                   | `xox-dev-realtime` | KK-060…065 |
| `W1-04` | `/oda/katil`, kod normalleştirme, hatalar | `xox-dev-web`      | KK-033…036 |

**Neden ayrık:**

- `W1-02` ve `W1-03` ikisi de gerçek zamanlı ama farklı dosyalar: `handlers/{resign,rematch}.ts` ve
  `rooms/{resign,rematch,finish}.ts` ↔ `lib/realtime/{presence,rotate}.ts` ve `rooms/detach.ts`.
  `handlers/index.ts` ile `connection.ts`'e **ikisi de dokunmaz** — Dalga 0'da tamamlandı.
- `W1-01` `components/computer/**`, `W1-02` `components/room/ResultPanel.tsx`,
  `W1-03` `components/room/ConnectionBadge.tsx`, `W1-04` `components/JoinCodeField.tsx`.
  `RoomScreen.tsx` bu bileşenleri zaten mount ediyor.
- `W1-04` `rooms/create.ts`'e dokunmaz: kod çakışma yeniden denemesi (KK-035/036) `DB-002`'de
  bitti. Mimarın taslağındaki bu kesişim bilerek kaldırıldı.

---

### Dalga 1q — P0 KAPISI · 2 paralel

| Kart      | deps             | Kapsam                                               |
| --------- | ---------------- | ---------------------------------------------------- |
| `E2E-002` | `W1-01`, `W1-04` | KK-002/005/007/011 · KK-020…027 · KK-033/034         |
| `E2E-003` | `W1-02`, `W1-03` | KK-046 · KK-050…056 · KK-062/063/065 · takeover §3.2 |

Ayrık: farklı `tests/*.spec.ts` dosyaları, fixture'lara dokunulmaz.

**`E2E-003` raporu 50 P0 kriterinin tam durum tablosunu içerir.** Dalga 2 bu tablo olmadan başlamaz.

> **Neden ayrı bir "q" dalgası?** `[E2E]` etiketli kriterleri yalnız `xox-qa-e2e` yazabilir
> (Playwright duvarı, CLAUDE.md kural 1) ve testler ancak merge edilmiş preview'a karşı koşabilir.
> Geliştirme kartlarının kabul kriterleri bu yüzden **oturum içinde gözlemlenebilir** biçimde
> yazıldı (birim/entegrasyon), `[E2E]` kriterleri bir sonraki q-dalgasında kilitlenir.

---

### Dalga 2 — P1 · 4 paralel

| Kart    | Başlık                                     | Agent              | deps                                            | Kriterler          |
| ------- | ------------------------------------------ | ------------------ | ----------------------------------------------- | ------------------ |
| `W2-01` | Hamle süresi + terk grace'i                | `xox-dev-realtime` | `W1-02`, `W1-03`                                | KK-070…077         |
| `W2-02` | Profil, ad, tema                           | `xox-dev-web`      | `UI-SKEL-001`, `AUTH-001`                       | KK-080…084         |
| `W2-03` | Mobil paritesi + mobil auth köprüsü        | `xox-dev-mobile`   | `UI-SKEL-001`, `AUTH-001`, `CTR-002`, `TXT-001` | KK-009, KK-090…093 |
| `W2-04` | Analytics + Speed Insights + log maskeleme | `xox-devops`       | `UI-SKEL-001`, `OPS-002`                        | KK-100/101/104     |

**Ayrıklık notları:**

- `W2-01` `lib/realtime/timers.ts`'in gövdesini doldurur; `connection.ts` ve `handlers/index.ts`'e
  dokunmaz (çağrı yerleri `WS-001`'de kuruldu). `rooms/{apply-move,join}.ts`'te AS-08'in tek satırı
  açılır (`turnDeadline` artık yazılıyor) — bu dosyalara Dalga 2'de başka kimse dokunmaz.
- `W2-02` **`layout.tsx`'i açmaz**; tema altyapısı `UI-SKEL-001`'de kuruldu. `layout.tsx` Dalga 2'de
  yalnız `W2-04`'e aittir.
- `W2-03` `apps/mobile/messages/tr.ts`'i değiştirmez (`TXT-001` tamamladı) ve
  `apps/web/app/api/auth/mobile/**` dışında web'e dokunmaz.
- **KK-102 ve KK-103 iptal.** Sentry yok (`decisions.md`, tasarım §10). `W2-04` bunları raporda
  "yapılmadı" değil **iptal (karar: Sentry yok)** olarak listeler; yerine `lib/log.ts` maskeleme
  testi kalıcı koruma olur.
- **KK-100 `OPS-001`'e bağlı.** `W2-04` bu tek kriteri bekletir ve domain bağlamayı yeniden denemez.
  `OPS-001` `blocked` kalır — Ömer'in kararını bekliyor.

---

### Dalga 2q — P1 doğrulaması · 2 paralel

| Kart      | deps             | Kapsam                                             |
| --------- | ---------------- | -------------------------------------------------- |
| `E2E-004` | `W2-01`, `W2-02` | KK-070…074 · KK-080…083 · KK-006 tam biçimi        |
| `E2E-005` | `W2-03`, `W2-04` | KK-090/091 · KK-101/104 · KK-100 atlanır (blocker) |

---

### Dalga 3 — P2 · 4 paralel

| Kart    | Başlık                     | Agent              | deps              | Kriterler       |
| ------- | -------------------------- | ------------------ | ----------------- | --------------- |
| `W3-01` | ELO + puanlılık + sıralama | `xox-dev-backend`  | `W1-02`, `W2-01`  | KK-110…115, 117 |
| `W3-02` | Maç geçmişi                | `xox-dev-web`      | `W1-02`           | KK-116/117      |
| `W3-03` | Emoji + hız sınırı + davet | `xox-dev-realtime` | `W1-02`           | KK-120…124      |
| `W3-04` | Arkadaşlar                 | `xox-dev-backend`  | `W1-02`, `DB-001` | KK-125…127      |

Dördü de `packages/db` altına yazar ama **farklı dosyalara**: `elo.ts`+`rooms/finish.ts`+
`queries/leaderboard.ts` ↔ `queries/matches.ts` ↔ `rooms/emoji.ts` ↔ `queries/friends.ts`+
`models/friendship.ts`. `index.ts` `DB-002`'de donduruldu, dördü de açmaz.

`W3-04` `ResultPanel.tsx`'i **açmaz**: `FriendAddButton` slotu `UI-SKEL-001`'de mount edildi.
`W3-03` `connection.ts`'i **açmaz**: emojinin version kapısından önce işlenmesi `WS-001`'de yazıldı.

---

### Dalga 3q — 1 kart

`E2E-006` — KK-115/116/120/121/122/125/127 preview'da. Raporu **88 kriterin tam durum tablosunu**
içerir: geçen · kırmızı (kart id'siyle) · iptal (KK-102/103) · manuel (KK-093) · blocker (KK-100).

---

### Dalga 4 — sertleştirme · 3 paralel

| Kart      | Agent             | İş                                                 |
| --------- | ----------------- | -------------------------------------------------- |
| `HRD-001` | `xox-test-writer` | `packages/shared` mutasyon testi + kapsam eşikleri |
| `HRD-002` | `xox-devops`      | production yayın + canlı WS rotasyon kanıtı        |
| `HRD-003` | `xox-qa-e2e`      | üç kez tam regresyon + flake avı + yerel `vc dev`  |

`xox-reviewer`, `xox-security` ve `xox-perf` bu dalgada **lead tarafından** koşturulur; board kartı
değildir (kadro dışı ajanlar).

---

## 3. Kapsam dışı bırakılanlar

Bu kartlar **yazılmadı** çünkü iş bitti:

- `packages/game-core` — kural motoru + minimax (91 test, %100 kapsam, %98.56 mutasyon, 642 oyunla
  yenilmezlik kanıtı). Hiçbir kart bu pakete dokunmaz; `HRD-001` bile açıkça hariç tutar.
- Monorepo, kalite kapıları, CI, Vercel projesi, preview/production deploy, harness.
- `/api/health`, `apps/e2e` `twoPlayers` fixture'ı (üzerine inşa edilir). (`/api/ws/echo`
  2026-08-25'te silindi — güvenlik denetimi kimliksiz açık yansıtıcı olarak işaretledi.)

Kapalı kararlar, yeniden açılmaz: Auth Credentials + argon2id (ADR-0009) · Sentry yok ·
WS + change stream fan-out (ADR-0002; Redis yalnızca `RT-PROBE-001` kötü gelirse).

---

## 4. Lead için kontrol listesi

Her dalga başında:

1. `board.json` → `wave` alanı sıradaki dalgayı gösteriyor mu, `deps`ler `done` mi?
2. Seçilen kartların `conflictSet`'leri kesişiyor mu? (Bu plan yazılırken 0 kesişim doğrulandı;
   bir kart bölünür ya da kapsam büyürse **yeniden kontrol et**.)
3. Bir kart 3 denemede geçmediyse `blocked` yap ve `blockedReason`'a **ne denendiğini** yaz.
4. Bir agent "sıcak dosyaya dokunmam gerekti" derse: dalgayı durdur, dosyayı kimin sahiplendiğine
   bak, gerekirse kartı bir sonraki dalgaya taşı. Sessizce izin verme — merge cehennemi buradan başlar.
5. Her 3 dalgada `xox-memory-curator`.

Dalga 0a'dan sonra ilk karar noktası: **`RT-PROBE-001` p95 değeri.** ≤ 1500 ms ise plan aynen sürer.

> 1500 ms ise `WS-001` dispatch edilmeden önce ADR-0002 revize edilir ve `CTR-001`'in protokolü
> değişmediği için yalnızca `WS-001`'in içi (hub) etkilenir — plan geri kalanıyla ayakta kalır.
