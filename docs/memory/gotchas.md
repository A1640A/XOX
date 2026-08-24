# Tuzaklar

> Bir yaklaşımı denemeden ÖNCE burayı oku. Buradaki her satır, birinin zaman kaybetmesiyle öğrenildi.

## 2026-08-24 · TypeScript 7'ye yükseltme lint'i öldürür

`typescript@7.0.2` yayında ama `typescript-eslint@8.67` (canary dahil) peer'ı `typescript <6.1.0`.
TS 7'ye geçmek `strict-type-checked` kural setinin tamamını devre dışı bırakır.
**Yapılacak:** `typescript@6.0.3`'te kal. typescript-eslint TS7 desteği duyurana kadar dokunma.

## 2026-08-24 · npm'deki `gitleaks` paketi sahte

`npm i gitleaks` alakasız bir 1.0.0 paketi kurar. Gerçek araç Go ile yazılmış:
`brew install gitleaks`.

## 2026-08-24 · Auth.js v5 hâlâ beta

`next-auth` latest = 4.24.15 (Pages Router çağı). App Router için `next-auth@beta` (5.0.0-beta.32)
gerekir ve `@auth/mongodb-adapter` ile eşleşir. Sürüm yükseltirken ikisini birlikte yükselt.

## 2026-08-24 · Auth.js adapter'ı mongoose'u değil `mongodb` sürücüsünü ister

İki ayrı bağlantı havuzu açmamak için `getMongoClient()` mongoose'un istemcisini paylaşır
(`connection.getClient()`). Adapter'a yeni `MongoClient` verme — Atlas bağlantı limiti dolar.

## 2026-08-24 · Stryker pnpm monorepo'da iki ek ayar ister

`plugins: ['@stryker-mutator/vitest-runner']` — pnpm plugin'i sembolik bağlar, Stryker'ın
varsayılan `@stryker-mutator/*` glob'u sembolik bağlantı izlemez → `Cannot find TestRunner
plugin "vitest"`. Ve `inPlace: true` — Stryker sandbox'ı yalnızca paket klasörünü kopyalar,
dolayısıyla `vitest.config.ts`'teki `'../../vitest.shared'` importu sandbox içinde çözülemez.
`inPlace` kaynakları yerinde mutasyona uğratıp koşu sonunda geri yükler.

## 2026-08-24 · Çöken Stryker koşusu test sayısını iki katına çıkarır

Koşu çökerse `.stryker-tmp/` geride kalır; vitest oradaki test kopyalarını da toplar ve
`60 test` yerine `146 test` görürsün. `vitest.shared.ts` içindeki `exclude` bunu kapatıyor —
o satırı silme. Elle temizlik: `rm -rf packages/*/.stryker-tmp`.

## 2026-08-24 · `non-nullable-type-assertion-style` ile `no-non-null-assertion` çakışıyor

`moves[index] as number` yazınca birincisi `!` kullan der, ikincisi `!`'i yasaklar. Çıkış yolu
tek satırlık gerekçeli `eslint-disable-next-line`. Kök konfigürasyonu bunun için değiştirme.

## 2026-08-24 · ⚠️ ESLint çözümleyicisi yanlışsa KURALLAR SESSİZCE ÖLÜR — en pahalı ders

`eslint-import-resolver-node` ne `.ts` uzantısını ne de `package.json`'daki `exports` alanını
bilir. Bu repoda tüm paketler yalnızca `"exports": { ".": "./src/index.ts" }` tanımlar ve
`main` yoktur — sonuç: **her `@xox/*` importu çözülemez sayıldı**, `isUnknown: true` olarak
sınıflandı ve `boundaries/dependencies` hiçbir ihlali raporlamadı. Aynı sebeple
`import-x/no-cycle` da `import-x/extensions` varsayılanı `['.js','.mjs','.cjs']` olduğu için
**tek bir TypeScript dosyası okumadı**; yaptığı tek iş `node_modules` içindeki react-native'i
ayrıştırmaya çalışıp stderr'e hata basmaktı.

Yani iki mimari koruma da aylarca "yeşil" görünüp hiçbir şey korumayabilirdi.

**Yapılacak:** `eslint-import-resolver-typescript` kullan; hem `boundaries` hem `import-x` için
ayrı ayrı ayarla (`import/resolver` ve `import-x/resolver` **farklı anahtarlardır**),
`import-x/extensions`'a TS uzantılarını yaz, `import-x/ignore: ['node_modules']` ekle.

**Genel ders:** Bir lint kuralının yazılmış olması çalıştığı anlamına gelmez. Her mimari kural
için hem **ihlal eden** hem **izinli** bir sonda yaz ve ikisini de gör. Bir agent "kanıtladım"
dediğinde de bunu yap — bu kuralın çalıştığı bir kez "kanıtlanmış", kanıt tutmamıştı.

## 2026-08-24 · Expo monorepo rehberi pnpm'de yanlış

`disableHierarchicalLookup = true` hoisted düzen içindir. pnpm'de web build
`Unable to resolve module @expo/metro-runtime` ile ölür. `watchFolders` + `nodeModulesPaths`
yeterli, üçüncü satırı ekleme.

## 2026-08-24 · pnpm sembolik bağlantıları boundaries kuralını sessizce öldürür

`node_modules/@xox/*` pnpm'de semboliktir. `eslint-import-resolver-node` varsayılan olarak
realpath çözmez, dolayısıyla çözülen yol `node_modules` içerir ve `@boundaries/elements`
bunu "harici paket" sayar. Sonuç: `boundaries/dependencies` **hiçbir gerçek `@xox/*`
import'unda ateşlenmez** — kural var görünür, hiçbir şey korumaz.
**Yapılacak:** `settings['import/resolver'].node.preserveSymlinks = false`. Bunu kaldırma.
2026-08-24'te sonda ile hem ihlal (game-core → shared) hem izin (shared → game-core) doğrulandı.

## 2026-08-24 · `projectService: true` + kapsam dışı dosya = kural hiç çalışmaz

`eslint.config.mjs` içinde `projectService: true` varken, hiçbir `tsconfig.json`'ın `include`'una
girmeyen bir `.ts` dosyası **hiçbir kural değerlendirilmeden** "was not found by the project
service" parse hatası verir. Yani kuralı test etmek için attığın sonda, kuralı hiç tetiklemez.
**Yapılacak:** Yeni bir paket açarken `tsconfig.json`'ı `src/` ile aynı commit'te oluştur.

## 2026-08-24 · `eslint-plugin-jsx-a11y@6.10.2` peer'ı ESLint 10'u tanımıyor

Peer aralığı `^3 – ^9`; bizde ESLint 10.9.0 var. `.npmrc`'de `strict-peer-dependencies=false`
olduğu için kurulum ve lint sorunsuz çalışır — uyarı görmezden gelinebilir. Plugin ESLint 10
desteği duyurunca pin güncellenmeli.

## 2026-08-24 · pnpm 11 postinstall script'lerini engeller

`pnpm install` ilk kez koşarken `ERR_PNPM_IGNORED_BUILDS` ile exit 1 verir ve
`pnpm-workspace.yaml`'a `allowBuilds` yer tutucusu yazar. Şu ana kadar iki paket bunu tetikledi:
`lefthook` (git hook'larını postinstall'da kurar — onaylanmazsa tüm pre-commit kapıları sessizce
devre dışı kalır) ve `unrs-resolver` (`eslint-plugin-import-x`'in native resolver'ı — onaylanmazsa
`pnpm install` ve `pnpm lint` hard-fail eder). İkisi de `true`.

## 2026-08-24 · `expo-router@~7.0.0` canary kurar

expo-router artık Expo SDK ile hizalı sürümleniyor: SDK 57 için doğru sürüm `57.0.15`.
npm'de duran `7.0.0-canary-*` sürümleri kararsızdır. `~7.0.0` yazmak canary çeker.

## 2026-08-24 · `ws` kurulmazsa Vercel WebSocket'i yanlışlıkla "bozuk" sanırsın

`@vercel/functions` `ws`'i opsiyonel peer yapar → kurulmaz → `experimental_upgradeWebSocket`
çalışma anında `The "ws" package is required` fırlatır. Bu hata kolayca "Fluid Compute WS
desteklenmiyor" diye okunur ve gereksiz mimari pivotu tetikler.
**Yapılacak:** `apps/web`'e `ws` + `@types/ws` doğrudan bağımlılık olarak ekli kalsın.

## 2026-08-24 · TypeScript 6: `baseUrl` hata veriyor

`TS5101: Option 'baseUrl' is deprecated`. Kaldır; `paths` tsconfig'in kendi konumuna göre çözülür.

## 2026-08-24 · Next 16 `next.config` içinde `eslint` anahtarını reddediyor

`Unrecognized key(s) in object: 'eslint'`. Next 16 build sırasında ESLint'i zaten koşturmuyor,
anahtar gereksiz. `typescript.ignoreBuildErrors` hâlâ geçerli.

## 2026-08-24 · `next-env.d.ts` format kapısını kalıcı kırar

Next onu her build'de çift tırnak + noktalı virgülle yeniden yazar; `prettier --check` hep
kırmızı olur. `.prettierignore`'da — o satırı silme.

## 2026-08-24 · `--filter=!@paket` var olmayan pakette turbo'yu öldürür

Kök script'te olmayan bir pakete negatif filtre yazarsan turbo `No package found with name ...`
ile hata verir — yani `pnpm gates` paket oluşturulana kadar tamamen çalışmaz.
**Yapılacak:** Negatif filtre kullanma. e2e paketinin task adını `test` yerine `e2e` yap;
`turbo run test` onu hiç görmez.

## 2026-08-24 · Mongoose model yeniden kaydı: cast `??` fallback'ini öldürür

`(models['User'] as Model<UserDoc>) ?? model(...)` yazarsan cast `undefined`'ı **??'den önce**
kaldırır, fallback ölü koda döner (`no-unnecessary-condition` bunu yakalar) ve HMR/yeniden
içe aktarmada `OverwriteModelError` alırsın.
**Yapılacak:** `as Model<UserDoc> | undefined` yaz.

## 2026-08-24 · `noUncheckedIndexedAccess` + string indeksleme

`ALPHABET[i]` tipi `string | undefined` döner; `restrict-plus-operands` reddeder ve `!`
`strictTypeChecked` altında yasak. `.charAt(i)` kullan — total fonksiyon, aynı sonuç.

## 2026-08-24 · `import type { X } from 'mongodb'` bile paketi bağımlılık yapar

pnpm izole linker'da `mongodb` yalnızca `.pnpm/node_modules` altındadır; `tsc` `TS2307` verir.
`mongoose@9.9.3`'ün çözdüğü sürümle aynısını (`7.5.0`) doğrudan bağımlılık olarak ekle —
store'da tek kopya kalır.

## 2026-08-24 · `turbo run test` Playwright'ı da çalıştırır

`apps/e2e` içindeki `test` scripti `playwright test`tir. Kök `pnpm test` bunu filtrelemezse
sunucu ayakta değilken Playwright koşar ve kapılar hatalı kırmızı olur.
**Yapılacak:** kök scriptlerde `--filter=!@xox/e2e` kalsın. E2E ayrı çalışır: `pnpm e2e`.

## 2026-08-24 · pnpm + Expo Metro çözümlemesi

pnpm sembolik bağlantı kullanır; Metro varsayılan olarak workspace kökünü izlemez.
`metro.config.js` içinde `watchFolders` + `nodeModulesPaths` + `disableHierarchicalLookup`
ayarlanmazsa `@xox/*` paketleri "module not found" verir.

## 2026-08-24 · Claude Code hook'lara MUTLAK `file_path` verir

`Write`/`Edit` araçlarının `tool_input.file_path` alanı **her zaman mutlak yoldur**
(`/Users/.../XOX/apps/web/lib/x.ts`), göreli değil. Hook içinde `[[ $path == apps/web/* ]]`
gibi göreli önek karşılaştırması gerçek kullanımda **hiç eşleşmez** — kural sessizce ölür,
üstelik sonda göreli yolu elle beslediği için yeşil görünür (ESLint çözümleyici dersiyle aynı
başarısızlık biçimi).
**Yapılacak:** yolu önce `CLAUDE_PROJECT_DIR`e göre indirge (`path.relative`), `..` parçalarını
ve sembolik bağları çöz, sonra karşılaştır. Sondayı MUTLAK yolla çalıştır; hem engelleyen hem
izin veren yönü ayrı ayrı kanıtla.
