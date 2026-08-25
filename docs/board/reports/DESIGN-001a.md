---
task: DESIGN-001a
title: Yön A tasarım dili + tokenlar — yalnız ui-tokens katmanı
agent: xox-designer
status: done
branch: feat/DESIGN-001a
---

## Özet

Ömer'in seçtiği **Yön A — Kağıt & Mürekkep** tasarım dili, `packages/ui-tokens`'a ve web'in
`globals.css` üretim zincirine uygulandı. `apps/web/components/**` içinde **tek satır bile**
değiştirilmedi (grep ile doğrulandı, aşağıda). Bileşenler artık şu tokenlarla besleniyor;
tüketim `UI-BOARD-001`/`DESIGN-001b`'nin işi.

`apps/web/components/**`'a dokunulmadığının kanıtı:

```
$ git diff --stat feat/DESIGN-001a main -- apps/web/components
(boş çıktı — hiçbir dosya değişmedi)
```

## Eklenen/değişen tokenlar

### `packages/ui-tokens/src/colors.ts` — Yön A paleti (mevcut şemayı KIRMADAN)

| Token           | Açık (eski → yeni)                   | Koyu (eski → yeni)    |
| --------------- | ------------------------------------ | --------------------- |
| `bg`            | `#faf9f7` → `#f7f4ee`                | `#17161a` → `#14120f` |
| `surface`       | `#ffffff` (değişmedi)                | `#211f26` → `#1e1b17` |
| `surfaceRaised` | **YENİ** `#fbf9f5`                   | **YENİ** `#262220`    |
| `border`        | `#857f79` → `#8a8478`                | `#78727e` → `#786d5f` |
| `text`          | `#1c1917` → `#241f1a`                | `#f5f4f2` → `#f2ede4` |
| `textMuted`     | `#78716c` → `#6b6255`                | `#a8a29e` → `#b3a998` |
| `accent`        | `#2563eb` → `#1d4ed8`                | `#60a5fa` → `#93b4ff` |
| `playerX`       | `#2563eb` → `#243b5c` (ink lacivert) | `#60a5fa` → `#aac0ea` |
| `playerO`       | `#be123c` → `#7a2e2e` (bordo ink)    | `#fb7185` → `#e6a8a2` |
| `win`           | `#15803d` → `#2f6b3a`                | `#4ade80` → `#8ccb98` |
| `danger`        | `#dc2626` → `#a13d2c`                | `#f87171` → `#e2897c` |

`surfaceRaised`: Yön A'nın gölgesiz "yükselti" zemini — hover/aktif/basılı durumlar için.
`contrast.ts`'teki `meetsTextContrast` artık `bg`/`surface`'ın yanı sıra `surfaceRaised`'a karşı
da doğruluyor (üç yüzeyin TÜMÜ, aşağıdaki tabloda görülebilir).

### `packages/ui-tokens/src/board.ts` — YENİ dosya (ADR-0017 §1/§2/§8, hücre/tahta sabitleri)

| Token                 | Değer  | CSS değişkeni                      | Kaynak                                              |
| --------------------- | ------ | ---------------------------------- | --------------------------------------------------- |
| `gridLine`            | `2`    | `--xox-grid-line: 2px`             | ADR-0017 §2 — tek sabit, boyuta göre DEĞİŞMEZ       |
| `boardMax`            | `480`  | `--xox-board-max: 480px`           | Yön A önizlemesindeki kart genişliği                |
| `focusRingWidth`      | `2`    | `--xox-focus-ring-width: 2px`      | Odak halkası (rengi `--color-accent`)               |
| `focusRingOffset`     | `2`    | `--xox-focus-ring-offset: 2px`     | Odak halkası ile kenar arası boşluk                 |
| `winningOutlineWidth` | `3`    | `--xox-winning-outline-width: 3px` | ADR-0017 §8c — renkten bağımsız sinyal              |
| `fadedOpacity`        | `0.55` | `--xox-faded-opacity: 0.55`        | ADR-0017 §8b — ≥%40 düşüş şartını payla geçer (%45) |
| `markStrokeX`         | `3`    | `--xox-mark-stroke-x: 3px`         | X: kalın çizgi (renk körlüğünde de ayırt)           |
| `markStrokeO`         | `2`    | `--xox-mark-stroke-o: 2px`         | O: ince çember                                      |

**Hücre için alt sınır (28px/24px) BİLEREK YOK** — `board.test.ts` bunu açıkça kilitler
("hiçbir token için alt sınır TANIMLANMAZ — CSS taşmasının tek önleyicisi budur"). Bu sayılar
ADR-0017 §1 gereği `E2E-BOARD-001`'de ölçülen iddialardır, token değildir.

### `packages/ui-tokens/src/motion.ts` — YENİ dosya (hareket dili)

| Token            | Değer                           | CSS değişkeni                |
| ---------------- | ------------------------------- | ---------------------------- |
| `moveDurationMs` | `150`                           | `--xox-move-duration: 150ms` |
| `winDurationMs`  | `200`                           | `--xox-win-duration: 200ms`  |
| `easeOut`        | `cubic-bezier(0.16, 1, 0.3, 1)` | `--xox-ease-out`             |

İkisi de `motion.test.ts`'te `<= 200ms` diye kilitli (rol talimatındaki "animasyon 200ms'yi
geçmesin" değişmezi). `prefers-reduced-motion` bu paketin sorumluluğu DEĞİL — tüketen bileşen
media query ile süreyi sıfıra indirir; not `motion.ts` başlığında yazılı.

### `packages/ui-tokens/src/typography.ts` — genişletildi (geriye dönük uyumlu)

- `fontFamily.serif/sans/mono` YENİ — Yön A'nın Fraunces/Inter/JetBrains Mono yığınları.
  `generate-globals-css.ts` bunları Tailwind v4'ün KENDİ `--font-*` tema namespace'ine
  yazıyor (`@theme` içinde) — `font-sans`/`font-serif`/`font-mono` utility sınıfları otomatik
  olarak bu yığınları kullanacak.
- `lineHeight.tight=1.2 / base=1.6` YENİ — `body`'ye `line-height: 1.6` olarak uygulandı.
- `fontSize`/`fontWeight` **DEĞİŞMEDİ** (Yön A notu: mevcut ölçek aynen kullanılıyor).

**DEVİR NOTU (DESIGN-001b / sonraki karta):** `fontFamily` yalnız CSS `font-family`
DEĞERİDİR — gerçek webfont YÜKLEMESİ (`next/font/google` ile `apps/web/app/layout.tsx`'e
ekleme) bu kartın kapsamı dışında (`layout.tsx` yazma alanımda değil, "sıcak dosya
dondurma" notu var). Fontlar yüklenene kadar tarayıcı ilk isimden yedek yığına düşer.
`prefers-color-scheme` otomatik tema geçişi de aynı sebeple devredildi: `apps/web/lib/theme.ts`
şu an `data-tema` çerezi yoksa DAİMA `'acik'` döndürüyor (`apps/web/app/layout.tsx`da bu
her zaman ayarlanıyor); sistem tercihine otomatik uyum bu iki dosyaya dokunmayı gerektirir —
ikisi de bu kartın yazma alanının dışında.

### `packages/ui-tokens/src/casing.ts` — YENİ (küçük refactor)

`css.ts`'in özel `toKebabCase` fonksiyonu paylaşılan bir modüle çıkarıldı; `board.ts` aynı
dönüşümü kullanıyor (`gridLine` → `grid-line`). Tek dönüşüm kuralı, iki kopya yok.

### `apps/web/lib/generate-globals-css.ts` / `apps/web/app/globals.css`

Üreteç artık `boardCssVariables()`/`motionCssVariables()`'ı ayrı bir `:root` bloğuna,
`fontFamily`'yi `@theme` içine (Tailwind `--font-*` namespace'i) yazıyor. `globals.css`
`generateGlobalsCss()` çıktısıyla **birebir** (dosya elle düzenlenmedi, üretecin çıktısı
yapıştırıldı — bu, `globals.css.test.ts`'in BİRİNCİ testinin zaten totolojik doğası).

## Kontrast tablosu (WCAG, `contrast.ts` formülüyle hesaplandı, `contrast.test.ts`'te kilitli)

Her metin/vurgu token'ı **üç** yüzeye karşı (`bg`, `surface`, `surfaceRaised`) ölçüldü — eşik
4.5:1. `border` aynı üç yüzeye karşı 3:1 eşiğiyle ölçüldü.

### Açık tema

| Token       | vs bg | vs surface | vs surfaceRaised | Sonuç    |
| ----------- | ----- | ---------- | ---------------- | -------- |
| `text`      | 14.88 | 16.33      | 15.53            | ✓        |
| `textMuted` | 5.46  | 5.99       | 5.70             | ✓        |
| `accent`    | 6.10  | 6.70       | 6.37             | ✓        |
| `playerX`   | 10.31 | 11.32      | 10.77            | ✓        |
| `playerO`   | 8.47  | 9.30       | 8.85             | ✓        |
| `win`       | 5.82  | 6.39       | 6.08             | ✓        |
| `danger`    | 5.94  | 6.52       | 6.20             | ✓        |
| `border`    | 3.38  | 3.72       | 3.53             | ✓ (≥3:1) |

### Koyu tema

| Token       | vs bg | vs surface | vs surfaceRaised | Sonuç    |
| ----------- | ----- | ---------- | ---------------- | -------- |
| `text`      | 16.03 | 14.71      | 13.52            | ✓        |
| `textMuted` | 8.05  | 7.39       | 6.79             | ✓        |
| `accent`    | 9.09  | 8.34       | 7.67             | ✓        |
| `playerX`   | 10.18 | 9.34       | 8.59             | ✓        |
| `playerO`   | 9.34  | 8.57       | 7.87             | ✓        |
| `win`       | 9.89  | 9.07       | 8.34             | ✓        |
| `danger`    | 7.21  | 6.62       | 6.08             | ✓        |
| `border`    | 3.70  | 3.39       | 3.12             | ✓ (≥3:1) |

**Sonuç: iki temada da, üç yüzeyin TÜMÜNDE, tüm metin/vurgu tokenları ≥4.5:1, `border` ≥3:1.**
Koyu tema açığın naif tersi değil — bağımsız ölçüldü (bkz. `colors.ts` yorumu, "kopyala-yapıştır
kayması yok" testi `colors.test.ts`'te).

`playerX`/`playerO` yalnız renkle ayırt edilmiyor: `board.markStrokeX=3px` / `markStrokeO=2px`
şekil+kalınlık farkını da veriyor (renk körlüğü güvencesi).

## KK-084 hex yasağı sondası — GERÇEK ÇIKTI

```
$ cat > apps/web/tmp-hex-probe.ts <<'EOF'
export const probe = '#2563eb'
EOF
$ pnpm exec eslint apps/web/tmp-hex-probe.ts
/Users/.../apps/web/tmp-hex-probe.ts
  1:22  error  Literal hex renk kodu yasak (KK-084). Rengi @xox/ui-tokens içindeki
               themes.acik/themes.koyu üzerinden al  no-restricted-syntax

✖ 1 problem (1 error, 0 warnings)
$ echo "eslint exit code: $?"
eslint exit code: 1
$ rm apps/web/tmp-hex-probe.ts
```

Kural **gerçekten ateşliyor** (exit code 1, kırmızı). Sonda dosyası oluşturulduktan hemen
sonra silindi; `git status --porcelain` iz bırakmadığını doğruladı.

## `globals.css.test.ts` — nasıl güncellendi

- **Birinci test** (`generateGlobalsCss()` çıktısıyla birebir aynılık) değişmedi — hâlâ
  totolojik doğasıyla aynı, yalnız üretecin YENİ çıktısına karşı çalışıyor (dosya üretecin
  çıktısıyla yeniden yazıldı, elle düzenlenmedi).
- **İkinci test** (renk token'larını `@xox/ui-tokens`'tan bağımsız doğrulayan döngü) **AYNEN
  KORUNDU** — yalnız `tokenCount` eşiği `10 → 11`'e çıkarıldı (`surfaceRaised` eklendi).
  Döngünün kendisi (`cssVariables(theme)`'i okuyup `onDisk.toContain` ile arayan kısım)
  DOKUNULMADI.
- **YENİ üçüncü test** eklendi: aynı bağımsız-doğrulama mantığını `boardCssVariables()`/
  `motionCssVariables()` için tekrarlıyor (bu ikisi öncesinde `globals.css`'te yoktu, yeni
  eklenen `:root` bloğu). Ayrıca `--xox-grid-line`'ın gerçek değerinin `'2px'` olduğunu ayrıca
  sabit bir iddiayla kilitliyor — döngü tek başına "birinin `boardCssVariables`'ı hatalı bir
  değer dönmeye başlaması" senaryosunu YAKALAYAMAZDI (ikisi de aynı kaynaktan okurdu), bu satır
  ADR-0017 §2'nin gerçek sayısını kaynaktan bağımsız bir string'le kilitliyor.

## Doğrulama

- `pnpm --filter @xox/ui-tokens test:coverage`: **6 dosya, 57 test, %100 satır/dal/fonksiyon/ifade kapsamı.**
- `pnpm gates` (typecheck + lint + format:check + test:coverage + knip): **tamamı yeşil**,
  57 test dosyası / 584 test (web) dahil, `.env.local` worktree'ye kopyalanarak (gitignore'da,
  commit edilmedi) `MONGODB_URI`'ye bağlı `presence.test.ts` de dahil tüm testler koştu.
- `git diff --stat` ile `apps/web/components/**`'e sıfır dokunuş doğrulandı.

## DESIGN-001b'ye bırakılan notlar

1. **Renk/tipografi/boşluk/hareket tüketimi:** `@xox/ui-tokens`'tan `board`, `motion`,
   `fontFamily`, `lineHeight`, `themes` import et; bileşende ham hex/piksel YAZMA (KK-084 hâlâ
   canlı, sonda yukarıda). Web'de Tailwind `font-sans`/`font-serif`/`font-mono` sınıfları hazır
   çalışıyor (`@theme`'e yazıldı); `p-*`/`gap-*` gibi boşluk sınıfları HÂLÂ Tailwind'in
   varsayılan ölçeğinde — `spacing.ts`'i Tailwind'in `--spacing` namespace'ine BİLEREK
   BAĞLAMADIM (site genelinde TÜM boşluk sınıflarının davranışını sessizce değiştirir, bu
   kartın "yalnız token, sıfır görsel regresyon riski" sınırını aşardı); `spacing`/`radius`
   değerlerini doğrudan JS sabiti olarak (`style={{ padding: spacing.md }}` ya da benzer)
   tüket.
2. **Tahta:** `--xox-grid-line`, `--xox-board-max`, `--xox-focus-ring-width/offset`,
   `--xox-winning-outline-width`, `--xox-faded-opacity`, `--xox-mark-stroke-x/o` hazır. Hücre
   arka planı `var(--color-surface)`, tahta arka planı (ızgara çizgisinin kendisi) `var(--color-border)`,
   hover/aktif zemin `var(--color-surface-raised)`. Odak halkası: `outline: var(--xox-focus-ring-width)
solid var(--color-accent); outline-offset: var(--xox-focus-ring-offset);`. Kazanan hücre:
   `outline: var(--xox-winning-outline-width) solid var(--color-win);` + `data-kazanan` +
   kazanan OLMAYAN hücrelerde `opacity: var(--xox-faded-opacity)`.
3. **Hücre alt sınırı YOK, EKLEME.** `board.test.ts` bunu kilitledi; bir `min-width`/`min-height`
   eklemek ADR-0017 §1'i (ve KK-B50'yi) ihlal eder.
4. **`prefers-reduced-motion`:** `--xox-move-duration`/`--xox-win-duration` yalnız "aktif" süre;
   `@media (prefers-reduced-motion: reduce)` ile bu değerleri `0ms`'ye indirmek TÜKETEN
   bileşenin sorumluluğu (ui-tokens'ın değil).
5. **Font yükleme + `prefers-color-scheme`:** yukarıda "DEVİR NOTU" bölümünde ayrıntılı —
   `next/font` ve otomatik açık/koyu tema geçişi `apps/web/app/layout.tsx`/`apps/web/lib/theme.ts`
   dosyalarına dokunmayı gerektiriyor, bu kartın yazma alanının dışında.
6. **ADR-0017'nin Yön A'dan üç sapması** `docs/design/2026-08-25-gorsel-yonler.md`'ye not
   düşüldü (gap 1→2px, "Yakınlaştır" uygulanmadı, `hitSlop` reddedildi) — tasarımcı ajan bunları
   "uygulanmamış" sanıp geri getirmemeli.
