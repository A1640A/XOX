```yaml
task: DESIGN-001a
status: done
summary: >
  Ömer'in seçtiği Yön A — "Kağıt & Mürekkep" tasarım dili yalnız `packages/ui-tokens` katmanına
  ve web'in `globals.css` üretim zincirine uygulandı; `apps/web/components/**`'e SIFIR dokunuş
  (`git diff --stat main -- apps/web/components` boş döndü, aşağıda kanıt). `colors.ts` Yön A
  paletine güncellendi ve yeni `surfaceRaised` (gölgesiz hover/aktif zemin) token'ı eklendi;
  `contrast.ts` artık üç yüzeyin (bg/surface/surfaceRaised) TÜMÜNE karşı doğruluyor. İki yeni
  modül: `board.ts` (ADR-0017 §1/§2/§8 sabitleri — `gridLine=2px` TEK sabit, `boardMax`,
  odak halkası, kazanan çizgi genişliği, soluk hücre opaklığı, X/O çizgi kalınlığı) ve
  `motion.ts` (hamle/kazanan animasyon süreleri, ikisi de <=200ms). `typography.ts`
  `fontFamily` (Fraunces/Inter/JetBrains Mono) ve `lineHeight` ile genişletildi, geriye dönük
  uyumlu. `generate-globals-css.ts`/`globals.css` bu üç modülü tüketecek şekilde yeniden
  üretildi (Tailwind v4 `--font-*` namespace'i + yeni `:root` bloğu). KK-084 hex yasağı canlı
  sondayla doğrulandı (aşağıda gerçek çıktı). `pnpm gates` tamamı yeşil, ui-tokens %100 kapsam.

design_dili_secimi:
  yon: 'A — Kağıt & Mürekkep'
  kaynak: 'docs/design/2026-08-25-gorsel-yonler.md, docs/design/onizleme/yon-a.html'
  adr: "ADR-0017 (ARCH-002) — Yön A'nın gap/zoom/hitSlop önerilerinden ÜÇ bilinçli sapma"

colors_ts:
  dosya: 'packages/ui-tokens/src/colors.ts'
  tablo: |
    | Token           | Açık (eski → yeni)                   | Koyu (eski → yeni)    |
    | --------------- | ------------------------------------- | ---------------------- |
    | bg              | #faf9f7 → #f7f4ee                     | #17161a → #14120f      |
    | surface         | #ffffff (değişmedi)                   | #211f26 → #1e1b17      |
    | surfaceRaised   | YENİ #fbf9f5                          | YENİ #262220           |
    | border          | #857f79 → #8a8478                     | #78727e → #786d5f      |
    | text            | #1c1917 → #241f1a                     | #f5f4f2 → #f2ede4      |
    | textMuted       | #78716c → #6b6255                     | #a8a29e → #b3a998      |
    | accent          | #2563eb → #1d4ed8                     | #60a5fa → #93b4ff      |
    | playerX         | #2563eb → #243b5c (ink lacivert)      | #60a5fa → #aac0ea      |
    | playerO         | #be123c → #7a2e2e (bordo ink)         | #fb7185 → #e6a8a2      |
    | win             | #15803d → #2f6b3a                     | #4ade80 → #8ccb98      |
    | danger          | #dc2626 → #a13d2c                     | #f87171 → #e2897c      |
  not: >
    surfaceRaised, Yön A'nın gölgesiz "yükselti" zemini — hover/aktif/basılı durumlar için.
    `meetsTextContrast` (contrast.ts) artık bg/surface'ın yanı sıra surfaceRaised'a karşı da
    doğruluyor. playerX/playerO yalnız renkle ayırt edilmiyor — board.ts'teki markStrokeX(3px)/
    markStrokeO(2px) şekil+kalınlık farkını veriyor (renk körlüğü güvencesi).

kontrast_tablosu:
  yontem: >
    WCAG kontrast oranı, packages/ui-tokens/src/contrast.ts'teki AYNI formülle (script ile)
    hesaplandı; contrast.test.ts'te kilitlendi. Her metin/vurgu token'ı ÜÇ yüzeye (bg/surface/
    surfaceRaised) karşı >=4.5:1, border aynı üç yüzeye karşı >=3:1 eşiğiyle ölçüldü.
  acik_tema: |
    | Token     | vs bg | vs surface | vs surfaceRaised | Sonuç |
    | --------- | ----- | ---------- | ------------------ | ----- |
    | text      | 14.88 | 16.33      | 15.53               | OK    |
    | textMuted | 5.46  | 5.99       | 5.70                | OK    |
    | accent    | 6.10  | 6.70       | 6.37                | OK    |
    | playerX   | 10.31 | 11.32      | 10.77               | OK    |
    | playerO   | 8.47  | 9.30       | 8.85                | OK    |
    | win       | 5.82  | 6.39       | 6.08                | OK    |
    | danger    | 5.94  | 6.52       | 6.20                | OK    |
    | border    | 3.38  | 3.72       | 3.53                | OK (>=3:1) |
  koyu_tema: |
    | Token     | vs bg | vs surface | vs surfaceRaised | Sonuç |
    | --------- | ----- | ---------- | ------------------ | ----- |
    | text      | 16.03 | 14.71      | 13.52               | OK    |
    | textMuted | 8.05  | 7.39       | 6.79                | OK    |
    | accent    | 9.09  | 8.34       | 7.67                | OK    |
    | playerX   | 10.18 | 9.34       | 8.59                | OK    |
    | playerO   | 9.34  | 8.57       | 7.87                | OK    |
    | win       | 9.89  | 9.07       | 8.34                | OK    |
    | danger    | 7.21  | 6.62       | 6.08                | OK    |
    | border    | 3.70  | 3.39       | 3.12                | OK (>=3:1) |
  sonuc: >
    İki temada da, üç yüzeyin TÜMÜNDE, tüm metin/vurgu token'ları >=4.5:1, border >=3:1. Koyu
    tema açığın naif tersi değil — bağımsız ölçüldü (colors.test.ts "kopyala-yapıştır kayması
    yok" testi).

yeni_modul_board_ts:
  dosya: 'packages/ui-tokens/src/board.ts (YENİ)'
  kaynak: 'ADR-0017 §1, §2, §8'
  tokenlar: |
    | Token               | Değer  | CSS değişkeni                      | Kaynak                                    |
    | ------------------- | ------ | ----------------------------------- | ------------------------------------------ |
    | gridLine            | 2      | --xox-grid-line: 2px                | ADR-0017 §2 — tek sabit, boyuta göre SABİT |
    | boardMax            | 480    | --xox-board-max: 480px              | Yön A önizlemesindeki kart genişliği        |
    | focusRingWidth      | 2      | --xox-focus-ring-width: 2px         | Odak halkası (rengi --color-accent)         |
    | focusRingOffset     | 2      | --xox-focus-ring-offset: 2px        | Odak halkası ile kenar arası boşluk         |
    | winningOutlineWidth | 3      | --xox-winning-outline-width: 3px    | ADR-0017 §8c — renkten bağımsız sinyal      |
    | fadedOpacity        | 0.55   | --xox-faded-opacity: 0.55           | ADR-0017 §8b — >=%40 düşüş şartını payla geçer (%45) |
    | markStrokeX         | 3      | --xox-mark-stroke-x: 3px            | X: kalın çizgi                              |
    | markStrokeO         | 2      | --xox-mark-stroke-o: 2px            | O: ince çember                              |
  bilinçli_yokluk: >
    Hücre için alt sınır (28px/24px) YOK — board.test.ts bunu açıkça kilitliyor ("hiçbir token
    için alt sınır TANIMLANMAZ — CSS taşmasının tek önleyicisi budur"). Bu sayılar ADR-0017 §1
    gereği E2E-BOARD-001'de ÖLÇÜLEN iddialardır, token değildir.

yeni_modul_motion_ts:
  dosya: 'packages/ui-tokens/src/motion.ts (YENİ)'
  tokenlar: |
    | Token          | Değer                           | CSS değişkeni                |
    | -------------- | -------------------------------- | ------------------------------ |
    | moveDurationMs | 150                               | --xox-move-duration: 150ms    |
    | winDurationMs  | 200                               | --xox-win-duration: 200ms     |
    | easeOut        | cubic-bezier(0.16, 1, 0.3, 1)     | --xox-ease-out                |
  not: >
    İkisi de motion.test.ts'te <=200ms diye kilitli (rol talimatının "animasyon 200ms'yi
    geçmesin" değişmezi). prefers-reduced-motion bu paketin sorumluluğu DEĞİL — tüketen
    bileşen media query ile süreyi 0'a indirir.

typography_ts_genisletme:
  dosya: 'packages/ui-tokens/src/typography.ts'
  eklenen: 'fontFamily.serif/sans/mono (Fraunces/Inter/JetBrains Mono), lineHeight.tight=1.2/base=1.6'
  degismeyen: 'fontSize/fontWeight ölçeği AYNEN korundu (Yön A notu: mevcut ölçek kullanılıyor)'
  devir_notu: >
    fontFamily yalnız CSS font-family DEĞERİ — gerçek webfont yüklemesi (next/font/google ile
    apps/web/app/layout.tsx'e ekleme) bu kartın kapsamı DIŞINDA (layout.tsx "sıcak dosya
    dondurma", yazma alanımda değil). Fontlar yüklenene kadar tarayıcı yedek yığına düşer —
    sessiz bozulma değil, bir sonraki adımı bekliyor demek. Aynı sebeple prefers-color-scheme
    otomatik tema geçişi de devredildi: apps/web/lib/theme.ts çerez yoksa DAİMA 'acik' dönüyor
    (apps/web/app/layout.tsx bunu her zaman ayarlıyor) — bu iki dosya da yazma alanımın dışında.

globals_css_zinciri:
  degisen_dosyalar:
    - 'apps/web/lib/generate-globals-css.ts'
    - 'apps/web/app/globals.css'
    - 'apps/web/app/globals.css.test.ts'
  ne_yapildi: >
    Üreteç boardCssVariables()/motionCssVariables()'ı YENİ bir :root bloğuna, fontFamily'yi
    Tailwind v4'ün KENDİ --font-* tema namespace'ine (@theme içine) yazacak şekilde güncellendi
    — font-sans/font-serif/font-mono utility sınıfları otomatik bu yığınları kullanacak.
    globals.css üretecin çıktısıyla (generateGlobalsCss()) yeniden üretildi, ELLE
    DÜZENLENMEDİ.
  test_guncellemesi: >
    Birinci test (dosya == generateGlobalsCss() çıktısı, doğası gereği totolojik) DEĞİŞMEDİ.
    İkinci test (renk token'larını @xox/ui-tokens'tan BAĞIMSIZ doğrulayan döngü) AYNEN
    korundu — yalnız tokenCount eşiği surfaceRaised için 10'dan 11'e çıkarıldı, döngünün
    kendisi dokunulmadı. YENİ üçüncü test eklendi: aynı bağımsız-doğrulama mantığını board/
    motion CSS değişkenleri için tekrarlıyor VE --xox-grid-line'ın gerçek değerini ('2px')
    kaynaktan ayrı, sabit bir string ile kilitliyor (ADR-0017 §2'nin gerçek sayısı).

kk084_hex_sondasi:
  soru: 'KK-084 hex yasağı lint kuralı hâlâ ateşleniyor mu?'
  yontem: >
    apps/web/tmp-hex-probe.ts adında geçici bir dosyaya `export const probe = '#2563eb'`
    yazıldı, `pnpm exec eslint apps/web/tmp-hex-probe.ts` koşuldu, ardından dosya SİLİNDİ.
  gercek_cikti: |
    /Users/.../apps/web/tmp-hex-probe.ts
      1:22  error  Literal hex renk kodu yasak (KK-084). Rengi @xox/ui-tokens içindeki
                   themes.acik/themes.koyu üzerinden al  no-restricted-syntax

    ✖ 1 problem (1 error, 0 warnings)
    eslint exit code: 1
  sonuc: 'Kural GERÇEKTEN ateşliyor (kırmızı, exit 1). Sonda dosyası temizlendi, git status iz göstermedi.'

apps_web_components_dokunulmadi:
  kanit_komutu: 'git diff --stat main -- apps/web/components'
  kanit_ciktisi: '(boş — hiçbir dosya değişmedi)'

gates:
  ui_tokens_test_coverage: '6 dosya, 57 test, %100 satır/dal/fonksiyon/ifade kapsamı.'
  pnpm_gates: >
    Tümü yeşil: typecheck (7 paket), lint (eslint . --max-warnings=0), format:check (prettier),
    test:coverage (57 web test dosyası / 584 test dahil, tüm paketler), knip (yalnız
    bilgilendirici "configuration hints", hata yok).
  ortam_notu: >
    .env.local (gitignore'da, commit EDİLMEDİ) main checkout'tan bu worktree'ye kopyalandı ki
    MONGODB_URI'ye bağlı presence.test.ts de dahil TÜM testler gerçekten koşsun (fresh
    worktree'lerde bu dosya otomatik gelmiyor — bilinen bir gotcha, docs/memory/gotchas.md).

commit_shas:
  - 'b752661 feat(ui): Yön A palet (Kağıt & Mürekkep) + surfaceRaised token + kontrast genişletmesi'
  - '73645c3 feat(ui): tahta/hareket/tipografi tokenları + globals.css senkronizasyonu'
  - "94b1889 docs(docs): DESIGN-001a raporu + ADR-0017'nin Yön A'dan üç sapması"

worktree: ".claude/worktrees/DESIGN-001a (branch feat/DESIGN-001a, main'den ayrıldı, main'e merge/push YAPILMADI)"

not_islem: >
  İlk yazma turunda (colors.ts/contrast.ts/css.ts/index.ts/typography.ts + yeni board.ts/
  motion.ts/casing.ts dosyaları VE docs/design/2026-08-25-gorsel-yonler.md notu) yanlışlıkla
  ANA CHECKOUT'a (main) yazıldı. Fark edilir edilmez `cp` ile doğru worktree'ye (feat/
  DESIGN-001a) taşındı, ardından `git checkout --`/`rm` ile main tamamen temizlendi (yalnız
  bu göreve ait OLMAYAN docs/board/journal.ndjson değişikliğine dokunulmadı). `git status
  --porcelain` ile main'in temiz olduğu iki kez doğrulandı.

blocked_reason: null

design_001b_notlari:
  - >
    Tüketim: @xox/ui-tokens'tan board, motion, fontFamily, lineHeight, themes import et;
    bileşende ham hex/piksel YAZMA (KK-084 canlı). Web'de font-sans/font-serif/font-mono hazır
    çalışıyor; p-*/gap-* gibi boşluk sınıfları HÂLÂ Tailwind'in varsayılan ölçeğinde —
    spacing.ts BİLEREK Tailwind'in --spacing namespace'ine bağlanmadı (site genelinde TÜM
    boşluk sınıflarının davranışını sessizce değiştirirdi, "yalnız token" sınırını aşardı);
    spacing/radius'u doğrudan JS sabiti olarak tüket.
  - >
    Tahta: hücre arka planı var(--color-surface), tahta arka planı (ızgara çizgisinin kendisi)
    var(--color-border), hover/aktif zemin var(--color-surface-raised). Odak halkası:
    outline: var(--xox-focus-ring-width) solid var(--color-accent); outline-offset:
    var(--xox-focus-ring-offset). Kazanan hücre: outline: var(--xox-winning-outline-width)
    solid var(--color-win) + data-kazanan; kazanan OLMAYAN hücrelerde opacity:
    var(--xox-faded-opacity).
  - 'Hücre alt sınırı YOK, EKLEME — board.test.ts kilitledi, ADR-0017 §1/KK-B50 ihlali olur.'
  - >
    prefers-reduced-motion: --xox-move-duration/--xox-win-duration yalnız "aktif" süre;
    @media (prefers-reduced-motion: reduce) ile 0ms'ye indirmek TÜKETEN bileşenin sorumluluğu.
  - >
    Font yükleme (next/font) + prefers-color-scheme otomatik geçişi apps/web/app/layout.tsx
    ve apps/web/lib/theme.ts'e dokunmayı gerektiriyor — bu kartın yazma alanı DIŞINDA, ayrı
    bir karta devredilmeli.
  - >
    ADR-0017'nin Yön A'dan üç sapması (gap 1->2px, "Yakınlaştır" uygulanmadı, hitSlop
    reddedildi) docs/design/2026-08-25-gorsel-yonler.md'ye not düşüldü — "uygulanmamış"
    sanılıp geri getirilmemeli.

next_suggestions:
  - 'UI-BOARD-001 artık başlayabilir — sert ön koşulu (bu kart) tamamlandı.'
  - >
    Ayrı bir karta devredilmeli: next/font ile Fraunces/Inter/JetBrains Mono yüklemesi +
    apps/web/lib/theme.ts'e prefers-color-scheme fallback'i (data-tema çerezi yoksa sistem
    tercihine uy, varsa çerez kazansın).
```
