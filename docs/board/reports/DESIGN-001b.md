```yaml
task: DESIGN-001b
status: done
summary: >
  Yön A ("Kağıt & Mürekkep", DESIGN-001a'da tanımlanan tokenlar) apps/web/components/**
  (board/** HARİÇ) ve ilgili app router sayfalarına uygulandı. Ana sayfa, giriş/kayıt/profil,
  oda kabuğu (RoomScreen — yalnız görsel kabuk), bilgisayar ekranı (ComputerGameInner — yalnız
  görsel kabuk), /gecmis, /siralama, /arkadaslar, /oda/katil ekranları kapsandı. YENİ TOKEN
  TANIMLANMADI: packages/ui-tokens ve apps/web/app/globals.css bu kartta hiç açılmadı — var
  olan CSS custom property'ler (--color-*, Tailwind v4'ün otomatik ürettiği bg-*/text-*/
  border-* utility sınıfları) ve Tailwind'in kendi ölçeğinden spacing/radius'la SAYISAL olarak
  örtüşen sınıflar (rounded-[6px]=radius.sm, rounded-[12px]=radius.md, p-4=spacing.md,
  duration-150/200=motion.moveDurationMs/winDurationMs) tüketildi. Tekrarlanan buton/alan/kart
  kalıpları apps/web/components/ui/styles.ts (YENİ, saf string sabitleri, React bileşeni değil)
  altında toplandı — 12+ dosyada birbirinden ufak farklarla tekrarlanan ham Tailwind dizgileri
  yerine.

kapsanan_ekranlar:
  - '/ (ana sayfa) — hero başlığı font-serif/Fraunces, birincil/ikincil buton ayrımı'
  - '/giris, /kayit — form alanları, birincil buton, metin bağlantısı'
  - '/profil — istatistik kartı, tema seçici (buttonToggle), çıkış/kaydet butonları'
  - "/oda/[kod] (RoomScreen.tsx) — YALNIZ GÖRSEL KABUK: oda kodu kartı, bağlantı rozeti,
    durum metni, pes et/rövanş butonları. Board'un prop sözleşmesi/bağlaması DOKUNULMADI
    (UI-BOARD-001'e ait, ADR-0017 §10)"
  - '/oyna/bilgisayar (ComputerGameInner.tsx) — YALNIZ GÖRSEL KABUK, aynı kısıt'
  - '/oda/katil (JoinRoomPreview.tsx) — oda kodu alanı font-mono, önizleme özeti'
  - '/gecmis, /siralama — tablo başlıkları/satırları, ELO/skor font-mono'
  - '/arkadaslar — bekleyen istek/arkadaş satırları, kabul/reddet/sil butonları'
  - 'Paylaşılan bileşenler: TopBar, ErrorBanner, JoinCodeField, BoardConfigPicker,
    DifficultyPicker, ConnectionBadge, CopyButton, EmojiTray, FriendAddButton, InviteLink,
    OpponentLeftBanner, ResultPanel, TurnTimer, GameConfigSummary'

yeni_token_tanimlanmadigi_kaniti:
  komut: 'git diff --stat main -- packages/ui-tokens apps/web/app/globals.css'
  cikti: '(boş — sıfır satır değişti)'
  not: >
    Tüm renkler @xox/ui-tokens'ın DESIGN-001a'da üretilen CSS değişkenlerinden gelen Tailwind
    v4 utility sınıflarıyla (bg-bg, bg-surface, bg-surface-raised, text-text, text-text-muted,
    border-border, bg-accent, text-accent, text-danger, border-danger, text-win, border-win)
    tüketildi. Yeni bir renk/ölçü gerektiğini düşündüğüm TEK an radius/gap seçimiydi — onlar
    da packages/ui-tokens/src/spacing.ts'teki mevcut radius.sm=6px/radius.md=12px SAYILARIYLA
    (rounded-[6px]/rounded-[12px]) tüketildi, yeni sayı icat edilmedi.

board_dokunulmadiginin_kaniti:
  komut: 'git diff --stat main -- apps/web/components/board'
  cikti: '(boş — sıfır satır değişti)'
  not: >
    RoomScreen.tsx ve ComputerGameInner.tsx'te YALNIZ görsel kabuk (header/başlık/buton/kart
    className'leri) değişti; <Board .../> çağrısındaki prop'lar (cells, config, interactive,
    winningLine, pendingIndex, lastMoveIndex, onCellPress) TEK SATIR bile değişmedi.

testid_ve_erisilebilirlik_korundu:
  testid: >
    97 TESTID.* kullanımı (grep sayımı) — hiçbiri silinmedi/yeniden adlandırılmadı, hepsi
    @xox/shared'dan geliyor (repo kuralı zaten böyle).
  role_status: 'role="status" sayısı değişiklik ÖNCESİ/SONRASI: 6/6 (git diff +/- eşit).'
  aria_pressed: '24 aria-pressed kullanımı korunuyor (BoardConfigPicker, DifficultyPicker, ThemeToggle).'
  aria_live: '12 aria-live kullanımı korunuyor.'
  prefetch_guard: >
    prefetch={false} TopBar.tsx (4 bağlantı) ve HomeActions.tsx'te (1 bağlantı) aynen duruyor;
    prefetch-guard.test.ts pnpm gates koşusunda YEŞİL (943 test içinde).
  metin: "Hiçbir Türkçe string gömülmedi — tüm metin tr.*'tan okunmaya devam ediyor."

kontrast_ve_ayirt_edilebilirlik:
  yontem: >
    Yeni renk tanımlanmadığı için DESIGN-001a'nın ölçtüğü kontrast tablosu (bkz.
    docs/board/reports/DESIGN-001a.md) AYNEN geçerli: text/textMuted/accent/playerX/playerO/
    win/danger açık+koyu temada bg/surface/surfaceRaised'a karşı >=4.5:1, border >=3:1.
    Bu kart hiçbir yeni renk-arka plan kombinasyonu İCAT ETMEDİ (yalnız var olan token'ları
    var olan yüzeylerde kullandı — ör. text-danger üzerinde border-danger, ikisi de aynı
    tabloda ölçülü).
  x_o_ayirt: >
    X/O'nun renk-dışı ayrımı (markStrokeX=3px/markStrokeO=2px) Board.tsx'e (UI-BOARD-001)
    ait — bu kartın kapsamı dışında, dokunulmadı.

hareket:
  yontem: >
    Yeni hover/focus geçişleri motion tokenlarıyla SAYISAL örtüşen Tailwind sınıflarıyla
    (transition-colors duration-150 = motion.moveDurationMs, bazı yerlerde duration-200 =
    motion.winDurationMs) eklendi; hepsine motion-reduce:transition-none (Tailwind'in yerleşik
    prefers-reduced-motion varyantı) eklendi — CSS düzeyinde, ekstra JS olmadan.
  hamle_kazanan_animasyonu: >
    Board'un kendi hamle/kazanan-çizgi animasyonu (UI-BOARD-001'in sorumluluğu, board/**
    dokunulmadığı için bu kartta YOK) zaten mevcut ve token tabanlı; bu kart yalnız ÇEVRESİNDEKİ
    (buton/kart/rozet) etkileşim geçişlerini ekledi.

paylasilan_stil_katmani:
  dosya: 'apps/web/components/ui/styles.ts (YENİ)'
  disa_verilenler: >
    buttonPrimary, buttonSecondary, buttonGhostSmall, buttonToggle, textInput, monoField, card,
    textLink, badgeBase, headingDisplay, mutedText — hepsi en az bir dosyada tüketiliyor (knip
    "unused exports" sıfır).
  neden: >
    Aynı kalıp (ör. "rounded border p-2") 12 dosyada birbirinden ufak farklarla (bazen border,
    bazen border-2, bazen rounded bazen yok) tekrarlanıyordu — bu kart onu TEK kaynağa indirdi,
    aynı @xox/ui-tokens'ın "tek kaynak" felsefesiyle tutarlı.

test_metin_ayrimi_dersi:
  bulgu: >
    FriendsContent.tsx'te "{entry.name} · {entry.elo}" metnini font-mono ile vurgulamak için
    elo'yu ayrı bir <span>'e sarmayı denedim; bu, @testing-library/dom'un getByText'inin metni
    BİRDEN FAZLA elemana bölündüğünde varsayılan string eşleşmesiyle BULAMAMASINA yol açtı
    (4 test kırmızıya döndü — FriendsContent.test.tsx). Kırmızı görür görmez GERİ ALDIM: elo
    artık aynı <span> içinde, düz metin. Testi DEĞİŞTİRMEDİM (kart kuralı) — bileşeni testin
    beklediği düz-metin yapısına geri döndürdüm. Görsel kayıp minimal (elo zaten aynı satırda,
    yalnızca font-mono vurgusu yok).

budget_before_after:
  yontem: "pnpm --filter @xox/web build && pnpm exec size-limit (main'e göre görev öncesi rakamlar karttan alındı)"
  heavy_235kb:
    en_agir_rota: '/oda/[kod]'
    once: '224.04 kB (kart brifinginde belirtilen ölçüm)'
    sonra: '225.16 kB'
    fark: '+1.12 kB (11 kB paydan ~1.12 kB kullanıldı, ~9.84 kB headroom kaldı)'
    diger_agir_rotalar_sonra: '/ 219.66 · /gecmis 216.00 · /oda/katil 215.66 · /siralama 215.07 · /arkadaslar 214.94 kB (hepsi 235 kB altında)'
  medium_184kb:
    sonra: '/profil 169.12 kB · /kayit 167.85 kB (ikisi de 184 kB altında, ~15/16 kB headroom)'
  light_158kb:
    sonra: '/giris 147.32 · /oyna/bilgisayar 146.90 · /_not-found 145.25 · /davet/[kod] 145.25 kB (hepsi 158 kB altında)'
  size_limit_exit_code: 0

pnpm_gates:
  calisma: 'pnpm gates (kök) — typecheck + lint + format:check + test:coverage (7 paket) + knip'
  sonuc: "EXIT 0 — 7/7 (web) + 6/6 (diğer paketler, cache'ten) başarılı; knip 0 unused export/file, yalnız bilgilendirici 'Configuration hint' (DESIGN-001a'da da doğrulanmış zararsız uyarı sınıfı)"
  force_dogrulama: >
    `pnpm exec turbo run typecheck test:coverage --force --filter=@xox/web` — "cache bypass,
    force executing", Cached: 0/2. apps/web: 96 test dosyası, 943 test, tümü YEŞİL.
  coverage: 'Statements 94.23% · Branches 89.4% · Functions 93.99% · Lines 96.43% (eşik: 70/65/70/70)'

commit_shas:
  - 'b697b18 feat(ui): DESIGN-001b — Yön A (Kağıt & Mürekkep) bileşen katmanına uygulanır'

worktree: ".claude/worktrees/DESIGN-001b (branch feat/DESIGN-001b, main'den ayrıldı 7d6b02a, merge/push YAPILMADI)"

kapsam_disinda_birakilan_dosyalar:
  - "apps/web/components/board/** — HİÇ AÇILMADI (ADR-0017 §10, UI-BOARD-001'in sahipliği)"
  - 'packages/ui-tokens/**, apps/web/app/globals.css, apps/web/lib/generate-globals-css.ts —
    HİÇ AÇILMADI (donuk, yeni token gerekmedi)'
  - 'apps/e2e/**, knip.json, package.json, apps/web/package.json, packages/** — HİÇ AÇILMADI'

blocked_reason: null
```
