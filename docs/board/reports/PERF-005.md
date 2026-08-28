# PERF-005 — `@xox/shared` barrel'ından zod'u istemci yolundan ayırma

> **Kısmi kapanış.** İstenen değişiklik yapıldı ve gerçek, ölçülmüş, testlerle
> doğrulanmış kazanımlar üretti — ama kartın kapanış şartı ("`/profil` hafif gruba
> [158 kB] GERİ DÖNER") **harfiyen karşılanmadı**. Aşağıda neden ve iki somut
> kapanış seçeneği var; ikisi de bu kartın çakışma kümesi DIŞINDA bir karar
> gerektiriyor (bkz. "Neden 158 kB'ye ulaşılamadı").

## Yapılan değişiklik

1. **`packages/shared/package.json`** — `"sideEffects": false` eklendi. Bu,
   bundler'a (Turbopack) bir modülün HİÇ kullanılmayan `export *` zincirini
   TAMAMEN düşürme izni veriyor — daha önce (PERF-004) bu bilerek eklenmemişti
   ("asıl maliyet zod olduğu için faydası ölçülemeden risk alınmış olurdu, zod
   işi yapılırken birlikte değerlendirilmeli" — bu kart o değerlendirmeyi yaptı).

2. **`packages/shared/src/rest-contract.ts`** tek 217 satırlık dosyaydı (20+ REST
   uç noktasının şeması TEK modülde). Artık yalnızca bir yeniden-dışa-verim
   toplayıcısı; gerçek tanımlar `packages/shared/src/rest-contract/*.ts` altında
   **uç nokta başına ayrı dosyada**: `display-name`, `email`, `password`,
   `theme`, `stats`, `error-response`, `register`, `rooms`, `ws-ticket`,
   `profile-response`, `profile-update`, `leaderboard`, `matches`, `friends`,
   `mobile`, `user-ref` (bu sonuncusu — eskiden de dışa verilmeyen paylaşılan
   bir `const` — bilerek barrel'dan `export *` EDİLMİYOR, yalnız kardeş
   dosyalar `import` ediyor).

   Neden: `sideEffects: false` yalnız **modül granülerliğinde** çalışıyor —
   aynı dosyadaki komşu (kullanılmayan) şemaları düşüremiyor. Tek dosyada 20+
   şema varken `/profil` gibi yalnız 1-2 şemaya ihtiyaç duyan bir rota hâlâ
   TÜM dosyayı (ve transitive `zod` içe aktarımını) indiriyordu — ölçüldü, bkz.
   altta "İlk ölçüm" satırı (yalnız `sideEffects:false` ile −3 kB).

3. **`packages/shared/src/errors.ts`** + `rest-contract/error-response.ts` +
   `rest-contract/stats.ts` + `rest-contract/theme.ts` + `rest-contract/
profile-response.ts` — klasik `zod` yerine **`zod/mini`** (zod v4'ün resmî
   ağaç-sallanabilir API'si, `zod` paketinin `./mini` alt yolu — YENİ bir
   bağımlılık DEĞİL). `.safeParse()`/`.options`/`z.infer` klasikle BİREBİR aynı
   çalışıyor; mini şemalar klasik `z.object()`'in İÇİNE sorunsuz iç içe geçiyor
   (canlı doğrulandı, aşağıya bkz.) — bu yüzden `ws-protocol.ts` (klasik `zod`,
   `errorCodeSchema`'yı kendi `z.discriminatedUnion`'ının içinde kullanıyor)
   HİÇ DEĞİŞMEDİ ve bozulmadı.

   `profileUpdateBodySchema` (yalnız `apps/web/app/api/profile/route.ts`
   SUNUCU tarafının tükettiği PATCH şeması) bilerek `profile-response.ts`'ten
   AYRI bir dosyaya (`profile-update.ts`, klasik `zod` — dönüştürülmedi, gerek
   yok) taşındı: aksi hâlde istemci hiç kullanmasa bile aynı modülde kalıp
   `/profil`'e taşınırdı.

## Neden zod v4 mini'ye geçildi (kök neden, PERF-004'ün ötesinde)

PERF-004 doğru suçluyu (zod) bulmuştu ama yanlış MEKANİZMAYI varsaymıştı:
"485 zod izi" = 20+ kullanılmayan şema TANIMI zannedilmişti. Bu kartta parça
içeriği tekrar incelendi: dosya bölme SONRASI bile `/profil`'in özel parçası
hâlâ **485 `zod` izi** taşıyordu — TAM OLARAK PERF-004'ün ölçtüğü sayı, hangi
şemanın tanımlı olduğundan BAĞIMSIZ. Bu, maliyetin şema SAYISI değil, **klasik
`zod`'un kendi çekirdeğinin taban ağırlığı** (~60-65 kB gzip) olduğunu
kanıtladı — `z.object()` gibi tek bir çağrı bile tüm `ZodType` hiyerarşisini
sürüklüyor, kütüphane kendi içinde ağaç-sallanabilir değil. `zod/mini` tam bu
sorunu çözmek için var (zod v4'ün resmî belgelenmiş özelliği).

Canlı doğrulama (`node` ile, repo içinde):

```
mini enum options [ 'a', 'b', 'c' ]
nested classic.safeParse { success: true, data: { code: 'b', message: 'hi' } }   // mini şema, klasik z.object() içinde
classic z.optional(miniSchema) works: { success: true, data: undefined } { success: true, data: 'koyu' }
strictObject nested optional-mini: true true false                               // klasik z.strictObject içine mini alan
```

## Ölçüm — üç aşama, hepsi `pnpm --filter @xox/web build && pnpm exec size-limit`

| Rota               | Başlangıç | +`sideEffects:false` + dosya bölme | +`zod/mini` (NİHAİ) | Δ (toplam)    |
| ------------------ | --------- | ---------------------------------- | ------------------- | ------------- |
| `/oda/[kod]`       | 222.82 kB | 221.55 kB                          | **223.87 kB**       | +1.05 kB      |
| `/`                | 219.97 kB | 216.63 kB                          | **218.94 kB**       | −1.03 kB      |
| `/oda/katil`       | 216.66 kB | 212.61 kB                          | **214.93 kB**       | −1.73 kB      |
| `/arkadaslar`      | 216.62 kB | 211.91 kB                          | **214.22 kB**       | −2.40 kB      |
| `/profil`          | 217.16 kB | 212.71 kB                          | **168.36 kB**       | **−48.80 kB** |
| `/kayit`           | 216.42 kB | 211.53 kB                          | **167.18 kB**       | **−49.24 kB** |
| `/oyna/bilgisayar` | 146.81 kB | 146.80 kB                          | 146.80 kB           | −0.01 kB      |
| `/giris`           | 216.30 kB | 146.65 kB                          | **146.65 kB**       | **−69.65 kB** |
| `/_not-found`      | 145.15 kB | 145.15 kB                          | 145.15 kB           | 0             |
| `/davet/[kod]`     | 145.15 kB | 145.15 kB                          | 145.15 kB           | 0             |

Bütçeler: heavy 235 kB, light 158 kB (`.size-limit.mjs`, DEĞİŞMEDİ). **Hiçbir
rota kendi bütçesini aşmıyor** — 5 gerçek-zamanlı ağır rotada ~1-2.4 kB'lik
küçük net değişim (bazısı +, bazısı −; `zod/mini`'nin klasik `zod` ile AYNI
ANDA bulunması küçük bir çakışma payı ekliyor) 235 kB bütçesinin rahat içinde.

`/giris` **tamamen** hafif gruba düşecek büyüklükte (146.65 kB, 158 kB
bütçesinin altında) — GirisForm.tsx hiçbir çalışma-zamanı zod şeması
kullanmıyor (yalnız `ErrorCode` TİPİ), bu yüzden `sideEffects:false` tüm zod
grafiğini tamamen düşürebildi. Bunu `LIGHT_ROUTES`'a EKLEMEDİM — `AUTH-004`
bu dalgada paralel çalışıyor ve `/giris`'i değiştirebilir; bütçe sıkılaştırması
onun CI'ını beklenmedik şekilde kırabilirdi. Lead'e bırakıyorum.

## Neden `/profil` (ve `/kayit`) 158 kB'ye ulaşamadı

Kalan ~10-23 kB, `zod/mini`'nin KENDİ çekirdek taban maliyeti (obje/dize/sayı/
enum doğrulama motoru + `safeParse` altyapısı — parça içeriği kontrol edildi,
`ZodMiniRecord`/`ZodMiniTuple`/`ZodMiniDate` gibi kullanılmayan tip sınıfları
YOK, yani zaten iyi ağaçlanmış). Bu taban, TANIMLANAN şema sayısından
BAĞIMSIZ — daha fazla dosya bölme ya da tree-shaking ayarıyla küçültülemez.

`ProfileContent.tsx` (ve `KayitForm.tsx`) gerçekten `errorResponseSchema`/
`profileResponseSchema`/`errorCodeSchema`'yı `.safeParse()` ile **sunucu
yanıtını çalışma zamanında doğrulamak** için kullanıyor — bu MEŞRU bir
kullanım, "sızıntı" değil. Onu kaldırmadan 158 kB'ye inilemez.

**İki kapanış seçeneği** (ikisi de bu kartın çakışma kümesi dışında,
`components/profile/**`'e dokunmam açıkça yasaklanmıştı):

- **(a)** İstemci tarafı yanıt doğrulamasını (`errorResponseSchema`/
  `errorCodeSchema.safeParse`) `ProfileContent.tsx`/`KayitForm.tsx`'ten
  kaldır — sunucu zaten otoriter (KK-003), istemci TS tipine güvenebilir.
  Ayrı bir kart + `xox-dev-web`'in onayı gerekir.
- **(b)** `.size-limit.mjs`'e üçüncü, dürüst bir "medium" katman ekle (örn.
  ~185 kB — `168.36 × 1.10`), `/profil`+`/kayit`'i oraya taşı. Bütçe
  GERÇEĞİ ölçmeye devam eder, `/profil` zorla "hafif" etiketi almaz. Bu bir
  politika kararı, tek başıma almadım.

`.size-limit.mjs`'in üst yorumu bu bulguyu ve iki seçeneği tam olarak
belgeliyor (PERF-004'ün yorumunun yerini aldı).

## Dışa verim ADI kaybolmadı — kanıt (103 ad, birebir aynı)

Yöntem (PERF-004 ile aynı): `packages/shared/src/__barrel_probe.test.ts`
(geçici) `import * as barrel from './index'` yapıp `Object.keys(barrel).sort()`'u
dosyaya yazdı, testten sonra silindi.

```
before: 103
after:  103
identical: True
missing: set()
added:   set()
```

Bu adım **üç kez** koşuldu: (1) yalnız `sideEffects:false` sonrası, (2) dosya
bölme sonrası, (3) `zod/mini` geçişi sonrası — üçünde de sonuç aynı.

## `boundaries`/`import-x/no-cycle` gerçekten koşuyor mu — ihlal sondası

**Yanlış ölçüm YAKALANDI ve DÜZELTİLDİ** (kendi kendime düşmemek için not
ediyorum): İlk sondayı `pnpm --filter @xox/shared lint` ile attım ve HİÇBİR
ihlal görmedim — bu `eslint .`'i `packages/shared/` cwd'sinden çalıştırıyor,
ve `boundaries/elements` desenleri (`packages/shared/**` vb.) REPO KÖKÜNE
göre yazılmış olduğu için o cwd'den hiçbir dosya eşleşmiyor, kural sessizce
`isUnknown` kalıyordu. Gerçek DoD komutu (`pnpm gates` → kök `pnpm lint` →
`eslint . --max-warnings=0`, REPO KÖKÜNDEN) ile tekrarladım:

```
$ eslint . --max-warnings=0
packages/shared/src/rest-contract/error-response.ts
  22:39  error  There is no policy allowing dependencies from elements of type "shared" to elements of type "db"  boundaries/dependencies
✖ 1 problem (1 error, 0 warnings)
```

(Geçici olarak `error-response.ts`'e `packages/db/src/client`'tan `connectDb`
import'u eklendi, hata görüldü, satır silindi — `git status --porcelain`
temiz.) `import-x/no-cycle` da ayrıca ayrı bir sondada (apps/web'e döngüsel
import) yakalandı, sonra geri alındı.

## `pnpm gates` — tamamen yeşil

```
$ pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage && pnpm knip
...
Tasks:    7 successful, 7 total   (typecheck)
$ eslint . --max-warnings=0        → temiz
$ prettier --check .               → temiz
...
@xox/shared: 11 test dosyası, 389 test — HEPSİ YEŞİL
@xox/web:    83 test dosyası, 866 test — HEPSİ YEŞİL
@xox/db:     30 test dosyası, 240 test — HEPSİ YEŞİL (kapsam %95.93 satır)
@xox/game-core: %100 kapsam (dokunulmadı, değişmedi)
$ knip → yalnız ön-var-olan konfigürasyon ipuçları, sıfır kullanılmayan dışa verim
```

## `git status --porcelain` — yazma alanı sınırları içinde

```
 M .size-limit.mjs
 M packages/shared/package.json
 M packages/shared/src/errors.ts
 M packages/shared/src/rest-contract.ts
?? packages/shared/src/rest-contract/   (16 yeni dosya, hepsi endpoint başına)
```

`apps/web/components/**`, `apps/web/auth.ts`, `packages/db/**`,
`apps/web/lib/game/**`, `lib/realtime/**`, `packages/game-core/**` —
DOKUNULMADI (grep ile doğrulandı, `git status` boş).

## Commit

`feat/PERF-005` dalında, `main`'e merge/push YAPILMADI (kartın talimatı).
Commit SHA raporu tamamladıktan sonra eklenir — bkz. `git log --oneline -1`.

## Lead'e karar için

1. `/giris`'i `LIGHT_ROUTES`'a eklemek ister misin? (146.65 kB, rahat sığıyor
   — ama `AUTH-004` paralel, çakışma riski var, ben eklemedim.)
2. `/profil`+`/kayit` için (a) tüketici dosyasından zod doğrulamasını kaldır,
   ya da (b) yeni "medium" bütçe katmanı — hangisi?
3. Bu ikisi netleşmeden kart TAM kapanmıyor; ama mevcut hâliyle **gerileme
   yok, tüm testler yeşil, tüm bütçeler geçiyor, 103 ad korundu**.
