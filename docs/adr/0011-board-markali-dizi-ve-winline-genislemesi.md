# ADR-0011 — `Board` markalı diziye, `WinLine` diziye: kapı korunur, tek kart tek commit

- **Tarih:** 2026-08-26 · **Görev:** ARCH-002 · **Durum:** kabul edildi
- **İlgili:** SB-01, SB-02, SB-03 · KK-B20, KK-B22, KK-B27, KK-B29, KK-B39
- **Öncelik:** P0 bloklayıcı — dört paketi birden hareket ettirir

## Bağlam

```ts
// packages/game-core/src/types.ts (bugün)
export type Board = readonly [Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell]
export type WinLine = readonly [number, number, number]
```

Analistin uyarısı: bu iki tuple çökünce zincir dört pakete yayılıyor. İddianın **her halkası
kod okunarak sınandı**; biri doğru çıkmadı:

| İddia                                                                                           | Doğrulama                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `board[4]` `Cell \| undefined` olur (`noUncheckedIndexedAccess: true`, `tsconfig.base.json:10`) | ✅ doğru                                                                                                                                                                                                                                                                                                                                                                                                          |
| `cellAt`'in "pakete özeldir" gerekçesi çöker → **dışa aktarılmak zorunda**                      | ❌ **YANLIŞ.** `game-core` dışında `Board`'u **indeksleyen tek bir satır yok.** Gerçek tüketiciler: `db/rooms/apply-move.ts` (yalnız `[...nextBoard]`), `web/components/computer/game-engine.ts` (yalnız tutuyor, hiç indekslemiyor), `shared/game-status.test.ts` (yalnız `evaluateStatus`'a geçiriyor). `cellAt`'in yorumundaki gerekçe ("tüketiciler `board[4]` yazar") **bugün zaten olgusal olarak yanlış**. |
| `WinLine` diziye dönünce `toTransportStatus`'taki `const [a,b,c]` kırılır                       | ✅ doğru — `noUncheckedIndexedAccess` altında `a,b,c` `number \| undefined` olur, tuple şemaya atanamaz                                                                                                                                                                                                                                                                                                           |
| `RoomDoc.result.line` ve `isNullOrExactLength(3)` etkilenir                                     | ✅ doğru (`db/models/room.ts:146`, `db/models/game.ts`)                                                                                                                                                                                                                                                                                                                                                           |

İkinci ve daha önemli gözlem: **tuple bugün iki iş yapıyor.**
(i) indeks totalliği, (ii) **`boardFromCells` kapısının kanıtı** — `Cell[]` bir `Board` değildir,
dolayısıyla doğrulamadan geçmemiş bir dizi `evaluateStatus`'a giremez. `board.ts`'in yorumu bunu
açıkça yazıyor: _"Dışarıdan gelen diziyi tahtaya çevirir; `Board`'a giden tek yol budur."_

Düz `readonly Cell[]`'e geçmek (i)'yi `cellAt` ile telafi eder ama **(ii)'yi sessizce yok eder**:
`db/rooms/apply-move.ts` `boardFromCells(room.board)` yazmak yerine `room.board`'ı doğrudan
`evaluateStatus`'a geçirebilir ve **hiçbir kapı ateşlenmez**. Değişken boyutla bu kayıp
büyür, çünkü artık uzunluk da doğrulanmak zorundadır (E-18: `size:11` ama `board` 9 hücre).

## Karar

**1. `Board` markalı (branded) salt-okunur dizidir.**

```ts
declare const boardBrand: unique symbol
export type Board = readonly Cell[] & { readonly [boardBrand]: true }
```

Okuma (`length`, `for..of`, `.map`, `[...board]`) serbest; **üretim yalnız `boardFromCells`
üzerinden**. Yayma sonucu (`[...board]`) marka taşımaz — istenen davranış budur: DB'ye/protokole
yazılan şey düz `Cell[]`'dir.

**2. `boardFromCells(cells, config = DEFAULT_BOARD_CONFIG)` uzunluğu konfigürasyona göre doğrular.**
Bugünkü hücre-değeri doğrulaması (`'X' | 'O' | null` dışını reddetme) **aynen korunur**.

**3. `cellAt` pakete özel KALIR — ama TOTAL hâle gelir.**

```ts
function cellAt(board: Board, index: number): Cell {
  return board[index] ?? null // aralık dışı = boş, ASLA undefined
}
```

Bu tek satır, bugünkü `as Cell` cast'inin gizlediği en tehlikeli sınıfı kapatır: yanlış
konfigürasyonla taranan bir tahtada `undefined === undefined` karşılaştırması **hayalet
galibiyet** üretebilirdi. `?? null` ile aralık dışı okuma boş hücre olur, hiçbir hat tamamlanmaz.
Dal testtir (`cellAt(board, 999) === null`), savunmacı değildir — kapsam %100 kalır (KK-B29).

**4. `WinLine = readonly number[]`.** `WIN_LINES` sabiti **silinir**, yerine `winLines(config)`
gelir (ADR-0012). `game-core`'un `GameStatus.won.line` alanı bu tipi taşır.

**5. `EMPTY_BOARD` silinir, `emptyBoard(config)` gelir** (memoize + donmuş). Tek üretim tüketicisi
`web/components/computer/game-engine.ts`'tir ve aynı commit'te güncellenir.

**6. Atomik birim: `CORE-CFG-001` — tek kart, tek worktree, tek commit.** Kapsam:

```
packages/game-core/src/{types,config,board,status,moves,index}.ts + testleri
packages/shared/src/game-status.ts          (winLineSchema → 3..6 dizi; toTransportStatus)
packages/db/src/models/validators.ts        (isNullOrExactLength → isNullOrLengthBetween)
packages/db/src/models/{room,game}.ts       (line doğrulayıcısı; room.ts'teki yerel BOARD_SIZE silinir)
apps/web/components/computer/game-engine.ts (EMPTY_BOARD → emptyBoard)
```

Diğer **bütün** imzalar `config = DEFAULT_BOARD_CONFIG` varsayılanı alır; böylece
`db/rooms/apply-move.ts`, `web/lib/game/room-view.ts`, `web/lib/realtime/**` bu kartta
**hiç açılmaz** ve 3×3 davranışı bit düzeyinde değişmez.

## Gerekçe

- **Analistin "SB-01 + SB-02 tek kart" önerisi kabul edildi — ama gerekçesi düzeltildi.**
  Birleştirmenin sebebi `cellAt`'in dışa aktarılması **değil** (gerekmiyor); sebep şu:
  `WinLine`'ın genişlemesi `game-core` → `shared` (`winLineSchema`, `WinLineCells`) →
  `db` (`RoomDoc.result.line`, `GameDoc.winLine`, `isNullOrExactLength(3)`) zincirinde
  **metinsel çakışma olmadan** typecheck kırıyor. Bu, 2026-08-25'te `W1-03`'ün fixture'ının
  `W1-02`'nin zorunlu alanını bilmemesiyle yaşanan blocker'ın **aynı sınıfı**. İki ayrı kart,
  ayrı ayrı yeşil, birleşince kırmızı olurdu.
- **Kapsam daha da genişletildi (SB-03 + db doğrulayıcıları dahil):** tip "3..6 indeks" derken
  mongoose doğrulayıcısının "tam 3" demesi, yalnız çalışma zamanında ve yalnız 6×6 ilk kez
  oynandığında patlayan bir tutarsızlık olurdu. Tipin ve doğrulayıcının **aynı commit'te**
  hareket etmesi şart.
- **Marka neden şart:** kapıyı kaybetmek, E-18'in ("`size:11` var ama `board` 9 hücre") tek
  mekanik savunmasını kaybetmek demek. Marka, `cells as Board` cast'ini **gereksiz olmaktan
  çıkarır** (`no-unnecessary-type-assertion` bu yüzden ateşlenmez) ve kapıyı tip düzeyinde
  korur — düz `readonly Cell[]` ile cast kimlik dönüşümü olur ve lint onu siler.
- **`cellAt` neden hâlâ pakete özel:** olgu (hiçbir tüketici indekslemiyor) + politika
  (`game-core`'un donmuş yüzeyi gereksiz büyümesin). Yüzey `index.ts` export listesini elle
  yazılmış bir listeyle karşılaştıran bir testle kilitlenir.

## Reddedilen alternatifler

| Alternatif                                                               | Neden reddedildi                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Düz `readonly Cell[]` + `cellAt`'i dışa aktarmak (analistin ilk okuması) | `boardFromCells` kapısını yok eder: doğrulanmamış `Cell[]` `evaluateStatus`'a girebilir hâle gelir ve E-18 tespit edilemez. Ayrıca hiçbir tüketici indekslemediği için `cellAt`'i dışa aktarmak **gereksiz** yüzey büyümesi.                                                                                                   |
| `Board`'u `{ cells, config }` struct'ına çevirmek                        | Konfigürasyon-tahta uyuşmazlığını tipte çözerdi ama `[...board]` / `board.length` / `board.map` yazan her satırı (db, web, shared testleri) değiştirirdi ve spec'in `evaluateStatus(board, config)` imzasıyla çelişirdi. Uyuşmazlığın **zararlı** kısmı (hayalet galibiyet) `cellAt`'in totalleştirilmesiyle zaten yok edildi. |
| Boyuta göre ayrı tuple'lar (`Board3 \| Board6 \| Board11`)               | 121 elemanlı bir tuple tipi TS'i pratikte kilitler; ayrıca üç varyantlı birlik her tüketiciye bir `switch` ekletir.                                                                                                                                                                                                            |
| SB-01 ve SB-02'yi iki ayrı karta bölmek                                  | Metinsel çakışma yok ama typecheck çakışması var — "branch'ler tek tek yeşil, birleşince kırmızı" sınıfı. Bu gece bir kez yaşandı, tekrar edilmez.                                                                                                                                                                             |
| `game-core` sürüm sıçraması yapıp eski `Board`'u deprecated bırakmak     | Workspace paketleri derlenmiyor, kaynak dışa veriliyor (decisions.md 2026-08-24) — iki sürüm bir arada yaşayamaz.                                                                                                                                                                                                              |

## Sonuçlar

- ✅ 3×3 davranışı ve `ai.test.ts`'in tümevarımsal yenilmezlik kanıtı **hiç dokunulmadan** geçer
  (KK-B20): tüm yeni parametreler varsayılanlıdır.
- ✅ Doğrulama kapısı **güçlenir**: artık hücre değeri + uzunluk birlikte doğrulanıyor.
- ✅ `cellAt`'in totalleşmesi, konfigürasyon uyuşmazlığında hayalet galibiyet sınıfını yok eder.
- ⚠️ `CORE-CFG-001` beş pakete/dosya kümesine dokunan **büyük** bir karttır. Bölünemez; bunun
  bedeli tek bir agent'ın uzun koşusudur. Kart raporunda merge sonrası
  `pnpm exec turbo run typecheck --force` çıktısı (`Cached: 0`) **zorunlu** kanıttır.
- ⚠️ `EMPTY_BOARD` silindiği için `apps/web` bu kartın çakışma kümesine girer (tek dosya).
  Aynı dalgada `apps/web/components/computer/**`'a dokunan başka bir kart **olamaz**.
- 📌 Kalıcı kural: bu repoda bir tipin tek işi "şekil" değilse (aynı zamanda bir **kapıyı**
  kanıtlıyorsa), o tip genişletilirken kapının nasıl korunacağı ayrıca karara bağlanır.
