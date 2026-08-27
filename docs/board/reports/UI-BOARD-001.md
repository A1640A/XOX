# UI-BOARD-001 — Board.tsx yeniden yazımı: tek ızgara kod yolu + roving tabindex

- **Branch:** `feat/UI-BOARD-001` · **Worktree:** `.claude/worktrees/UI-BOARD-001`
- **Commit'ler:** `19f8e93` (Board yeniden yazımı) · `e757555` (bu rapor, ilk hâli) · `bcec9c9` (koordinatör sondası — küçülme kilidi)
- **Normatif kaynak:** ADR-0017, tasarım §5.3, spec KK-B49…B65/B71

## Koordinatör sondası — üçüncü mutasyon bulgusu ve düzeltmesi

Koordinatörün kendi sondaları `'--xox-n'` ve `tabIndex` mutasyonlarını
kırmızıya çevirdi (bekleneni doğruladı), ama üçüncü sonda gerçek bir boşluk
buldu:

```
Board.tsx:80
  const safeFocusIndex = focusIndex < expectedCount ? focusIndex : 0
                     →  const safeFocusIndex = focusIndex
```

Bu mutasyonla **tüm paket yeşil kalıyordu** — tahta küçülünce (ör. 11×11'den
3×3'e rövanş/konfigürasyon değişimiyle) eski `focusIndex` yeni `cellCount`
dışında kalırsa **hiçbir hücre** `tabIndex=0` olmuyordu (KK-B59 ihlali,
tahta klavyeyle tamamen erişilemez hale gelirdi). Sınır koruması kodda
vardı ama hiçbir test onu kilitlemiyordu.

**Düzeltme:** `bcec9c9` — büyük config (11×11) ile render + odağı `hucre-100`'e
taşı + küçük config'e (3×3, `DEFAULT_BOARD_CONFIG`) `rerender` ederek
`safeFocusIndex`'i DOĞRUDAN çağırmadan davranışı sınayan yeni test:

```
it('tahta KÜÇÜLÜNCE (11×11 -> 3×3) odak eski hücrenin dışında kalsa bile
    YİNE tam bir hücre tabIndex=0 olur', ...)
```

**Mutasyon disiplini uygulandı** (`conventions.md` "önce commit, sonra
sonda, sonra geri al"):

1. Test önce commit edildi (`bcec9c9`), suit yeşildi (23/23, `Board.test.tsx`).
2. Coordinatörün verdiği TAM mutasyon `Board.tsx:80`'e uygulandı; `git diff`
   ile GERÇEKTEN değiştiği doğrulandı.
3. Test koşuldu — **kırmızı**, gerçek çıktı:
   ```
   × tahta KÜÇÜLÜNCE (11×11 -> 3×3) odak eski hücrenin dışında kalsa bile
     YİNE tam bir hücre tabIndex=0 olur
     → expected [] to have a length of 1 but got +0
   Test Files  1 failed (1)
        Tests  1 failed | 22 passed (23)
   ```
   Yalnız yeni test kırmızı oldu, diğer 22 test etkilenmedi (izole sonda).
4. `git checkout -- apps/web/components/board/Board.tsx` ile geri alındı;
   `git status --porcelain` BOŞ. Test tekrar yeşil (23/23).
5. `pnpm gates` beş kapının TAMAMIYLA yeniden koşuldu: **`GATES_EXIT=0`**.
   `@xox/web`: 72 dosya, **753/753** test yeşil (yeni test dahil).

## Özet

`Board.tsx` ADR-0017'ye göre yeniden yazıldı: 3×3/6×6/11×11 **AYNI koddan**
çizilir, `grid-cols-3` gibi sabit sınıf adı repodan kalktı, yalnız
`--xox-n` CSS değişkeni (grid sütun sayısı) değişiyor. Roving tabindex,
erişilebilirlik metinleri ve fark-tabanlı canlı duyurular saf, DOM'suz
modüllere ayrıldı.

## Yeni/değişen dosyalar

| Dosya                                                | Rol                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/components/board/Board.tsx` (164 satır)    | Tek ızgara kod yolu, config-tabanlı render, KK-B57 hata yolu                                                                         |
| `apps/web/components/board/CellButton.tsx`           | `React.memo` hücre bileşeni (KK-B71 render bütçesi) — `Board.tsx`'i 250 satırın altında tutmak için ayrıldı                          |
| `apps/web/components/board/roving-grid.ts`           | SAF: `nextFocusIndex(current, key, config)`, `toNavKey(event)` — DOM'suz                                                             |
| `apps/web/components/board/cell-label.ts`            | SAF: `cellAriaLabel`, `boardAriaLabel` — `tr.boardConfig` kaynaklı                                                                   |
| `apps/web/components/board/announcements.ts`         | SAF: `moveAnnouncement`, `winningLineAnnouncement` (KK-B64/B65) — **bağlama UI-CFG-001'in işi**, bu kart yalnız saf üretici sağlıyor |
| `apps/web/components/room/RoomScreen.tsx`            | Yalnız `Board`'a geçen prop satırları (`config`, `lastMoveIndex`)                                                                    |
| `apps/web/components/computer/ComputerGameInner.tsx` | Yalnız `Board`'a geçen prop satırı (`config={DEFAULT_BOARD_CONFIG}`) — bkz. not aşağıda                                              |

`Marks.tsx` **değişmedi**. `ComputerGameScreen.tsx` **değişmedi** (Board'u
render eden asıl dosya `ComputerGameInner.tsx`'tir — bkz. "Kapsam notu").

## Tek ızgara kod yolunun kanıtı (3/6/11 aynı koddan)

`Board.test.tsx` aynı `Board` fonksiyonuna 9/36/121 hücre + `{size:3}` /
`{size:6,winLength:4}` / `{size:11,winLength:5}` config'i vererek sırasıyla
3/6/11 sütunlu ızgara, `hucre-35`, `hucre-120` testid'lerinin varlığını ve
`grid-cols-\d` deseninin **hiçbir yerde** geçmediğini doğruluyor
(`--xox-n` inline style ile 3/11 olarak ölçülüyor). Gerçek çıktı:

```
✓ 36 hücre verildiğinde 6 sütun (6 satır × 6 hücre) oluşur
✓ 121 hücre verildiğinde 11 sütun (11 satır × 11 hücre) oluşur
✓ tahta elementi data-boyut ve data-kazanma taşır (KK-B49)
✓ grid-cols-3 gibi sabit bir sınıf adı hiçbir yerde yoktur — sütun sayısı --xox-n değişkeninden gelir
```

Üretim CSS'inde (build sonrası) doğrulandı:
`grid-template-columns:repeat(var(--xox-n),minmax(0,1fr))`,
`.bg-border{background-color:var(--color-border)}`,
`outline-width:var(--xox-winning-outline-width)` — hepsi token'lardan, hiçbir
ham piksel/hex yok.

## Roving tabindex — gerçek test çıktısı

```
✓ yalnız bir hücre tabIndex=0, kalanı -1 (3×3 dahil)
✓ 11×11de tahtadan sonraki odaklanabilir elemana ulaşmak 1 Tab basışı alır
✓ ok tuşları odağı bir hücre taşır ve sarma yoktur (E-16)
✓ Home/End satır başı/sonuna, Ctrl+Home/Ctrl+End ilk/son hücreye, PageUp/PageDown ±5 satıra taşır
✓ fareyle bir hücreye tıklamak roving odağı o hücreye taşır
```

`roving-grid.test.ts` (saf, DOM'suz, `nextFocusIndex`/`toNavKey`) — 22 test,
her tuş (ok×4, Home/End, CtrlHome/CtrlEnd, PageUp/PageDown) hem 3×3 hem
11×11'de ayrı ayrı, sınırda sarmama dahil.

## KK-B71 render bütçesi — gerçek sayaç

`CellButton`'ın `React.memo` döndürdüğü nesnenin `.type` alanı (sarılan
fonksiyonun kendisi) bir `vi.fn()` casusuyla değiştirilip GERÇEK bileşenin
kaç kez çağrıldığı ölçülüyor (Profiler'ın commit-seviyesi belirsizliği
yerine doğrudan fonksiyon-çağrısı sayacı):

```
✓ yalnız KENDİ prop'ları değişen hücre yeniden render olur, komşusu ATLANIR
  → İlk mount: 2 çağrı. Yalnız hücre-0'ın `cell` prop'u değişince: 1 çağrı
    (hücre-1 AYNI prop'larla — render ATLANDI).
```

## `RoomScreen`/`ComputerGameInner` — yalnız prop satırı kanıtı

```diff
--- a/apps/web/components/computer/ComputerGameInner.tsx
+++ b/apps/web/components/computer/ComputerGameInner.tsx
@@ -1,5 +1,6 @@
 'use client'
+import { DEFAULT_BOARD_CONFIG } from '@xox/game-core'
 import { TESTID } from '@xox/shared'
@@ -40,6 +41,7 @@
       <Board
         cells={state.board}
+        config={DEFAULT_BOARD_CONFIG}
         interactive={interactive}
         winningLine={winningLine}
         onCellPress={playMove}

--- a/apps/web/components/room/RoomScreen.tsx
+++ b/apps/web/components/room/RoomScreen.tsx
@@ -77,9 +77,11 @@
       <Board
         cells={state.board}
+        config={{ size: state.size, winLength: state.winLength }}
         interactive={interactive}
         winningLine={winningLine}
         pendingIndex={state.pending?.index ?? null}
+        lastMoveIndex={state.lastMove?.index ?? null}
         onCellPress={actions.move}
       />
```

`ComputerGameScreen.tsx` diff'i **boş** (`git diff --stat` çıktısı yok).

### Kapsam notu — ComputerGameInner.tsx

Kartın çakışma kümesi `ComputerGameScreen.tsx`'i sayıyor ama `Board`'u
render eden gerçek dosya `ComputerGameInner.tsx`'tir (`ComputerGameScreen.tsx`
PERF-003'ten beri yalnız `next/dynamic` sarmalayıcısıdır, gövde yok).
`Board`'un `config` prop'u ZORUNLU hale geldiği için bu dosyaya dokunmadan
derleme kırılırdı. `ComputerGameInner.tsx` `UI-COMP-001`'in (henüz `todo`,
wave B5) çakışma kümesinde ama bu dalgada başlamadı; değişiklik yalnız TEK
prop satırı ve bir import satırı — lead'e bayrak: UI-COMP-001 başlamadan
önce bu notu görmeli.

## Test sonuçları

- `components/board/**`: 54/54 yeşil (`Board.test.tsx` 23 — küçülme kilidi dahil —, `roving-grid.test.ts` 22, `cell-label.test.ts` 5, `announcements.test.ts` 4).
- `apps/web` tüm paket: **753/753** yeşil (`pnpm --filter @xox/web exec vitest run`, koordinatör sondası sonrası son koşu).
- `pnpm --filter @xox/web build`: başarılı, Tailwind arbitrary-value sınıfları (`grid-cols-[repeat(var(--xox-n),...)]`, `outline-[length:var(--xox-focus-ring-width)]` vb.) gerçek CSS'e derleniyor (üretilen `.next/static/chunks/*.css` içinde doğrulandı).

## `pnpm gates` çıktısı (özet)

```
$ pnpm typecheck  → 7/7 paket başarılı
$ pnpm lint       → temiz (0 hata/uyarı)
$ pnpm format:check → temiz
$ pnpm test:coverage →
    @xox/shared    100/100/100/100
    @xox/ui-tokens 100/100/100/100
    @xox/game-core 100/100/100/100
    @xox/db        95.77/90.06/98.73/97.89 (bu karttan etkilenmedi)
    @xox/web       93.92/88.99/93.52/96.21 — 72 dosya, 753 test, hepsi yeşil
$ pnpm knip       → yalnız ön var olan config-hint'leri (30), unused export/file YOK
GATES_EXIT=0 (koordinatör sondası SONRASI son koşu, /tmp/gates_final.log)
GATES_EXIT=0
```

## Değişmezlerin doğrulaması

- **Kural mantığı yok:** `Board`/`CellButton`/`roving-grid.ts`/`cell-label.ts`/`announcements.ts` hiçbiri sıra/kazanan/geçerli-hamle kararı vermiyor; yalnız `@xox/game-core`'un `BoardConfig`/`cellCount`/`rowOf`/`colOf`'unu okuyor.
- **Metin gömme yok:** Görünür/duyurulan tüm metinler `tr.boardConfig.*` / `tr.game.*`'ten; `components/computer/**` Türkçe-karakter sondası hâlâ yeşil.
- **Erişilebilirlik:** `role=grid/row/gridcell` korunur, roving tabindex (tek durak, 3×3 dahil), `aria-label`/`aria-rowcount`/`aria-colcount`/`aria-rowindex`/`aria-colindex`, klavye haritası (ok/Home/End/Ctrl+Home/Ctrl+End/PageUp/PageDown, sarma yok).
- **Tasarım tokenları:** Tüm görsel değerler `--xox-grid-line`/`--xox-board-max`/`--xox-focus-ring-*`/`--xox-winning-outline-width`/`--xox-faded-opacity` üzerinden; hex/piksel literal yok (`eslint` hex yasağı + görsel inceleme).
- **Tailwind v4:** `tailwind.config.js` yok, `globals.css`'e dokunulmadı (bu kart onu üretmiyor, DESIGN-001a ürünü zaten donmuş).

## Bilinmeyen/ertelenen (bu kartın kapsamı dışı, E2E-BOARD-001'e devrediliyor)

KK-B50/51/52/53 (E2E: taşma yok, dokunma hedefi ölçümü, X/O kontrastı) ve
KK-B66 (axe sıfır ihlal) — kartın acceptance listesinde açıkça "E2E-BOARD-001'de
doğrulanır" diye işaretlenmiş, birim testine dahil edilmedi.

## Merge/push

Yapılmadı (kart talimatı: "Merge/push yok").
