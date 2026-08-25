# PERF-002 — size-limit bütçe aşımı

## Şüphe doğrulandı: tek glob TÜM rotaların JS'ini tek bütçede topluyordu

`.size-limit.json` şuydu:

```json
{ "path": "apps/web/.next/static/chunks/**/*.js", "limit": "180 kB", "gzip": true }
```

`apps/web/.next/static/chunks/` Turbopack'te DÜZ bir dizin — 7 rotanın TÜMÜNÜN ilk-yükleme
parçaları + hiçbir rotanın ilk yüklemesinde olmayan (`_global-error`'a özel, 14 kB ham) bir parça
aynı klasörde, rastgele içerik-hash'li dosya adlarıyla duruyor. Glob rota ayrımı yapmıyor, hepsini
tek akışta gzip'liyor. Kanıt: kendi ortamımda `pnpm exec size-limit` ile ölçülen `263.57 kB` ile
CI-002'nin rapor ettiği `263.57 kB` **birebir aynı** — yani hiçbir kullanıcının tek başına
indirmediği "tüm rotaların toplamı" ölçülüyordu. Ayrıca doğrudan doğrulama: tüm `.js` dosyalarını
tek akışta birleştirip gzip'lersem de `263.52 kB` çıkıyor (aradaki ~50 B, size-limit'in kendi
gzip/dosya-sırası detayından).

**Ek keşif:** `next build`'in çıktısındaki `Route (app)` tablosunda hiç boyut sütunu yok.
Sebebi kod hatası değil — **Next.js 16, "First Load JS" metriğini build çıktısından tamamen
kaldırdı** ("bu metrikler RSC mimarilerinde yanıltıcıydı, hem Turbopack hem Webpack anlaşamıyordu"
— `next/dist/docs/01-app/02-guides/upgrading/version-16.md`, "Performance Improvements"). Bunun
yerine resmi bir diagnostic dosyası üretiyor: `apps/web/.next/diagnostics/route-bundle-stats.json`
— rota başına gerçek ilk-yükleme JS parça listesi. Rota bazlı tabloyu BUNDAN türettim.

## Rota bazlı tablo (ölçüldü, `pnpm --filter @xox/web build` + `route-bundle-stats.json`)

`size-limit`'in KENDİ gzip hesabıyla (her parça ayrı gzip'lenip toplanıyor):

| Rota               | Ham (raw) KB | Gzip (size-limit) | Not                                   |
| ------------------ | -----------: | ----------------: | ------------------------------------- |
| `/oda/[kod]`       |       763.21 |         214.65 kB | en ağır rota                          |
| `/oyna/bilgisayar` |       760.20 |         213.61 kB | minimax burada, ama kendi payı küçük  |
| `/`                |       758.11 |         212.88 kB |                                       |
| `/kayit`           |       757.85 |         212.75 kB |                                       |
| `/giris`           |       757.43 |         212.63 kB |                                       |
| `/profil`          |       464.94 |         142.39 kB | farklı, daha hafif paylaşılan JS seti |
| `/_not-found`      |       464.27 |         141.96 kB |                                       |

(Kaba çapraz-kontrol için ham dosyaları tek akışta birleştirip gzip'lersem ~9 kB daha düşük çıkıyor
— `/oda/[kod]` için 205.72 kB — fark, size-limit'in dosya-başı gzip toplamasından kaynaklanıyor.
Rapor ve bütçeler `size-limit`'in KENDİ ölçtüğü sayılara dayanıyor, kaba çapraz-kontrole değil.)

**Hiçbir gerçek ziyaretçi 263.57 kB indirmiyor** — en kötü durumda (`/oda/[kod]`) 214.65 kB
indiriyor, eski bütçenin (180 kB) zaten üstünde ama toplamın (263.57 kB) çok altında.

## Özel soru: `/oyna/bilgisayar` minimax'ı bundle'a taşıyor mu?

Evet ama beklenenin tersi yönde bir bulgu: `@xox/game-core`'un TAMAMI (`bestMove`, `chooseMove`,
`evaluateStatus`, `applyMove`, `EMPTY_BOARD`, ...) minifiye çıktıda `strings` ile arandı ve
şurada bulundu:

- `2mx16t8wm4ro6.js` (4.9 kB ham) — YALNIZ `/oyna/bilgisayar`'a özel parça.
- `1gn2loqck7nj8.js` (298 kB ham, tüm dosyalar arasında EN BÜYÜĞÜ) — `/`, `/giris`, `/kayit`,
  `/oda/[kod]`, `/oyna/bilgisayar` — yani **AI'a ihtiyacı olmayan 4 rota da bu paylaşılan parçayı
  indiriyor**.

`game-core` kaynağı gerçekten küçük (938 satır / 35 KB kaynak, bağımlılıksız — CLAUDE.md'de iddia
edildiği gibi) — yani kendi payı muhtemelen birkaç KB, 298 KB'lık parçanın asıl ağırlığının kaynağı
DEĞİL. Ancak şu gerçek doğrulandı: **game-core, sadece ona ihtiyacı olan `/oyna/bilgisayar` yerine,
ortak bir client-boundary üzerinden TÜM "ana" rotalara sızmış durumda.** `mongodb`/`mongoose` gibi
sunucu-only paketlerin sızıntısı ise `strings` taramasında sıfır eşleşme — bu YOK (W1-01'in
`network-graph.test.ts` savunması burada da tutuyor görünüyor).

Bu, tek-bütçe teşhisini DESTEKLİYOR ama nüanslı bir şekilde: "heavy" 5 rotanın neredeyse aynı
boyutta olmasının (203-215 kB aralığı, rota-özel parça yalnız birkaç KB) sebebi zaten TAMAMI
paylaşılan bir JS seti indiriyor olmaları — yani tek büyük paylaşılan bundle burada GERÇEK bir
mimari bulgu (game-core'un gereksiz yere 4 rotaya sızması), ayrı bir kart konusu olabilir
(**dokunmadım, yalnız ölçtüm** — kart talimatı gereği).

## Kurulan bütçeler ve gerekçeleri

`.size-limit.json` → `.size-limit.mjs` (dinamik modül; JSON statik olduğu için rota-manifestini
okuyup çalışma-zamanında bütçe listesi üretemiyordu).

**Neden tek bir sabit glob-listesi değil, dinamik dosya:** Turbopack `static/chunks/*.js` çıktısı
rastgele içerik-hash'li — hiçbir dosya adı deseni bir rotaya SABİT bağlanamıyor. Dosya adlarını
`.size-limit.json`'a hardcode etmek bir SONRAKİ derlemede (herhangi bir kod değişikliğinde tüm
hash'ler değişir) glob'un HİÇBİR dosyayı eşleştirmemesine, yani "0 dosya = 0 kB = her zaman yeşil"
sessiz kapı arızasına yol açardı (`gotchas.md` örüntü 6 ile birebir aynı sınıf). Bunun yerine
`.size-limit.mjs`, HER `size-limit` çalışmasında `apps/web/.next/diagnostics/route-bundle-stats.json`'ı
TAZE okuyup rota başına check üretiyor — dosya adı hiç hardcode edilmiyor, yalnız rota adları ve
bütçe sayıları sabit.

| Grup                                                                |  Bütçe | Gerekçe                                                          |
| ------------------------------------------------------------------- | -----: | ---------------------------------------------------------------- |
| `/`, `/giris`, `/kayit`, `/oda/[kod]`, `/oyna/bilgisayar` ("heavy") | 235 kB | Ölçülen en ağır üye 214.65 kB (`/oda/[kod]`) + ~%9.5 büyüme payı |
| `/profil`, `/_not-found` ("light")                                  | 155 kB | Ölçülen en ağır üye 142.39 kB (`/profil`) + ~%9 büyüme payı      |

Sayılar mevcut değere (263.57 kB) göre DEĞİL, her grubun kendi ÖLÇÜLMÜŞ en ağır üyesine göre
türetildi. Hiçbir bütçe eski limitin (180 kB) altına inmiyor çünkü ölçülen gerçek değerler zaten
üstünde — ama hiçbiri de "şu an ne ise o" (263 kB → 270 kB tipi) değil.

**Yan not — `@size-limit/time` kapatıldı:** 7 check paralel çalışınca (`size-limit`'in kendi
`Promise.all`'ı) 7 eşzamanlı headless Chrome örneği birbirini `Navigation timeout of 20000ms`
ile düşürdü (yerelde tekrarlandı, plugin kendi `TypeError`'ını fırlattı). Kabul kriterlerinde
"running time" hiç istenmiyor — yalnız boyut. Bu yüzden her check'e `disablePlugins:
['@size-limit/time']` eklendi; gereksiz bir kırılganlık/CI-süresi kaynağını ortadan kaldırıyor,
ölçülen metriği DEĞİŞTİRMİYOR.

## Yan dokunuş: `eslint.config.mjs`

`.size-limit.mjs` kök dizinde yeni bir `.mjs` dosyası olduğu için ESLint'in `projectService`'i
onu hiçbir tsconfig'e ait bulamadı (`was not found by the project service`). Repoda ZATEN
`**/*.config.{js,mjs,ts}` + `vitest.shared.ts` için `disableTypeChecked` istisnası var (tip
denetimi gerektirmeyen kök konfig dosyaları için) — `.size-limit.mjs`'i bu listeye tek satır
olarak ekledim (aynı deseni genişlettim, yeni bir kural/resolver DEĞİŞTİRMEDİM). Bu, kartın
çakışma kümesinin dışında (`.size-limit.json`/`next.config.ts`/`package.json` dendi) ama
`pnpm gates`'in lint adımını yeşile döndürmek için mekanik olarak zorunluydu; kapsamı büyütmedim,
tek satırlık precedented bir ekleme.

## `pnpm gates` durumu

- `typecheck` — ✅ temiz (7/7 cache hit, `.size-limit.mjs` tip denetimi dışında)
- `lint` — ✅ temiz (`eslint . --max-warnings=0`, 0 hata)
- `format:check` — ✅ temiz
- `test:coverage` — ❌ **PERF-002'den BAĞIMSIZ, önceden var olan bir kırmızı**:
  `@xox/db src/seed.test.ts > seedTestUsers > varsayılan profil alanlarını kurar` —
  `stats: { wins: 5, losses: 10 }` bekleniyor `{ wins: 0, losses: 0 }` yerine. Bu worktree
  `packages/db`'ye HİÇ dokunmadı; hata paylaşılan yerel Mongo test DB'sinde (`xox_test`) başka bir
  çalıştırmadan kalan kirli state'e benziyor (gece aynı anda başka worktree'ler de aynı yerel
  Mongo'ya karşı test koşuyor olabilir). İzole `pnpm --filter @xox/db test:coverage -- src/seed.test.ts`
  ile de aynı hata TEKRAR ÜRETİLDİ — yani flaky değil, gerçek bir kirli-state sorunu, ama benim
  dalımın diff'i sıfır dosya `packages/db` altında. **Dokunmadım** (kartın yasak listesinde
  `packages/**` var). Lead'e: bu ayrı bir bulgu, ayrı bir kart konusu olabilir (test izolasyonu /
  paylaşılan Mongo instance temizliği).
- `knip` — ✅ temiz (yalnız önceden var olan bilgilendirme "hint"leri, hata değil, exit 0)

## CI koşusu (gerçek)

`feat/PERF-002` push edildi, CI'ı tetiklemek için #2 nolu (draft) PR açıldı
(`pull_request` event'i olmadan CI hiç tetiklenmiyor — `.github/workflows/ci.yml`
`on: push: branches: [main]` + `pull_request`). Sonuç:
<https://github.com/A1640A/XOX/actions/runs/32805562975> — **SUCCESS**, tüm işler yeşil:

- ✅ Kalite kapıları (2m27s) — `typecheck`, `lint`, `format:check`, `test:coverage`, `knip` DAHİL.
  Önemli: `@xox/db seed.test.ts` burada da koştu ve **YEŞİL geçti** — bu, yerelde gördüğüm
  `wins:5/losses:10` hatasının benim değişikliğimden değil, yerel makinemdeki PAYLAŞILAN Mongo
  test DB'sinin başka bir eşzamanlı çalıştırmadan kalan kirli state'inden kaynaklandığını
  DOĞRULUYOR (CI izole/temiz bir Mongo ile çalışıyor).
- ✅ **Derleme (1m18s)** — `pnpm build` + `pnpm --filter @xox/mobile build` + `pnpm exec
size-limit` — kartın hedeflediği iş, **kırmızıdan yeşile döndü**.
- ✅ Secret taraması, Playwright izolasyon kontrolü, game-core mutasyon testi.

PR draft olarak kaldı, main'e merge/push YAPILMADI (kart talimatı).

## Gerçek bir şişme bulundu mu?

Evet, KÜÇÜK bir mimari bulgu (ayrı kart konusu, burada yalnız ölçüldü/rapor edildi):
`@xox/game-core` (minimax dahil TÜM paket) `/oyna/bilgisayar` dışındaki 4 rotaya (`/`, `/giris`,
`/kayit`, `/oda/[kod]`) da sızmış — muhtemelen ortak bir client-boundary/layout üzerinden.
`mongodb`/`mongoose` sızıntısı YOK (strings taramasında sıfır eşleşme).
