# XOX — Lead Protokolü

Türkçe XOX oyunu. Web (Next.js → Vercel) + mobil (Expo). Online oda, gerçek zamanlı oyun.

## İhlal edilemez kurallar

1. **Playwright yalnızca `apps/e2e` içinde.** `apps/web`, `apps/mobile`, `packages/**` içinde
   `playwright` importu veya bağımlılığı YASAK. E2E gerekiyorsa görevi `xox-qa-e2e` agentına ver.
2. **TypeScript 6.0.3 sabit.** 7.x'e yükseltme — `typescript-eslint` desteklemiyor, lint katmanı ölür.
3. **Secret asla commit edilmez.** Repo PUBLIC. `.env.local` ve türevleri `.gitignore`'da.
4. **Kural mantığı yalnızca `packages/game-core`'da.** `web` ve `mobile` kuralı yeniden yazmaz, delege eder.
5. **Bir subagent "bitti" dediğinde inanma — doğrula.** Definition of Done'ı sen çalıştırırsın.
6. **Dalga uçuştayken `git add -A` KULLANMA.** Paralel agentlar yanlışlıkla ana checkout'a
   dosya yazabilir; kör staging onları merge edilmemiş işin raporu olarak `main`'e sokar.
   Dalga sırasında yalnızca açık yol stage et: `git add docs/board/board.json docs/board/journal.ndjson`

## Bu geceden 3 ölümcül ders (ayrıntı: `docs/memory/gotchas.md` → "Tekrar eden örüntüler")

- ESLint çözümleyicisi yanlış ayarlanırsa `boundaries`/`import-x/no-cycle` **hiç çalışmaz** ama
  lint yeşil kalır — kural 4'ün tek denetim mekanizması budur, "yeşil" tek başına kanıt değildir.
- Auth.js `jwt` callback'ini TANIMLAMA — oturum okumasında `user` yoktur, tanımlarsan her girişte
  çerez sessizce silinir. `@auth/core` zaten `sub: user.id`'yi kendisi yazar.
- `next-auth` import eden hiçbir dosya (`auth.ts`, `middleware.ts`) Vitest'te çalıştırılamaz;
  iş mantığını next-auth'suz ayrı bir dosyada yaz ve oradan test et (bkz. `conventions.md`).

## Dizin haritası

| Yol                  | İçerik                                                      |
| -------------------- | ----------------------------------------------------------- |
| `packages/game-core` | Kural motoru + minimax AI. Saf TS, bağımlılıksız, %100 test |
| `packages/shared`    | zod şemaları — WS protokolü, oda kodu sözleşmesi            |
| `packages/db`        | Mongoose modelleri, bağlantı, seed/reset                    |
| `packages/ui-tokens` | Web + mobil ortak tasarım tokenları                         |
| `apps/web`           | Next.js 16 App Router                                       |
| `apps/mobile`        | Expo 57 (native + web hedefi)                               |
| `apps/e2e`           | 🎭 Playwright — İZOLE                                       |
| `docs/board/`        | Görev panosu, journal, raporlar — **lead'in hafızası**      |
| `docs/memory/`       | Kararlar, tuzaklar, konvansiyonlar, API sözleşmesi          |
| `.claude/agents/`    | 18 uzman agent                                              |

## Hafıza — context sıkıştıktan sonra buradan devam et

| Dosya                         | Ne zaman okunur                                                   |
| ----------------------------- | ----------------------------------------------------------------- |
| `docs/board/board.json`       | Her dalga başında. Ne kaldı, ne bitti, ne bloklandı               |
| `docs/memory/state.md`        | Oturuma dönerken. İnsan-okur anlık durum                          |
| `docs/memory/gotchas.md`      | **Bir şeyi denemeden önce.** Daha önce başarısız olan yaklaşımlar |
| `docs/memory/decisions.md`    | Mimari bir karar vermeden önce. Neden böyle yapıldı               |
| `docs/memory/conventions.md`  | Kod yazmadan önce. Bu repodaki kalıplar                           |
| `docs/memory/api-contract.md` | REST/WS'e dokunmadan önce                                         |

## Dalga döngüsü

```
board oku → bağımlılığı çözülmüş + çakışma kümesi ayrık görevleri seç (≤4)
  → her göreve worktree (.claude/worktrees/<id>, branch feat/<id>)
  → TEK mesajda paralel dispatch
  → raporları topla, board güncelle, journal'a yaz
  → reviewer (+security/perf) → bulgu varsa aynı agenta fix (max 3 deneme)
  → integrator: sırayla main'e merge → devops: preview deploy
  → qa-e2e: preview'a karşı koş → rapor
  → board+journal+state.md COMMIT + good/wave-N tag
  → her 3 dalgada memory-curator
```

## Definition of Done (lead mekanik doğrular)

```bash
pnpm gates    # typecheck + lint + format:check + test:coverage + knip
```

**Merge sonrası `pnpm gates` YETMEZ.** Turbo cache worktree'ler arası paylaşılır ve
birleşmiş ağacın sonucu yerine branch'in eski yeşilini replay edebilir. Merge'den sonra:
`pnpm exec turbo run typecheck --force && pnpm exec turbo run test:coverage --force` —
çıktıda `Cached: 0 cached` görmeden yeşil sayma.

**`pnpm gates` yeşil + `Cached: 0` de YETMEZ — CI'ın KENDİSİ yeşil olmalı.** Bu hepsi
yerel ağaçta koşar; yerelde var olup CI'da olmayan şey (ör. `MONGODB_URI`) sessizce farklı
sonuç üretir (2026-08-25: CI 5 saat kırmızı kaldı, kimse fark etmedi). Merge sonrası
doğrulama listesine ekle: `gh run list --workflow=CI --limit 3`.

1. Kırmızı test önce yazıldı, sonra yeşile döndü
2. `pnpm gates` temiz
3. Kapsam eşiği aşıldı (`game-core` ayrıca `pnpm mutation`)
4. `xox-reviewer` bulgusu yok ya da gerekçesi journal'da
5. `docs/board/reports/<task>.md` yazıldı
6. Conventional commit atıldı

## Komutlar

| Komut                        | İş                              |
| ---------------------------- | ------------------------------- |
| `pnpm gates`                 | Tüm statik kapılar              |
| `pnpm dev`                   | Web + mobil geliştirme          |
| `pnpm e2e`                   | Playwright (izole projede)      |
| `pnpm mutation`              | game-core mutasyon testi        |
| `pnpm --filter @xox/db seed` | E2E test kullanıcıları          |
| `/xox-night`                 | Otonom gece koşusu              |
| `/xox-status`                | Board durumunu yenile ve göster |

## Commit kuralı

`<tip>(<kapsam>): <özet>` — kapsam: `web·mobile·e2e·core·shared·db·ui·ci·claude·board·deps·docs·plan·memory·deploy`
