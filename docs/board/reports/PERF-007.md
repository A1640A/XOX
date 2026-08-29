# PERF-007 — `/oda/[kod]` ölçüm tablosu + Analytics/SpeedInsights katkısı (OPS-011)

## Sonuç özeti

**Bütçe İHLAL EDİLMEDİ, değişiklik GEREKMEDİ.** `/oda/[kod]` 225.16 kB gzip, bütçe 235 kB,
pay 9.84 kB — hâlâ sağlıklı. Bu gecenin +3.08 kB büyümesi (222.08 → 225.16) `DESIGN-001b`
(+1.12), `CTR-004` (+0.03) ve kalan ~1.93 kB `W3-02`/`W3-03`'ün paylaşılan grafiğe eklediği
gürültüden geliyor — meşru, tek bir agent'a atfedilebilir bir regresyon değil.

`apps/web/components/room/**` (bu kartın yazma alanı) zaten yalıntı: her bileşen ya salt
`react`/`@xox/shared` küçük ithalat yapıyor ya da hiç harici bağımlılık taşımıyor. **Bulunacak
bir "kolay düzeltme" YOK bu kapsamda** — bu bir başarısızlık değil, ölçülmüş bir sonuç.

Ayrıca gerçek bir sızıntı bulundu (`@xox/game-core` barrel'ının minimax'ı `/` ve
`/oda/[kod]`'e sızdırması, ~3.1 kB gzip) ama kaynağı (`packages/game-core/package.json`,
`apps/web/components/board/Board.tsx`, `apps/web/components/home/HomeActions.tsx`) bu
kartın çakışma kümesi DIŞINDA — düzeltilmedi, ayrı karta bırakıldı (aşağıya bkz.).

## Yöntem — ÖNCE ÖLÇ, SONRA DÜZELT (`PERF-004`'ün dersi)

1. `pnpm --filter @xox/web build` çalıştırıldı (Turbopack).
2. `.next/diagnostics/route-bundle-stats.json`'dan `/oda/[kod]`'in **gerçek** ilk-yükleme
   chunk listesi okundu (10 dosya).
3. Her chunk `wc -c` (ham) + `gzip -9 -c | wc -c` (gzip) ile ölçüldü.
4. İçerik **tahmin edilmedi** — her chunk `grep -oE` ile ayırt edici string'ler için
   tarandı (`ZodObject`, `SessionProvider`, `chooseMove`, `react-dom`, `_vercel/insights`
   vb.) ve hangi rotaların hangi chunk'ları PAYLAŞTIĞI (`route-bundle-stats.json`'daki 12
   rotanın tam chunk listesi karşılaştırılarak) çıkarıldı.
5. `pnpm exec size-limit`'in kendi gzip hesabıyla (Node zlib, `gzip -9` CLI'dan biraz farklı
   seviye) resmi sayı (225.16 kB) doğrulandı.

## Ölçüm tablosu — `/oda/[kod]`'in 10 ilk-yükleme chunk'ı

| Chunk dosyası                         | Ham (B) | Gzip (B, `gzip -9`) | Gzip (kB) | Kimin arasında paylaşılıyor                                                                                      | İçerik (grep ile doğrulandı)                                                                                                                          |
| ------------------------------------- | ------: | ------------------: | --------: | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2szzjumnrwggp.js`                    |  14 374 |               3 687 |     3.687 | **TÜM 12 rota**                                                                                                  | çerçeve yardımcıları (ayırt edici string yok — küçük ortak glue)                                                                                      |
| `0zqkqiuyrlt_x.js`                    |  29 286 |              10 832 |    10.832 | **TÜM 12 rota**                                                                                                  | `next-auth` `SessionProvider`/`useSession` + `@vercel/analytics` + `@vercel/speed-insights` (aşağıya bkz.)                                            |
| `28i3psxhu-vr6.js`                    |  37 901 |              12 874 |    12.874 | **yalnız `/oda/[kod]`**                                                                                          | `RoomScreen` ağacı: `use-room` WS istemcisi (`reconnect`), emoji/pes-et/kopyala metinleri, **+ `chooseMove`'un TAM GÖVDESİ** (bkz. "Bulunan sızıntı") |
| `3lbfsuatfhxh9.js`                    | 217 715 |              45 799 |    45.799 | ağır katman (`/`, `/oda/[kod]`, `/oda/katil`, `/arkadaslar`, `/gecmis`, `/siralama`)                             | klasik `zod` (`ZodObject`/`ZodString`/`ZodDiscriminatedUnion`) — gerçek zamanlı WS protokolü şemaları                                                 |
| `0i8vuyke0uxew.js`                    |  82 754 |              20 390 |    20.390 | orta+ağır katman (yukarıdakiler + `/profil`, `/kayit`; `/giris`/`/oyna/bilgisayar`/`/_not-found`/`/davet` HARİÇ) | `zod/mini` çekirdeği (`PERF-005`)                                                                                                                     |
| `1jpqf4yqkdil0.js`                    |  17 139 |               4 962 |     4.962 | **TÜM 12 rota**                                                                                                  | çerçeve yardımcıları                                                                                                                                  |
| `2a2uv6dg_fcrn.js`                    |  27 559 |               7 411 |     7.411 | **TÜM 12 rota**                                                                                                  | çerçeve yardımcıları                                                                                                                                  |
| `0swde627s35lo.js`                    | 229 154 |              71 667 |    71.667 | **TÜM 12 rota**                                                                                                  | `react-dom` çalışma zamanı (string doğrulandı) — en büyük tekil parça, TÜM rotalarda sabit taban                                                      |
| `1ur4oq5735hqv.js`                    | 155 439 |              42 710 |    42.710 | **TÜM 12 rota**                                                                                                  | Next.js istemci çerçeve çalışma zamanı                                                                                                                |
| `turbopack-2d2x_-44vaq39.js`          |  10 946 |               4 335 |     4.335 | **TÜM 12 rota**                                                                                                  | Turbopack modül yükleyici                                                                                                                             |
| **TOPLAM (`gzip -9`, kendi ölçümüm)** | 822 267 |             224 667 |   224.667 | —                                                                                                                | —                                                                                                                                                     |
| **`pnpm exec size-limit` resmi**      |       — |                   — |   225.160 | —                                                                                                                | (küçük fark Node zlib vs. `gzip -9` CLI seviyesinden — aynı büyüklük mertebesi)                                                                       |

**Katmanlar** (7 "tüm rota" chunk'ının toplamı = 145.604 kB) `/_not-found`'un ölçülen
145.25 kB'sıyle (size-limit) örtüşüyor — yani base kabuk gerçekten HER rotada sabit taban.

## `<Analytics />` + `<SpeedInsights />` katkısı — OPS-011 için

**`layout.tsx`'e DOKUNULMADI** (kartın açık yasağı). Ölçüm yöntemi: iki paketin `next` giriş
noktaları (`@vercel/analytics/dist/next/index.mjs`, `@vercel/speed-insights/dist/next/index.mjs`)
`esbuild --bundle --minify --format=esm --external:react` ile İZOLE paketlendi (repo'daki
`node_modules/.pnpm` içindeki gerçek kurulu sürümler, 2.0.1 / 2.0.0) ve `gzip -9` ile ölçüldü.
Bu yöntem gerçek Turbopack çıktısını birebir yansıtmaz ama aynı sınıf minifier (terser-benzeri)
kullandığı için büyüklük mertebesi güvenilir bir vekildir; ayrıca chunk içeriği incelemesi
(`0zqkqiuyrlt_x.js`'in TAMAMI 10.832 kB, `_vercel/insights` VE `_vercel/speed-insights` ikisi
de bu TEK chunk'ta) sonucu doğruluyor.

| Ölçüm                                                    | Ham (B) | Gzip (B) | Gzip (kB) |
| -------------------------------------------------------- | ------: | -------: | --------: |
| `<Analytics />` tek başına (izole paketlenmiş)           |   3 861 |    1 656 |     1.656 |
| `<SpeedInsights />` tek başına (izole paketlenmiş)       |   3 521 |    1 522 |     1.522 |
| **İkisi AYNI modülde birlikte** (gerçek durumu yansıtır) |   7 373 |    2 207 | **2.207** |

İkisi birlikteyken toplam, ayrı ayrı toplamından (3.178 kB) küçük — gzip'in iki yapısal
olarak neredeyse özdeş dosya arasındaki tekrar eden örüntüleri (aynı `computeRoute`,
`escapeRegExp`, `isBrowser` şablonları) sıkıştırması yüzünden.

**Sonuç: `<Analytics />` + `<SpeedInsights />` birlikte ≈ 2.2 kB gzip**, ve bu maliyet
`0zqkqiuyrlt_x.js` (TÜM 12 rotanın ortak kabuğu) içinde — yani **her sayfa yüklemesinde**
ödeniyor, yalnız ağır rotalarda değil. Lead'in ölçtüğü gibi `SpeedInsights` ÇALIŞIYOR
(`/_vercel/speed-insights/script.js` → 200), `Analytics` ÇALIŞMIYOR (proje ayarında Web
Analytics kapalı, `/_vercel/insights/script.js` → 404). Yani bu 2.2 kB'nin kabaca
**1.66 kB'lik dilimi** (Analytics'in kendi payı) şu an **hiçbir veri üretmeden** her ziyarette
indiriliyor. `layout.tsx`'e dokunma kararı Ömer'in (`OPS-011`) — bu kart yalnız sayıyı üretti.

## Bulunan sızıntı (bu kartın çakışma kümesi DIŞINDA — düzeltilmedi)

`/` ve `/oda/[kod]`'in kendi sayfa chunk'ları (`08mclssh_v5ns.js`, `28i3psxhu-vr6.js`)
`chooseMove`'un **derlenmiş gövdesini** içeriyor (yalnız isim değil — `grep -oE
".{80}chooseMove.{80}"` ile fonksiyon gövdesi doğrulandı: `...budgetMs:i.budgetMs,now:i.now}).move}e.s(["chooseMove",...`).
Diğer ağır rotalar (`/oda/katil`, `/arkadaslar`, `/gecmis`, `/siralama`) bunu TAŞIMIYOR —
sondayla doğrulandı (`grep -c chooseMove` → 0 hepsinde).

**Kök neden zinciri:**

- `apps/web/components/board/Board.tsx` `cellCount`'u `@xox/game-core`'un ANA barrel'ından
  (`import { cellCount } from '@xox/game-core'`) çekiyor, alt yoldan değil.
- `apps/web/components/home/HomeActions.tsx` aynı şekilde `DEFAULT_BOARD_CONFIG`'i ana
  barrel'dan çekiyor (yalnız `/` bunu render ediyor).
- `packages/game-core/src/index.ts` `export { bestMove, chooseMove } from './ai'`'ı
  KOŞULSUZ yeniden dışa veriyor; `ai.ts` → `ai-config.ts` + `search.ts`'i (minimax + arama)
  içeri çekiyor.
- `packages/game-core/package.json`'da **`"sideEffects": false` YOK** — `packages/shared`
  tam bu sınıf sızıntıyı `PERF-005`'te bu alanı ekleyerek kapatmıştı
  (`docs/board/reports/PERF-005.md`, madde 1). `game-core` aynı düzeltmeyi hiç almadı.
- Kontrol sondası: `esbuild`'in KENDİSİ (sideEffects alanı olmadan bile) bu barrel importunu
  doğru tree-shake ediyor (izole test edildi, `ai.ts` DIŞARIDA kaldı) — yani hata evrensel bir
  ESM gerçeği değil, Turbopack'in bu barrel şeklini (ya da `sideEffects` alanının YOKLUĞUNU)
  ele alış biçimine özgü. Bu, doğrulanmadan "esbuild'de de aynı olur" varsayılmadı; ayrıca
  test edildi.

**Ağırlık** (izole `esbuild --bundle --minify` ile `bestMove`+`chooseMove` — yani
`ai.ts`+`ai-config.ts`+`search.ts`'in tamamı): **7 663 B ham / 3 117 B gzip (≈ 3.1 kB)**.
`/oda/[kod]`'in kendi 12.874 kB'lık chunk'ının **~%24'ü** bu KULLANILMAYAN minimax kodu
(online odalarda AI hiç çalışmaz — o yalnız `/oyna/bilgisayar`'ın kendi `next/dynamic`
sınırının arkasında gerekli, `PERF-003`).

**Neden bu kart düzeltmedi:** Kaynak dosyaların hiçbiri (`packages/game-core/package.json`,
`apps/web/components/board/Board.tsx`, `apps/web/components/home/HomeActions.tsx`) bu kartın
çakışma kümesinde (`.size-limit.mjs`, `apps/web/components/room/**`, bu rapor) değil.
`apps/web/components/board/**` ve `apps/web/components/home/**` genel yazma alanımda
(`apps/web/components/**`) olsa da, **bu kartın kendi çakışma kümesi daha dar tanımlanmış**
ve lead protokolü "kart kümesi ile çelişirse kart kazanır" der — ama burada çelişki YOK,
kart yalnız `apps/web/components/room/**`'i açıkça listeliyor, board/home'u AÇMIYOR. Paralel
bir kart o dosyaları açmış olabilir; dokunmadım.

**Önerilen takip kartı:**

1. `packages/game-core/package.json`'a `"sideEffects": false` ekle.
2. `Board.tsx`: `import { cellCount } from '@xox/game-core'` → `from '@xox/game-core/config'`
   (zaten mevcut `exports` haritasında: `"./board"`, `"./status"`, alt yollar; `cellCount`
   `config.ts`'te tanımlı — `"./config"` alt yolu YOK, önce eklenmesi gerekebilir).
3. `HomeActions.tsx`: `DEFAULT_BOARD_CONFIG`'i aynı şekilde alt yoldan çek.
4. Beklenen kazanç: `/` ve `/oda/[kod]`'de ~3.1 kB gzip (payı 9.84 → ~12.9 kB'ye çıkarır).

## Değişiklik yapıldı mı — `pnpm size-limit` öncesi/sonrası

**Bütçe sayıları DEĞİŞMEDİ** (`HEAVY_LIMIT`/`MEDIUM_LIMIT`/`LIGHT_LIMIT` aynı, hiçbir rota
sınıflandırması taşınmadı). Tek değişiklik `.size-limit.mjs`'e bu ölçümü belgeleyen bir
yorum bloğu eklemek — kod DAVRANIŞI değişmedi.

- Öncesi: `pnpm exec size-limit` → `/oda/[kod]` 225.16 kB / 235 kB (aynı)
- Sonrası: `pnpm exec size-limit` → `/oda/[kod]` 225.16 kB / 235 kB (aynı, `.mjs` yorum
  değişikliği chunk üretimini etkilemez)

## `pnpm gates`

**Lead tamamladı** (ajan oturum limitine takılıp tam burada kesildi):

```
pnpm gates        → exit 0   (altı kapının hepsi)
pnpm size-limit   → /oda/[kod] 225.16 kB / 235 kB   (pay 9.84 kB, İHLAL YOK)
```

## Değişen dosyalar

- `.size-limit.mjs` — yalnız yorum eklendi (PERF-007 ölçüm bulgusu + OPS-011 verisi +
  bulunan sızıntının belgelenmesi). Bütçe SAYILARI değişmedi.
- `docs/board/reports/PERF-007.md` — bu rapor.
- `apps/web/components/room/**` — DOKUNULMADI (incelendi, zaten yalıntı, düzeltilecek bir
  şey bulunamadı).
- `apps/web/app/layout.tsx` — DOKUNULMADI (kartın yasağı, yalnız ölçüldü).

## Commit

`feat/PERF-007` dalında, `main`'e merge/push YAPILMADI (kartın talimatı).

---

## Lead notu — bu rapor KURTARILDI

Ajan oturum limitine (`rate_limit`, 06:00'da sıfırlanan oturum kotası) takılarak tam
`pnpm gates` adımında kesildi ve **raporu yanlışlıkla ANA checkout'a** yazmıştı
(`/Users/omerdursun/PROJELER/XOX/docs/board/reports/PERF-007.md`). Lead dosyayı fark edip
worktree'ye taşıdı, kapıları kendisi koştu ve raporu tamamladı. Ölçüm verisi kaybolmadı.

Bu, `CLAUDE.md` kural 6'nın (`git add -A` KULLANMA) tam olarak koruduğu durumdur: kör bir
staging bu dosyayı merge edilmemiş bir işin raporu olarak `main`'e sokardı.
