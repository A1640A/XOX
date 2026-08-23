# XOX — Harness ve Otonom Geliştirme Mimarisi (Tasarım)

- **Tarih:** 2026-08-24
- **Durum:** Onaylandı (kullanıcı incelemesi bekliyor)
- **Kapsam:** Alt-proje 0 — repo iskeleti, agent mimarisi, hafıza katmanı, otonom gece koşusu, kalite kapıları
- **Kapsam dışı:** XOX oyununun kendi özellik spec'i (alt-proje 1, bu harness'ın `xox-analyst` agent'ı üretecek)

---

## 1. Amaç

Ömer'in gece uyumadan önce tek komutla başlatıp sabah bitmiş iş + tek rapor bulacağı,
subagent-güdümlü, kendi kendini yöneten bir geliştirme sistemi kurmak.

Sistemin karşılaması gereken dört sert gereksinim:

1. **Otonomi** — Gece boyunca insan müdahalesi gerekmez. İzin istemi = duran oturum.
2. **Context dayanıklılığı** — 6–8 saatlik koşuda context defalarca sıkışır; lead'in hafızası diskte olmalı.
3. **Playwright izolasyonu** — Ana uygulama paketleri Playwright'a _asla_ dokunmaz. Ayrı proje, ayrı agent, lead'e raporlar.
4. **Best practice zorlaması** — Kalite prompt'la değil, derleyici ve CI ile garanti edilir.

---

## 2. Alınan kararlar

| Konu                 | Karar                                                             | Gerekçe                                                                                                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repo topolojisi      | Tek monorepo, pnpm workspaces + Turborepo                         | Tek git = tek worktree kökü, lead tüm raporları görür, oyun mantığı web+mobil ortak                                                                                                                                                                                            |
| Otonomi seviyesi     | Tam yetki (administrator)                                         | Kullanıcı kararı. Yasak listesi yok; yıkıcı işlemler _engellenmez_, **geri alınabilir** kılınır. **Tek istisna:** public repoya secret commit'i engellenir — bu bir yetki kısıtı değil, geri dönüşü olmayan bir kaza koruması (sızan anahtar dakikalar içinde taranıp bulunur) |
| Agent kadrosu        | 18 agent, 4 katman                                                | Maksimum uzmanlaşma; her agent dar prompt + kısıtlı tool seti                                                                                                                                                                                                                  |
| Lead'in yeri         | Ana oturum (subagent değil)                                       | İç içe dispatch kırılgan; lead worktree/dalga/board state'ini kaybetmemeli                                                                                                                                                                                                     |
| Realtime             | Vercel native WebSocket (Fluid Compute)                           | Üçüncü parti yok, RN'de yerleşik WebSocket API'si var, ekstra maliyet yok                                                                                                                                                                                                      |
| Instance-arası yayın | MongoDB Change Streams (`rooms` koleksiyonu, oda koduna filtreli) | İki oyuncu farklı Fluid instance'ına düşebilir; change stream instance-agnostik. **Reddedilen alternatif:** Upstash Redis pub/sub (ek vendor), sticky routing (garanti değil)                                                                                                  |
| Auth                 | Auth.js v5 (NextAuth), MongoDB adapter, JWT session               | Kullanıcı kararı. Expo resmi desteklenmiyor → açık mobil köprü tasarlandı (§6.3)                                                                                                                                                                                               |
| Veritabanı           | MongoDB Atlas (`xox_dev`, `xox_test`, `xox_prod`)                 | Kullanıcı kararı                                                                                                                                                                                                                                                               |
| Mobil doğrulama      | Expo Web (react-native-web) hedefi + `apps/e2e` duman testi       | Expo Go ajan tarafından sürülemez; web hedefi mantık hatalarının çoğunu ucuza yakalar                                                                                                                                                                                          |
| Dil                  | Yalnızca Türkçe, metinler `messages/tr.ts`'de merkezî             | i18n kütüphanesi yok; merkezîlik ileride EN eklemeyi ucuzlatır                                                                                                                                                                                                                 |
| v1 kapsamı           | Geniş v1 (sosyal özellikler dahil), P0/P1/P2 katmanlı             | İki geceye yayılabilir; katmanlama ilerlemeyi ölçülebilir kılar                                                                                                                                                                                                                |
| Repo görünürlüğü     | Public (mevcut)                                                   | GitHub secret scanning + push protection zaten aktif                                                                                                                                                                                                                           |

---

## 3. Repo topolojisi

```
XOX/                                  github.com/A1640A/XOX  (public)
├── CLAUDE.md                         Lead protokolü + ihlal edilemez kurallar (<200 satır)
├── pnpm-workspace.yaml · turbo.json · tsconfig.base.json · eslint.config.mjs
│
├── apps/
│   ├── web/          Next.js 16 App Router → Vercel        ⛔ playwright YOK
│   ├── mobile/       Expo SDK — native + web hedefi         ⛔ playwright YOK
│   └── e2e/          🎭 İZOLE Playwright projesi            ✅ playwright SADECE burada
│       ├── tests/  fixtures/  reports/  playwright.config.ts
│
├── packages/
│   ├── game-core/    saf TS — kural motoru, minimax AI, tipler (bağımlılıksız)
│   ├── shared/       zod şemaları, REST sözleşmesi, WS mesaj protokolü
│   ├── db/           mongoose modelleri, bağlantı havuzu, seed + reset scriptleri
│   └── ui-tokens/    renk/tipografi/aralık tokenları — `xox-designer`'ın web+mobil tutarlılığı için tek kaynağı
│
├── docs/
│   ├── board/        board.json · journal.ndjson · waves/ · reports/
│   ├── memory/       decisions.md · gotchas.md · conventions.md · api-contract.md · state.md
│   ├── superpowers/specs/ · plans/ · adr/ · reports/
│
└── .claude/
    ├── settings.json · agents/ (18) · commands/ · hooks/ · skills/ · worktrees/
```

### Bağımlılık yönü (ESLint ile zorlanır)

```
game-core  ──►  (hiçbir şey)
shared     ──►  game-core
db         ──►  shared, game-core
web        ──►  db, shared, game-core, ui-tokens
mobile     ──►  shared, game-core, ui-tokens
e2e        ──►  shared            (uygulama koduna dokunamaz)
```

`playwright` importu `apps/e2e` dışında **derleme hatası**dır.

---

## 4. Teknoloji yığını

| Katman                 | Seçim                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Web                    | Next.js 16 App Router, React 19, TypeScript strict, Tailwind + shadcn/ui             |
| Mobil                  | Expo SDK (Expo Go uyumlu), React Native, `react-native-web` web hedefi               |
| Ortak mantık           | Saf TypeScript (`game-core`), zod (`shared`)                                         |
| Veri                   | MongoDB Atlas + Mongoose, Change Streams ile fan-out                                 |
| Realtime               | Vercel Functions WebSocket (`experimental_upgradeWebSocket`, Fluid Compute, Node 24) |
| Auth                   | Auth.js v5 + MongoDB adapter, JWT strategy; mobilde `expo-auth-session` köprüsü      |
| Birim/entegrasyon test | Vitest + Testing Library; `mongodb-memory-server`; mobilde `jest-expo` + RNTL        |
| E2E                    | Playwright (yalnız `apps/e2e`)                                                       |
| Mutasyon testi         | Stryker (yalnız `game-core`)                                                         |
| CI                     | GitHub Actions                                                                       |
| Deploy                 | Vercel — `xox.omerdursun.com` (DNS zaten Vercel nameserver'larında)                  |
| Gözlemlenebilirlik     | Sentry + Vercel Analytics + Speed Insights                                           |

---

## 5. Ürün kapsamı — v1 kabul kriterleri

### P0 — Yürüyen iskelet ve çekirdek (Dalga 0–3)

- [ ] **Dalga 0 dikey dilim:** giriş → oda kur → ikinci istemci katıl → hamle → karşı tarafta görün, **gerçek Vercel preview + gerçek Atlas üzerinde kanıtlanmış**
- [ ] Auth.js kayıt/giriş (web) + mobil köprü
- [ ] `game-core`: kural motoru, kazanma/beraberlik tespiti, minimax AI (kolay/orta/yenilmez)
- [ ] Bilgisayara karşı oyun (web)
- [ ] Oda kur / 6 haneli kodla katıl
- [ ] Gerçek zamanlı hamle senkronu, sunucu-otoriter doğrulama
- [ ] Kazanma · beraberlik · rövanş
- [ ] Kopma sonrası yeniden bağlanma + state resync

### P1 — Tam döngü (Dalga 4–7)

- [ ] Profil sayfası + galibiyet/mağlubiyet/beraberlik sayaçları
- [ ] Mobil: tüm ekranlar Expo Go'da açılıyor, web hedefi duman testinden geçiyor
- [ ] `xox.omerdursun.com` production'da canlı
- [ ] Sentry + Analytics bağlı
- [ ] Terk etme/zaman aşımı yönetimi (oda TTL, hamle süresi)

### P2 — Sosyal (Dalga 8+, ikinci geceye taşabilir)

- [ ] Leaderboard
- [ ] ELO derecelendirme
- [ ] Maç geçmişi
- [ ] Link/kod ile arkadaş daveti
- [ ] Oyun içi emoji sohbeti
- [ ] Arkadaş listesi

`xox-reporter` ilerlemeyi bu listelere göre yüzdeyle raporlar.

---

## 6. Mimari kararlar (detay)

### 6.1 Realtime — instance-arası yayın

İki oyuncu farklı Fluid Compute instance'larına düşebilir; bu durumda bir instance'taki
WebSocket handler diğerindekine doğrudan mesaj gönderemez.

```
Oyuncu A ──ws──► Instance 1 ──► hamleyi doğrula (game-core) ──► rooms dokümanını güncelle
                                                                        │
                                                    MongoDB Change Stream (roomCode filtreli)
                                                                        │
Oyuncu B ◄──ws── Instance 2 ◄───────────────────────────────────────────┘
```

- Sunucu otoriterdir; istemci iyimser günceller, sunucu reddederse geri alır.
- Her WS bağlantısı ilgili odanın change stream'ine abone olur; bağlantı kapanınca abonelik kapanır.
- **Dalga 0'da kanıtlanması zorunlu.** Gecikme veya maliyet kabul edilemezse dokümante edilmiş
  yedek: Upstash Redis pub/sub.

### 6.2 WebSocket protokolü (`packages/shared`)

| Yön              | Mesajlar                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| istemci → sunucu | `join`, `move`, `resign`, `rematch:offer`, `rematch:accept`, `chat:emoji`, `ping`                                                           |
| sunucu → istemci | `state`, `move:applied`, `move:rejected`, `opponent:joined`, `opponent:left`, `game:over`, `rematch:offered`, `chat:emoji`, `error`, `pong` |

Tüm mesajlar zod ile şemalıdır; şema `shared` içinde tek kaynaktır, hem sunucu hem iki istemci onu kullanır.

### 6.3 Mobil auth köprüsü (Auth.js resmi Expo desteği olmadığı için)

```
Expo app
   │ expo-auth-session ile tarayıcı aç
   ▼
/api/auth/mobile/authorize   ──►  Auth.js sağlayıcı akışı
   │
   ▼ callback
/api/auth/mobile/callback    ──►  kısa ömürlü access JWT + refresh token üret
   │
   ▼ deep link (xox://auth)
expo-secure-store            ──►  REST: Authorization: Bearer <jwt>
                                  WS  : upgrade handshake'te token
```

Sunucu tarafında WS upgrade handler JWT'yi aynı secret ile doğrular ve bağlantıyı `userId`'ye bağlar.
Bu köprü **açıkça tasarlanmıştır** çünkü keşfe bırakılırsa mobil agent'ı saatlerce tıkar.

### 6.4 Veri modeli (özet)

`users` (Auth.js adapter + `stats`, `elo`) · `accounts` · `sessions` · `rooms` (TTL indeksli, `code` unique) ·
`games` (hamle geçmişi gömülü) · `friendships` · `matchHistory`

---

## 7. Agent mimarisi — 18 agent

**Lead ana oturumda yaşar.** Subagent değildir; board'u, worktree'leri ve dalga sırasını yönetir.
Her agent dosyası `.claude/agents/<ad>.md`: kendi system prompt'u, **kısıtlı tool seti**, kendi modeli,
ve **zorunlu yapılandırılmış rapor formatı**.

| Katman         | Agent                | Sorumluluk                                                               | Model  | Yazma yetkisi                        |
| -------------- | -------------------- | ------------------------------------------------------------------------ | ------ | ------------------------------------ |
| **Analiz**     | `xox-analyst`        | Kullanıcı hikayeleri, kabul kriterleri, edge case'ler                    | opus   | `docs/`                              |
|                | `xox-architect`      | Teknik tasarım, ADR, bağımlılık grafiği, dalga bölümlemesi               | opus   | `docs/`                              |
|                | `xox-planner`        | Atomik + paralel-güvenli görev kartları, çakışma kümeleri                | opus   | `docs/`, `board.json`                |
| **Geliştirme** | `xox-dev-core`       | `game-core` kural motoru + minimax — TDD zorunlu                         | opus   | `packages/game-core`                 |
|                | `xox-dev-backend`    | API routes, oda yaşam döngüsü, mongoose, Auth.js sunucu                  | sonnet | `apps/web/app/api`, `packages/db`    |
|                | `xox-dev-realtime`   | WS protokolü, change stream fan-out, reconnect, resync                   | opus   | WS katmanı, `packages/shared`        |
|                | `xox-dev-web`        | Next.js UI, RSC/client sınırı, Tailwind + shadcn                         | sonnet | `apps/web` (api hariç)               |
|                | `xox-dev-mobile`     | Expo ekranları, auth köprüsü istemcisi, WS istemcisi, web hedefi         | sonnet | `apps/mobile`                        |
| **Kalite**     | `xox-test-writer`    | Vitest birim/entegrasyon, kapsam açıklarını kapatır                      | sonnet | `**/*.test.ts`                       |
|                | `xox-qa-e2e`         | 🎭 Playwright senaryoları — **yalnız `apps/e2e`**                        | sonnet | `apps/e2e`, `docs/board/reports`     |
|                | `xox-reviewer`       | Düşmanca kod incelemesi — bulur, **düzeltmez**                           | opus   | yalnız rapor (Edit/Write yok)        |
|                | `xox-security`       | Auth akışı, WS yetkilendirme, NoSQL injection, secret sızıntısı          | opus   | yalnız rapor                         |
|                | `xox-perf`           | Web Vitals, bundle bütçesi, Mongo indeksleri, WS mesaj hacmi             | sonnet | yalnız rapor                         |
|                | `xox-designer`       | Tasarım tokenları, tahta animasyonları, web↔mobil tutarlılık, dark mode  | sonnet | `packages/ui-tokens`, stil dosyaları |
| **Operasyon**  | `xox-devops`         | Vercel projesi, env senkronu, domain, Actions, rollback                  | sonnet | CI/config                            |
|                | `xox-integrator`     | Dalga sonu merge, çakışma çözümü, merge-sonrası smoke                    | opus   | tüm repo (merge bağlamında)          |
|                | `xox-memory-curator` | `journal` → `decisions/gotchas/conventions` damıtma, `CLAUDE.md` bütçesi | sonnet | `docs/memory`, `CLAUDE.md`           |
|                | `xox-reporter`       | Sabah raporu: board + git + QA + deploy → Markdown + Artifact            | sonnet | `docs/reports`                       |

### Zorunlu rapor formatı (her subagent)

```yaml
task: <task-id>
status: done | blocked | failed
summary: <2-3 cümle>
files_changed: [...]
tests: { added: n, passing: n, coverage: '%' }
decisions: [{ karar, gerekçe, reddedilen_alternatif }]
gotchas: [<sonraki agent'ın bilmesi gerekenler>]
blocked_reason: <varsa>
next_suggestions: [...]
```

Lead bu raporu parse eder, `journal.ndjson`'a yazar, `board.json`'ı günceller.

---

## 8. Hafıza mimarisi — context kaybını önleme

```
KATMAN 1  Her zaman context'te
  CLAUDE.md            stack · ihlal edilemez kurallar · dizin haritası · hafıza indeksi (<200 satır)

KATMAN 2  Makine okur — tek gerçek kaynağı
  docs/board/board.json      görev · durum · bağımlılık · çakışma kümesi · sahip · deneme · branch
  docs/board/journal.ndjson  append-only olay günlüğü (çakışmaz, asla silinmez)

KATMAN 3  Kendi kendini güncelleyen bilgi tabanı
  docs/memory/decisions.md    her karar: tarih · bağlam · gerekçe · REDDEDİLEN alternatifler
  docs/memory/gotchas.md      zor yoldan öğrenilenler — tekrar denemeyi önler
  docs/memory/conventions.md  kod konvansiyonları — yeni agent buradan öğrenir
  docs/memory/api-contract.md yaşayan REST + WS sözleşmesi
  docs/memory/state.md        insan-okur anlık durum (board'dan üretilir)

KATMAN 4  Görev bazlı
  docs/board/reports/<task-id>.md
```

### Hook'larla zorunlu kılınan güncelleme

| Hook                           | Davranış                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `SessionStart`                 | Açılış/resume/**compact sonrası** board özetini + hafıza indeksini context'e enjekte eder |
| `PreCompact`                   | Sıkışmadan önce lead'i çalışma durumunu `state.md`'ye yazmaya zorlar                      |
| `SubagentStop`                 | Rapor dosyası yazılmış mı doğrular; `journal.ndjson`'a olay satırı ekler                  |
| `PostToolUse` (Edit/Write)     | Dokunulan dosyayı aktif görev kaydına işler (çakışma tespiti + review kapsamı)            |
| `PreToolUse` (Bash/Write/Edit) | Playwright duvarı · yıkıcı işlem snapshot'ı · secret içeren dosyada `git add` engeli      |
| `Stop`                         | Gece koşusu aktif + iş var + deadline geçmemişse duruşu **bloklar**                       |

`xox-memory-curator` her 3 dalgada bir çalışır: journal ve raporları damıtır, eskimiş kayıtları budar,
`CLAUDE.md`'yi satır bütçesinde tutar. Sistem gece boyunca kendi kendini öğretir.

---

## 9. Gece koşusu protokolü

```
/xox-night --until 07:30 --max-parallel 4
```

```
HAZIRLIK
  caffeinate -dimsu sarmalayıcı aç   (macOS uykusu koşuyu öldürmesin)
  .night-run-active yaz (deadline, dalga sayacı, token bütçesi)
  board.json yoksa:  analyst → architect → planner  (sıralı)
  ön uçuş: pnpm install · tsc --noEmit · lint · mevcut testler yeşil mi?
  DALGA 0: yürüyen iskelet — yeşil yanmadan başka dalga BAŞLAMAZ

DALGA DÖNGÜSÜ (deadline'a kadar)
   1  board oku → bağımlılığı çözülmüş + çakışma kümeleri AYRIK görevleri seç (≤ N)
   2  her göreve worktree:  .claude/worktrees/<task-id>   branch: feat/<task-id>
   3  TEK mesajda paralel dispatch
   4  raporları topla → board güncelle → journal'a yaz
   5  bitenler → reviewer (+ security / perf) paralel
   6  bulgu varsa → aynı dev agent'a fix görevi   ⟳ max 3 deneme, sonra blocked
   7  yeşiller → integrator: sırayla main'e merge, çakışma çöz, smoke test
   8  devops → preview deploy → URL
   9  qa-e2e → preview URL'e karşı Playwright → yapılandırılmış rapor
  10  QA kırmızı → yeni görev kartı → döngüye geri
  11  board + journal + state.md COMMIT + good/wave-N tag'i   ◄ kalıcı checkpoint
  12  canlı durum panosu Artifact'ini yeniden yayınla
  13  her 3 dalgada: memory-curator

BİTİŞ  deadline · board boş · kritik durdurucu
       → reporter: sabah raporu + Artifact + bildirim
       → caffeinate kapat · orphan worktree temizliği
```

### Dayanıklılık mekanizmaları

| Risk                                    | Mekanizma                                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Oturum gece bitiyor                     | `Stop` hook'u duruşu bloklar. Koruma: deadline, max dalga sayısı, ardışık başarısızlık sayacı                                                        |
| Tek görev geceyi kilitliyor             | 3 deneme → `blocked` + sebep → devam. Sabah raporunda "karar bekleyenler"                                                                            |
| Kötü merge sonraki dalgaları zehirliyor | Her başarılı dalga `good/wave-N` tag'i. Integrator 2 denemede toparlayamazsa son iyi tag'e otomatik dönüş + işi yeniden kuyruğa                      |
| Token/kota tükeniyor                    | %60 → paralellik düşür · %80 → opus'tan sonnet'e degrade · %95 → temiz checkpoint + kısmi rapor + dur                                                |
| macOS uyuyor                            | `caffeinate -dimsu`                                                                                                                                  |
| Yıkıcı işlem                            | `PreToolUse` hook'u otomatik `rescue/<timestamp>` tag'i atar + `danger.log`'a yazar, **sonra işlemi geçirir** (yetki kısılmaz, geri alınabilir olur) |
| Oturum çöküyor                          | Board + journal diskte ve commit'li → `/xox-night --resume` kaldığı yerden; orphan worktree'ler uzlaştırılır                                         |
| Felaket sabaha kadar görülmüyor         | Devre kesiciler anında bildirim: 3 ardışık dalga hatası · bütçe %80 · `main` 2 dalgadır kırık · yıkıcı işlem                                         |

---

## 10. Kalite kapıları — best practice zorlaması

Prompt talimatı gece 03:00'te tutmaz. Kalite **mekanik olarak** zorlanır.

### Statik kapılar (pre-commit + CI, geçemeyen commit olmaz)

- TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`; `tsc --noEmit` sıfır hata
- ESLint flat config: `@typescript-eslint` **strict-type-checked**, `react-hooks`, `next/core-web-vitals`, `jsx-a11y`, `import`, `security`
- **Bağımlılık sınır kuralları** (§3) — `playwright` importu `apps/e2e` dışında hata
- Prettier · `knip` (ölü kod + kullanılmayan bağımlılık) · `pnpm audit`
- **`gitleaks`** pre-commit — public repo, secret sızıntısı hard gate
- Conventional Commits + commitlint
- Bundle boyut bütçesi (`size-limit`)
- Kapsam eşikleri: `game-core` %100 branch · `shared`/`db` %90 · `web` %70 → altında build kırılır
- **Stryker mutasyon testi** `game-core`'da, hayatta kalan mutant eşiği — "yeşil ama yalancı test" savunması

### Definition of Done — 6 madde, lead **mekanik doğrular**

Subagent'ın "bitti" demesine güvenilmez; lead komutları kendisi çalıştırır.

1. Önce kırmızı test yazıldı (TDD), sonra yeşile döndü
2. `tsc --noEmit` + lint + format temiz
3. Kapsam (ve `game-core` için mutasyon) eşiği aşıldı
4. `xox-reviewer` bulgusu yok — ya da gerekçesi `journal`'a düşmüş
5. `docs/board/reports/<task>.md` yazıldı
6. Conventional commit + branch push

---

## 11. E2E stratejisi — izole Playwright

```
xox-qa-e2e   (yazma yetkisi: yalnız apps/e2e + docs/board/reports)
   ▲ girdi: { previewUrl, dalga no, değişen özellikler, kabul kriterleri }
   ├─ senaryo yazar → apps/e2e/tests/<feature>.spec.ts
   ├─ koşar → gerçek Vercel preview + xox_test veritabanı
   └─ çıktı → docs/board/reports/qa-wave-<n>.json
              { passed, failed[], severity, screenshot, trace, şüpheli dosya }
                              ▼
                      LEAD KARAR VERİR
        blocker → görevi dev agent'a geri aç, merge'i durdur
        major   → yeni görev kartı, dalgayı ilerlet
        minor   → backlog
        flaky   → 2 tekrar, hâlâ kararsızsa karantina + rapora not
```

### Önceden tasarlanan fixture'lar (yoksa QA agent saatlerce tıkanır)

- **`twoPlayers`** — iki eşzamanlı browser context, iki oturum açmış kullanıcı, aynı oda.
  Online oyunun _tek_ anlamlı test biçimi.
- **Tohum veri** — deterministik test kullanıcıları, `packages/db` seed scripti
- **DB reset** — her koşu öncesi `xox_test` sıfırlanır
- **Expo Web hedefi** — mobil bileşen ağacı tarayıcıda render edilir, duman testi koşar

### Kritik senaryolar

kayıt/giriş · bilgisayara karşı 3 zorluk · oda kur · kodla katıl · sıra zorlaması ·
kazanma/beraberlik · rövanş · kopma + reconnect + resync · rakip terk etme · leaderboard/ELO güncellemesi

Playwright üç katmanda ana projeden uzak tutulur: **(1)** PreToolUse hook engeli · **(2)** ESLint sınır kuralı · **(3)** CI kontrolü.

---

## 12. Güvenlik ve gizli anahtarlar

- Repo **public** → GitHub secret scanning + push protection **aktif** (doğrulandı)
- `.gitignore` sertleştirildi: `.env*`, `*.pem`, `*.key`, `.vercel`, `secrets/`
- `gitleaks` pre-commit hard gate + `PreToolUse` hook'unda secret'lı `git add` engeli
- Atlas URI yalnızca `.env.local` ve Vercel env'de; kod ve dokümanda **yalnızca değişken adı** geçer
- Veritabanı ayrımı ve ortam eşlemesi:
  - `xox_dev` → yerel geliştirme (`.env.local`)
  - `xox_test` → **Vercel Preview** ortamı — `xox-qa-e2e` buraya karşı koşar, her koşu öncesi sıfırlanır
  - `xox_prod` → Vercel Production (`xox.omerdursun.com`)
    Preview deploy'ların `xox_test`'e bakması `xox-devops`'un kurduğu ortam-kapsamlı env değişkenleriyle sağlanır.
- `xox-security` agent'ı auth/WS/DB'ye dokunan her görevi inceler
- **İş sonrası öneri:** Atlas şifresi bir kez rotate edilmeli (bu oturumda düz metin paylaşıldı)

---

## 13. Gözlemlenebilirlik ve raporlama

**Koşu sırasında** — her dalga sonunda yeniden yayınlanan **canlı durum panosu Artifact'i**;
Ömer gece uyanırsa telefondan tek linke bakar. Terminale gerek yok.

**Sabah** — `docs/reports/YYYY-MM-DD-night-run.md` + yayınlanmış Artifact + bildirim:
dalga zaman çizelgesi · merge edilenler · P0/P1/P2 tamamlanma yüzdesi · test + kapsam + mutasyon skoru ·
e2e sonuçları · **bloklananlar ve senden beklenen kararlar** · alınan mimari kararlar ·
deploy/preview URL'leri · token harcaması · riskler.

**Üründe** — Sentry (hata) + Vercel Analytics + Speed Insights (Web Vitals), gün 1'den.

---

## 14. Ön koşul durumu

| Ön koşul            | Durum                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------- |
| GitHub `A1640A/XOX` | ✅ mevcut, boş, public; push+workflow yetkisi var; secret scanning + push protection açık |
| Vercel CLI          | ✅ `omeerdursunn` girişli — **54.14.2 → 59.5.0 güncellenecek**                            |
| Domain              | ✅ `omerdursun.com` Vercel nameserver'larında; `xox.` alt alanı çözülüyor                 |
| MongoDB Atlas       | ✅ URI sağlandı → `.env.local` + Vercel env'e yazılacak                                   |
| `gitleaks`          | ⬜ kurulacak (`brew install gitleaks`)                                                    |
| Xcode/Simulator     | ⬜ gerekmiyor (Expo Web hedefi seçildi)                                                   |

---

## 15. Kapsam dışı (YAGNI)

Turnuva modu · sesli/görüntülü sohbet · NxN tahta varyantları · ödeme/abonelik ·
push bildirimleri · app store yayını · çok dilli arayüz · SSR-dışı native e2e (Maestro) ·
Redis pub/sub (change stream yetersiz kalırsa değerlendirilecek yedek)

---

## 16. Riskler

| Risk                                                         | Etki                      | Azaltma                                                                                                             |
| ------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Vercel WS + change stream fan-out beklendiği gibi çalışmıyor | Gecenin tamamı boşa gider | **Dalga 0 dikey dilimi** — gerçek deploy'da kanıtlanmadan başka iş başlamaz; dokümante edilmiş Redis yedeği         |
| Auth.js Expo köprüsü tıkanıyor                               | Mobil P1 kayar            | Köprü önceden tasarlandı (§6.3); tıkanırsa mobil auth `blocked`, web akmaya devam eder                              |
| Ajanlar yeşil ama yalancı test yazıyor                       | Sahte tamamlanma          | Stryker mutasyon testi + gerçek preview'a karşı e2e + reviewer'ın "test implementasyon olmadan kırmızı mı" kontrolü |
| Token kotası gece yarısı bitiyor                             | Sessiz ölüm               | Kademeli degrade + %95'te temiz checkpoint                                                                          |
| Paralel worktree'ler çakışıyor                               | Merge cehennemi           | Planner her göreve **çakışma kümesi** yazar; lead ayrık kümeleri seçer; integrator sıralı merge yapar               |
| Geniş v1 tek geceye sığmıyor                                 | Beklenti uyuşmazlığı      | P0/P1/P2 katmanlaması; rapor yüzde verir; ikinci gece `--resume` ile devam                                          |
