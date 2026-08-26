# ADR-0010 — Tahta konfigürasyonu tek kaynak: `BoardConfig`, `size` ≠ `cellCount`, `BOARD_MODES` `game-core`'da

- **Tarih:** 2026-08-26 · **Görev:** ARCH-002 · **Durum:** kabul edildi
- **İlgili:** spec §2.1, SB-03 · KK-B01…B06, KK-B36
- **Öncelik:** bu özelliğin bütün diğer kararlarının ön koşulu

## Bağlam

Bugün repoda `BOARD_SIZE` adında **üç ayrı sabit** var ve **iki farklı şeyi** ifade ediyorlar:

| Yer                                   | Değer | Anlamı                                              |
| ------------------------------------- | ----- | --------------------------------------------------- |
| `packages/game-core/src/board.ts`     | `9`   | **hücre sayısı**                                    |
| `packages/db/src/models/room.ts`      | `9`   | **hücre sayısı** (shared'dan bağımsız ikinci kopya) |
| `apps/web/components/board/Board.tsx` | `3`   | **kenar uzunluğu**                                  |

Yani aynı ad, aynı dosya adı deseni, farklı birim. 3×3 sabit olduğu sürece bu hata üretmedi
(9 ve 3 birbirine karıştırılırsa test kırmızıya döner); N değişken olunca **karıştırma sessiz
kalır**: `size=6` iken 6 hücrelik bir döngü de, 36 hücrelik bir döngü de "çalışır" görünür.

Ayrıca konfigürasyonun **hangi pakette yaşayacağı** serbest değil: `packages/game-core` sıfır
bağımlılıklıdır ve `boundaries` politikası ona hiçbir hedefe izin vermez (`default: 'disallow'`).
Kazanma hatlarını üreten kod `game-core`'dadır ve konfigürasyona ihtiyaç duyar; dolayısıyla
konfigürasyon `shared`'da yaşayamaz — `game-core` onu import edemez.

## Karar

**1. İki ayrı ad, ikisi de fonksiyon/alan, hiçbiri "BOARD_SIZE" değil.**

```ts
// packages/game-core/src/config.ts  (YENİ)
export interface BoardConfig {
  /** KENAR uzunluğu: 3 | 6 | 11. Tahta size × size'dır. */
  readonly size: number
  /** Kazanmak için yan yana gereken taş sayısı (K). */
  readonly winLength: number
}

/** HÜCRE sayısı: size². Tek türetme noktası. */
export function cellCount(config: BoardConfig): number
```

`BOARD_SIZE` adı **repodan tamamen silinir** (üç kopyanın üçü de). Yeniden kullanılmaz —
"eski adı koruyup anlamını değiştirmek" bu karışıklığın kaynağıydı.

**2. `BOARD_MODES` elle yazılmış donmuş tablodur, formülden türetilmez.**

```ts
export const BOARD_MODES = Object.freeze([
  Object.freeze({ size: 3, winLengths: Object.freeze([3]), defaultWinLength: 3 }),
  Object.freeze({ size: 6, winLengths: Object.freeze([4, 5]), defaultWinLength: 4 }),
  Object.freeze({ size: 11, winLengths: Object.freeze([4, 5, 6]), defaultWinLength: 5 }),
])
export const DEFAULT_BOARD_CONFIG: BoardConfig = Object.freeze({ size: 3, winLength: 3 })
```

Spec §2.2'deki dört sınır (K ≥ 3 · N > 3'te K ≥ 4 · N > 3'te K ≤ N−1 · K ≤ 6) tabloya
**gerekçe** olarak yazılır, koda **kural** olarak yazılmaz. Kod tabloyu okur.

**3. `parseBoardConfig(input: unknown): ParseResult` tek doğrulama kapısıdır.**

Dönüş bir birlik: `{ ok: true; config: BoardConfig }` (donmuş, KK-B06) ya da
`{ ok: false; reason: BoardConfigRejection }`. Reddetme sebepleri **ayırt edilebilir**
(KK-B05): `'not-an-object' | 'size-not-integer' | 'unknown-size' | 'win-length-not-integer' |
'win-length-not-allowed'`. İstisna fırlatmaz — `TransitionResult` kalıbıyla aynı disiplin.

Boş/`null`/`undefined` girdi **hata değildir**: `DEFAULT_BOARD_CONFIG` döner (KK-B14/B15,
eski istemci kırılmaz). Kısmi girdi (`{size: 11}`) o boyutun `defaultWinLength`'ine düşer.

**4. Konum: `packages/game-core`. `packages/shared` yalnız yeniden dışa verir.**

`shared` zod şemalarını `BOARD_MODES`'tan **türetmez** — şemalar kendi sayısal sınırlarını
yazar (0..120, 9..121); tutarlılık ayrı bir testle iddia edilir (§ADR-0015). `apps/e2e`
yalnız `shared`'a bağlanabildiği için (`boundaries` politikası) konfigürasyon ilkelleri
`@xox/shared` üzerinden yeniden dışa verilir; `apps/e2e` `@xox/game-core`'u import **etmez**.

**5. Testler çıplak sayı yazar.** KK-B01/B02/B03 beklentileri `BOARD_MODES`'tan okunmaz;
elle yazılmış bir tablodan gelir (gotcha örüntü 2). Türetilmiş test (KK-B04: her varsayılan
kendi listesinin üyesi) **ilave**dir, tek kanıt değildir.

## Gerekçe

- **`size`/`cellCount` ayrımı adın kendisinde.** `cellCount(config)` çağrısı "bu bir hücre
  sayısı" bilgisini çağrı yerinde taşır; `BOARD_SIZE` taşımıyordu. `knip` kullanılmayan eski
  adı yakalar, `grep -c 'BOARD_SIZE'` sıfır olmalıdır (KK-B36 sondası).
- **Tablo neden formül değil:** gotcha örüntü 2. `winLengths`'i `[4..min(6, size-1)]` diye
  türetsek, tablodan bir satır silindiğinde ya da 6×6'ya K=6 sızdığında hiçbir test kırılmaz.
  Elle yazılmış tablo + elle yazılmış beklenti = silmeyi gören iki katman.
- **Neden `game-core`:** kazanma uzunluğu bir **kuraldır**, bir sunum ayarı değil.
  `CLAUDE.md` kural 4 ("kural mantığı yalnız `packages/game-core`") bunu zaten dayatıyor.
  Teknik olarak da tek seçenek: `game-core` `shared`'ı import edemez.
- **`parseBoardConfig` neden istisna fırlatmıyor:** çağıranların ikisi de (HTTP route,
  `resolveBoardConfig`) hatayı **veriye** çevirmek zorunda (400 gövdesi / gürültülü fallback).
  İstisna, her çağırana bir `try/catch` ve bir `instanceof` kontrolü ekletirdi.

## Reddedilen alternatifler

| Alternatif                                                                  | Neden reddedildi                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BOARD_SIZE` adını koruyup "kenar" anlamına çevirmek                        | Üç kopyadan ikisi hücre sayısıydı; anlamı değişen bir adı arama/değiştirme ile taşımak tam olarak sessiz sapmanın reçetesi. Ad silinir, iki yeni ad gelir.                                                                                                                                                                                      |
| `BOARD_MODES`'u formülden üretmek (`winLengths = range(4, min(6, size-1))`) | Kendine referanslı beklenti sınıfı: tablo bozulursa test de bozulur ve yeşil kalır (gotcha örüntü 2, kanıtlanmış olay: `move:applied.version` silindi, 187 test yeşil kaldı).                                                                                                                                                                   |
| Konfigürasyonu `packages/shared`'a koymak                                   | `game-core` `shared`'ı import **edemez** (`boundaries` + sıfır bağımlılık değişmezi). `winLines(config)` `game-core`'dadır ve konfigürasyonu görmek zorundadır. Tek çıkış yolu ikinci bir kopya olurdu.                                                                                                                                         |
| `BoardConfig`'i `size`'dan türetilen tek sayı (`mode: 3\|6\|11`) yapmak     | K ayarlanabilir (pazarlıksız girdi #2); tek sayı K'yi taşıyamaz. `{size, winLength}` çifti protokolde de, DB'de de, DOM'da da (`data-boyut`/`data-kazanma`) aynı şekilde görünür.                                                                                                                                                               |
| `Board` nesnesinin içine konfigürasyonu gömmek (`{cells, config}`)          | Spec KK-B22/B26/B27 imzaları konfigürasyonu **ayrı parametre** olarak yazıyor; ayrıca `db`/`web`'de `[...board]`, `board.map`, `board.length` kullanan onlarca satır struct'a geçerdi. Konfigürasyon-tahta uyuşmazlığı riski ADR-0011'de `cellAt`'in totalleştirilmesiyle **zararsızlaştırıldı** (uyuşmazlık artık hayalet galibiyet üretemez). |

## Sonuçlar

- ✅ Tek kaynak: üç kopya bir tabloya iner; `grep` sondası bunu mekanik olarak kanıtlar.
- ✅ Yeni bir boyut eklemek **tek dosyada bir satır** + testte bir satır demektir; başka hiçbir
  yerde sabit yoktur.
- ⚠️ `game-core`'un dışa açık yüzeyi büyür (`BoardConfig`, `BOARD_MODES`, `DEFAULT_BOARD_CONFIG`,
  `cellCount`, `parseBoardConfig`, `winLines`, `emptyBoard`). Yüzey bir **testle dondurulur**:
  `index.ts`'in export listesi elle yazılmış bir listeyle karşılaştırılır, sessizce büyüyemez.
- 📌 Kalıcı kural: bu repoda **"size" daima kenar, "cellCount" daima hücre**. Üçüncü bir ad
  (ör. `dimension`, `length`, `n`) üretilmez.
