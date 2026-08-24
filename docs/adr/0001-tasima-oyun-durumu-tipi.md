# ADR-0001 — Taşıma katmanı oyun durumu tipi: `line` nullable + `reason`

- **Tarih:** 2026-08-24 · **Görev:** ARCH-001 · **Durum:** kabul edildi
- **İlgili:** spec §8 B1/B2/B8 · KK-050, KK-054, KK-057, KK-072, KK-074
- **Öncelik:** P0 bloklayıcı

## Bağlam

`@xox/shared`'daki `gameStatusSchema.won` varyantı `line`'ı **zorunlu** kılıyor:

```ts
z.object({ kind: z.literal('won'), winner: playerSchema, line: z.tuple([...]) })
```

Bu tip `@xox/game-core`'un `GameStatus` tipinin birebir kopyasıdır ve saf kural motoru için
doğrudur: motorun bildiği tek galibiyet biçimi üç taşın hizalanmasıdır.

Ama ürün dört bitiş biçimi tanımlıyor: `line`, `resign` (KK-054), `timeout` (KK-074),
`abandon` (KK-072). Son üçünde **kazanan çizgi yoktur**. Mevcut şemayla bu üç sonuç ağ üzerinden
**hiç ifade edilemiyor** — istemciye "kazandın" demenin yolu yok. P0 bloklayıcısı.

İkincil boşluklar aynı kökten: `move:rejected.reason` serbest `string` (B8, testler string
karşılaştırmasına dayanır ve yazım hatasıyla sessizce geçer), `state` mesajında `turnDeadline`
ve rakip **adı** yok.

## Karar

1. **`@xox/game-core`'un `GameStatus` tipi değişmez.** Motor pes etme kavramını bilmez ve
   bilmemelidir. %100 kapsam ve %98.56 mutasyon skoru olan sertleştirilmiş bir paket, ürün
   kavramları yüzünden açılmaz.

2. `@xox/shared`'da **ayrı bir taşıma tipi** tanımlanır (`packages/shared/src/game-status.ts`):

```ts
export const endReasonSchema = z.enum(['line', 'resign', 'timeout', 'abandon'])

export const transportStatusSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('playing'), turn: playerSchema }),
    z.object({
      kind: z.literal('won'),
      winner: playerSchema,
      line: winLineSchema.nullable(), // <- nullable
      reason: endReasonSchema, // <- yeni
    }),
    z.object({ kind: z.literal('draw') }),
  ])
  .superRefine(/* reason==='line'  <=>  line !== null */)
```

3. İki yönlü değil, **tek yönlü** köprü:
   - `toTransportStatus(status: GameStatus): TransportStatus` → `reason: 'line'`
   - `forfeitStatus(winner, 'resign'|'timeout'|'abandon'): TransportStatus` → `line: null`
     Ters yön (taşıma → motor) **yazılmaz**: motor bu bilgiye ihtiyaç duymaz, yazılırsa kural
     mantığının taşıma tipine sızması için bir kapı açılır.

4. `move:rejected.reason` daraltılır:
   `z.enum(['out-of-range','occupied','game-over','not-your-turn'])` —
   `InvalidMoveReason ∪ {'not-your-turn'}`. Derleme zamanı sondası `game-core` genişlerse kırılır.

5. `state` mesajı genişletilir: `turnDeadline`, `graceEndsAt`, `serverTime`, `you`,
   `players` (userId **+ görünen ad**), `rematch`.

6. `error.code` serbest `string` olmaktan çıkar: `errorCodeSchema` enum'u `tr.errors`
   anahtarlarıyla birebir eşlenir; `hata-mesaji` `data-kod` bu enum'dan gelir.

## Gerekçe

- **Değişmez tek yerde kodlanır:** `reason === 'line' ⟺ line !== null`. `superRefine` bunu şema
  seviyesinde dayatır; hiçbir sunucu kod yolu tutarsız bir sonuç yayınlayamaz. Bir yorum
  satırıyla değil, çalışma zamanı doğrulamasıyla.
- **`game-core` saf kalır.** Kural motoruna "pes etme" eklemek, onun tek sorumluluğunu
  (tahta → sonuç) bulandırırdı ve mutasyon testinin anlamını zayıflatırdı.
- **`reason` istemciye metni seçtirir.** `tr.game`'de dört ayrı metin var
  (`youWon` / `wonByResign` / `wonByTimeout` / `wonByAbandon`); bunları `reason` olmadan
  ayırt etmek için istemcinin ayrı bir olay geçmişi tutması gerekirdi.
- **`you` alanı** oturum kimliğini istemci JS'ine taşımadan "Kazandın!/Kaybettin." ayrımını
  mümkün kılar; bağlantı başına gönderildiği için doğal olarak kişiselleştirilebilir.
- **`serverTime`** olmadan `turnDeadline` işe yaramaz: istemci saati birkaç dakika kayıksa
  geri sayım anında sıfırlanır (spec §3.10 "istemci saati yanlış" satırının tek gerçek çözümü).

## Reddedilen alternatifler

| Alternatif                                                                  | Neden reddedildi                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game-core`'un `GameStatus`'una `reason` eklemek                            | Kural motoruna ürün kavramı sokar; 91 testin ve mutasyon skorunun anlamını değiştirir; "kural mantığı yalnız game-core" değişmezini **ters yönden** ihlal eder (ürün mantığı game-core'a sızar) |
| `line: WinLine \| []` (boş dizi)                                            | "Boş dizi = çizgi yok" konvansiyonu yazılı olmayan bir bilgi; `line.length === 3` kontrolü her tüketiciye dağılır. `null` tipte görünür                                                         |
| Ayrı `game:over` mesajında sebep taşımak, `status`'u değiştirmemek          | Yeniden bağlanan istemci `game:over`'ı kaçırır ve yalnız `state` alır (§3.4) — sebep kaybolur, sonuç metni yanlış çıkar                                                                         |
| `reason`'ı zorunlu yapmayıp `line === null` ise "bir şekilde kazandı" demek | Üç farklı Türkçe metin ayırt edilemez; KK-054/072/074'ün metin iddiaları düşer                                                                                                                  |
| `move:rejected.reason`'ı string bırakmak                                    | Testler string eşleşmesine dayanır; `'notYourTurn'` yazım hatası sessizce geçer ve E2E'de "hiçbir şey olmadı" olarak görünür                                                                    |

## Sonuçlar

- ✅ Dört bitiş biçimi de protokolde ifade edilebilir; P0 bloklayıcısı kalkar.
- ✅ `game-core` dokunulmadan kalır; mutasyon/kapsam kanıtları geçerliliğini korur.
- ⚠️ `serverMessageSchema` **kırıcı** değişiklik. Tek tüketicisi henüz yazılmamış olduğu için
  maliyeti sıfır — ama bu pencere Dalga 0'dan sonra kapanır. Şema değişiklikleri Dalga 0a'da
  toplandı, bu yüzden sonraki dalgalar protokol değiştirmez.
- ⚠️ `superRefine` kullanıldığı için `transportStatusSchema` artık `ZodEffects`'tir;
  `discriminatedUnion` içine **doğrudan gömülemez**. Şemayı kullanan yerler
  `transportStatusSchema` değişkenini kullanır, iç birliği değil. `ws-protocol.ts`
  bu yüzden iç birliği `transportStatusInnerSchema` olarak ayrıca dışa verir.
- 📌 Kalıcı kural: **taşıma tipi ≠ alan tipi.** Bir ürün kavramı kural motoruna sızmak
  istediğinde, doğru yer `shared`'daki taşıma tipidir.
