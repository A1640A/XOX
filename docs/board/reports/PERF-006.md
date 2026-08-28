# PERF-006 — `matches` explain sondası ayrı SORT aşamasını da sınıyor

## Sorun

`packages/db/src/queries/matches.test.ts`'teki KK-117 explain testi, üretim kodunun
(`getMatchHistory`) **kendisini hiç çağırmıyordu** — `Game.find(...).sort({finishedAt:-1})...`
şeklini elle tekrar yazıp `.explain()` çağırıyor, yalnız `COLLSCAN` yokluğunu sınıyordu. Lead'in
ölçtüğü gibi, `matches.ts`'te gerçek `.sort()` alanı `finishedAt`'ten `createdAt`'e çevrilse bile
bu test **YEŞİL kalıyordu**: (1) testin kendi kopyaladığı şekil hâlâ `finishedAt` kullandığı için
üretimdeki değişikliği hiç görmüyordu, (2) filtre eşitliği hâlâ bileşik indeksi (IXSCAN)
kullandığı için COLLSCAN da çıkmıyordu — yalnız planlayıcının belleğe alıp yeniden sıraladığı
ayrı bir **SORT aşaması** oluşuyordu, bu da sondanın hiç bakmadığı bir sinyal.

## Düzeltme

Test artık üretim kodunun **gerçekten kurduğu** sorguyu sınıyor:

1. `vi.spyOn(Game, 'find')` ile `getMatchHistory` içindeki `Game.find(...)` çağrısının döndürdüğü
   `Query` nesnesi yakalanıyor (mongoose zincirleme senkron olduğu için `sort()`/`limit()`/`lean()`
   çağrıldıktan, ama `await` tetiklenip gerçekten çalıştırılmadan ÖNCE bu nesne elde ediliyor).
2. Yakalanan sorgudan `getFilter()`, `projection()`, `getOptions()` (içinde `sort`, `limit`) ile
   **üretimin gerçekten kullandığı şekil** çıkarılıyor.
3. Bu şekille yeni bir `Game.find(...).sort(...).limit(...).explain('executionStats')` çağrısı
   yapılıyor ve plan hem `COLLSCAN` hem `"stage":"SORT"` için sınanıyor.

Bu sayede `matches.ts`'te sıralama alanı değişirse, spy'ın yakaladığı `sort` da değişir ve
explain planı gerçek mutasyonu yansıtır — test artık kaynak metni değil, çalışma zamanı
davranışını sınıyor.

Desen `packages/db/src/queries/leaderboard.test.ts`'in KK-117 sondasıyla aynı iki koşulu
(COLLSCAN yok + ayrı SORT yok) kontrol ediyor; oradaki test doğrudan `User.find(...)` ile
kısmi indeksin (`{elo:-1}`) tasarım niyetini sınadığı için hardcode kalabiliyordu — `matches`
sorgusunda ise (bileşik indeks `{participants:1, finishedAt:-1}`, filtre `finishedAt` üzerinde)
tam bu ayrım (tasarım niyeti vs. gerçek çalışma zamanı şekli) hata payı bıraktığı için spy
yaklaşımına geçildi.

## Mutasyon-kırmızı kanıtı

`matches.ts`'te `.sort({ finishedAt: -1 })` → `.sort({ createdAt: -1 })` yapıldı (lead'in
sondasıyla birebir aynı mutasyon). Yeni test **KIRMIZI** yandı:

```
FAIL  |db| src/queries/matches.test.ts > getMatchHistory (gerçek xox_test) >
  KK-117: getMatchHistory ÜRETİMDE KURDUĞU sorgu şekliyle — COLLSCAN YOK, ayrı SORT aşaması YOK
AssertionError: expected '{"explainVersion":"1","queryPlanner":…' not to contain '"stage":"SORT"'
```

Explain çıktısının winningPlan'ı gösteriyor ki gerçek Atlas planlayıcısı
`{"stage":"SORT","sortPattern":{"createdAt":-1}, ..., "inputStage":{"stage":"FETCH", ...
"inputStage":{"stage":"IXSCAN","keyPattern":{"participants":1,"finishedAt":-1}, ...}}}`
üretiyor — yani filtre hâlâ bileşik indeksi kullanıyor (COLLSCAN yok, dolayısıyla eski test
sessiz kalırdı), ama sıralama artık belleğe düşüyor (ayrı SORT aşaması). Diğer 8 test etkilenmedi
(9 testten 1'i kırmızı, 8'i yeşil kaldı — beklenen: fonksiyonel sıralama testleri, oluşturma
sırasının `createdAt` ile de örtüştüğü tesadüfi bir veri düzeni yüzünden yeşil kalmaya devam
ediyor; bu tam olarak kartın tanımladığı gizli risk).

## Geri alma doğrulaması

```
git checkout -- packages/db/src/queries/matches.ts
git diff packages/db/src/queries/matches.ts   # boş çıktı — dosya orijinaline döndü
```

Sonrasında test tekrar tam YEŞİL: `Test Files 1 passed (1)`, `Tests 9 passed (9)`.

## Definition of Done

1. Mutasyon-kırmızı kanıtı — YUKARIDA, `matches.ts` geri alındı ve doğrulandı (`git diff` boş).
2. `pnpm gates` — **EXIT 0**. Altı kapı: `check:dead-exports` (temiz, yeni ölü export yok),
   `typecheck` (7/7 paket, `@xox/db` cache miss — gerçek çalıştı), `lint` (temiz),
   `format:check` (temiz — bir `prettier --write` turu gerekti, uygulandı), `test:coverage`
   (`@xox/db`: 34 dosya / 329 test yeşil, Statements 96.05%, Branches 90.46%, eşik altında
   değil), `knip` (yalnız mevcut yapılandırma ipuçları, hata yok).
3. Bu rapor.
4. Commit: aşağıda.

## Değişen dosyalar

- `packages/db/src/queries/matches.test.ts` — KK-117 sondası, üretim sorgusunu `Game.find`
  spy'ıyla yakalayıp ondan `.explain()` çağıracak şekilde yeniden yazıldı; `HISTORY_PAGE_SIZE`
  importu artık gereksiz olduğu için kaldırıldı.

## Bulunan hatalar

Yok. `matches.ts`'e (üretim koduna) dokunulmadı — kart gereği yalnız test dosyası değişti.

## Notlar / gotchas

- Worktree `.env.local` almıyor (bilinen tuzak, `docs/memory/gotchas.md`); testleri
  çalıştırmadan önce `cp /Users/omerdursun/PROJELER/XOX/.env.local .claude/worktrees/PERF-006/.env.local`
  gerekti.
- `pnpm --filter @xox/db test -- matches.test.ts` filtre argümanını gerçekten uygulamıyor —
  paketin TÜM test dosyalarını koşuyor (görünüşe göre `vitest run` argümanı `pnpm --filter`
  komutuna doğru iletilmiyor olabilir). Tek dosya için `pnpm --filter @xox/db exec vitest run
src/queries/matches.test.ts` kullanmak gerekti.
