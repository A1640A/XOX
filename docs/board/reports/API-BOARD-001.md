# API-BOARD-001 — `POST /api/rooms` opsiyonel gövde + `GET /api/rooms/[code]` `size`/`winLength`

Dal: `feat/API-BOARD-001`. Worktree: `.claude/worktrees/API-BOARD-001`. Merge yapılmadı —
talimat gereği (lead sırayla merge eder).

## Özet

`GET /api/rooms/[code]` katmanı `CTR-003`'ten beri tamamdı (`canJoinRoom` + `resolveBoardConfig`
zaten bağlanmıştı) — bu kartta o tarafa **dokunulmadı**, yalnız doğrulandı (aşağıda kanıt).

Asıl iş `POST /api/rooms`'taydı: route artık şu zinciri uyguluyor —

```
resolveIdentity → readBody (req.json() try/catch, {} fallback)
  → roomCreateBodySchema.safeParse (şekil)
  → parseBoardConfig (game-core'un tek kural kaynağı — kombinasyon geçerliliği)
  → isBoardSizeEnabled (yeni: apps/web/lib/game/enabled-sizes.ts, ADR-0018 §3 kill switch)
  → createRoom(owner, config)
```

Üç kapıdan biri reddederse **400 `INVALID_BOARD_CONFIG`**, `createRoom` hiç çağrılmaz.

## Yeni dosya: `apps/web/lib/game/enabled-sizes.ts`

ADR-0018 §3 tam olarak bu dosyanın yolunu ve ortam değişkenini (`XOX_ENABLED_BOARD_SIZES`)
belirtiyordu ama henüz kimse yazmamıştı. Board'un `API-BOARD-001` acceptance metni bu kapının
"bu kartta henüz olmayabileceğini, ROLLOUT-BOARD-001'in ekleyeceğini" söylüyordu — ama **lead'in
bana verdiği görev metni** açıkça enabledSizes kapısının bu kartın "asıl işi" olduğunu ve reddin
kanıtını istedi. İkisi çelişmiyor: acceptance zaten "TEK NOKTAYI hazırla, ikinci kopya yazma"
diyordu; ben tek noktayı (bu dosya + tek çağrı yeri) yazıp doldurdum, `game-core`/`shared`/`db`'ye
dokunmadım (ADR-0018'in "kill switch kural motoruna girmez" şartı korunuyor).

```ts
export function getEnabledBoardSizes(): readonly number[]
export function isBoardSizeEnabled(size: number): boolean
```

Davranış:

- Ayarlanmamış/boş → **tüm** boyutlar (`[3,6,11]`) — "kapalı kalma riski yok" (ADR-0018).
- Kısmen bozuk (`"3,7"`) → bilinmeyen parça **sessizce** atlanır, geçerli kalan (`[3]`)
  uygulanır — bu, kill switch'in NORMAL kullanım şeklidir.
- Tamamen anlaşılmaz (`"abc"`) → `logWarn` ile **gürültülü** biçimde tüm boyutlara düşülür
  (bir yazım hatası tüm oda kurmayı sessizce kilitlemesin — `resolveBoardConfig`'in
  "bozuksa {3,3} + logError" disipliniyle aynı sınıf, apps/web'in kendi `logWarn`
  sarmalayıcısı üzerinden — `console.*` `apps/web` içinde yalnız `lib/log.ts`'ten çağrılabilir).
- `game-core`'un `BOARD_MODES`'undan boyut listesini okur (tek kaynak), regex/sabit kopyası yok.

Test: `apps/web/lib/game/enabled-sizes.test.ts` (7 test) — unset/boş/kısmi-bozuk/tam-bozuk/
tekilleştirme/`isBoardSizeEnabled` yollarının hepsi ayrı ayrı sınandı.

## Kanıt 1 — gövdesiz POST hâlâ 3×3 oda kurar

`apps/web/app/api/rooms/route.test.ts`:

```
✓ API-BOARD-001: GÖVDESİZ POST hâlâ 3×3 oda kurar — req.json() boş gövdede FIRLATIR, ...
✓ API-BOARD-001: boş JSON gövdesi ({}) de aynı şekilde 3×3 oda kurar
✓ API-BOARD-001: bozuk JSON gövdesi (parse edilemeyen metin) da {} gibi ele alınır, 3×3 kurar
```

Üçü de `expect(mockCreateRoom).toHaveBeenCalledWith({userId,name}, {size:3, winLength:3})`
iddiasını taşıyor — `readBody`'nin try/catch'i olmadan bu üçü de 500 SERVER_ERROR'a düşerdi
(gerçek Next.js `Request.json()` boş gövdede `SyntaxError` fırlatır, bu davranış yerelde de
doğrulandı: `new Request(url).json()` reject olur).

## Kanıt 2 — `enabledSizes` reddi (sessiz düşüş DEĞİL)

```
✓ API-BOARD-001: enabledSizes kapısı — kapalı bir boyut REDDEDİLİR (sessizce 3e düşürülmez):
  XOX_ENABLED_BOARD_SIZES=3 iken size:11 istenirse 400 INVALID_BOARD_CONFIG döner ve
  createRoom hiç çağrılmaz
✓ API-BOARD-001: enabledSizes kapısı açıkken (varsayılan 3,6,11) aynı size:11 isteği kabul
  edilir — kapının kendisi doğru çalışıyor kanıtı (yalnız reddi değil kabulü de sına)
```

İkinci test olmadan birincisi yanıltıcı olurdu (mock her zaman false dönebilirdi/route her
zaman 400 dönebilirdi) — kapı hem AÇIK hem KAPALI durumda ayrı ayrı sınandı.

Ek reddetme sondaları (KK-B05/B16 tablosu, `game-core`'un donmuş `parseBoardConfig` davranış
tablosundan **çıplak** kopyalandı, türetilmedi):

```
✓ size:4 (üçlüde yok) → 400
✓ size:6, winLength:3 (o boyutta izinsiz K) → 400
✓ size:'11' (sayı değil dize) → 400
✓ gövde [] (dizi) → 400
✓ size:3, winLength:4 (sıfır-olmayan/nötr-eleman-körlüğü karşıtı sondası) → 400
```

## Kanıt 3 — `resolveBoardConfig` dışında hiçbir yerde `?? 3` yazılmadı

```
$ grep -rn '?? 3\b' apps/web/app/api/rooms apps/web/lib/game
apps/web/app/api/rooms/[code]/route.ts:51: * ... burada `?? 3` gibi bir
apps/web/lib/game/room-view.ts:97: * ... `room.size ?? 3` YAZILMAZ, o satır sabitin ikinci kopyası
```

İki eşleşme de **yorum satırı** (CTR-003/DB-BOARD-001'in "bunu YAPMA" uyarıları, benden ÖNCE
yazılmış) — kod tarafında sıfır eşleşme. `POST` tarafında da `DEFAULT_BOARD_CONFIG`/`parseBoardConfig` dışında bir varsayılan
sabit yazılmadı; `enabled-sizes.ts` de `BOARD_MODES.map((m) => m.size)` ile `game-core`'dan okur.

## `GET /api/rooms/[code]` — dokunulmadı, doğrulandı

`CTR-003`'ün bıraktığı hâliyle `size`/`winLength` `getRoomSummary`'den geldiği gibi taşınıyor,
`canJoin` `canJoinRoom`'dan türetiliyor. 15 testin tamamı (nötr-eleman-körlüğü sondası dahil:
`size:6, winLength:4`) hâlâ yeşil — bu kartta ek değişiklik gerekmedi.

## `pnpm gates` çıktısı

```
$ pnpm gates
$ pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage && pnpm knip
...
Tasks: 7 successful, 7 total   (typecheck)
eslint . --max-warnings=0      → 0 problems
prettier --check .             → All matched files use Prettier code style!
Test Files  70 passed (70)
     Tests  726 passed (726)
Coverage: Statements 93.81% · Branches 88.69% · Functions 93.45% · Lines 96.14%
knip                            → 0 unused (yalnız yapılandırma ipuçları, hata yok)
```

Exit code `0`. `--no-verify` kullanılmadı.

## Değişen/eklenen dosyalar (yalnız çakışma kümem içinde)

```
M apps/web/app/api/rooms/route.ts
M apps/web/app/api/rooms/route.test.ts
A apps/web/lib/game/enabled-sizes.ts
A apps/web/lib/game/enabled-sizes.test.ts
```

`packages/shared`, `packages/db`, `packages/game-core`, `apps/web/components/**` dosyalarının
HİÇBİRİNE dokunulmadı (`git diff --stat` bunu doğruluyor — bu dosyalar diff'te hiç görünmüyor).

## Notlar / lead'e

- Yeni `apps/web/lib/game/enabled-sizes.ts` dosyası `use-board-modes.ts`'in (UI-BOARD-001,
  paralel kart) **ikinci tüketicisi** olması bekleniyor (ADR-0018 §3: "iki tüketicisi vardır,
  ikisi de aynı fonksiyonu çağırır"). UI-BOARD-001 aynı dosyayı oluşturmaya çalışırsa merge
  çakışması olur — integrator bu dosyayı benim sürümümden alıp UI tarafının yalnızca
  `getEnabledBoardSizes`'ı import ettiğinden emin olmalı, ikinci bir kopya YAZILMAMALI.
- `docs/memory/api-contract.md`'ye dokunmadım (görev alanım dışı, salt okunur listelendi) —
  `POST /api/rooms`'un gövde şeması artık `roomCreateBodySchema` olduğu bir sonraki
  `memory-curator` turunda dokümana eklenebilir.
