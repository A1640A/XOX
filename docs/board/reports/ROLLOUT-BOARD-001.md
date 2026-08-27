```yaml
task: ROLLOUT-BOARD-001
status: done (kod+test) — ADR-0018'in "açık doğrulama"sı ÖLÇÜLEMEDİ (deploy yetkisi kartın dışında)
branch: feat/ROLLOUT-BOARD-001
commit: c3b2f7d
summary: >
  GET /api/health'e iki yeni boolean eklendi (skewProtectionEnabled,
  deploymentIdPresent) — Vercel Skew Protection'ın bu projede etkin olup
  olmadığı artık MEKANİK olarak ölçülebilir (ADR-0018 §3 "İLK KRİTER BİR
  ÖLÇÜMDÜR"). `db` alanı DOKUNULMADI (OPS-007 nöbetçisi bozulmadı — kanıt
  aşağıda). `apps/web/next.config.ts`'e `deploymentId: process.env.VERCEL_
  DEPLOYMENT_ID` ELLE yazıldı (ADR'nin "sonuç 0/yoksa" dalı) — gerçek ölçüm
  BU KARTTA yapılamadı çünkü deploy görev kapsamı dışında bırakıldı (aşağıda
  "yapamadıklarım" bölümü). `apps/web/components/board-config/use-board-
  modes.ts` (yeni) boyut/K seçenek listesinin TEK türetme noktası olarak
  eklendi. Kill switch'in kendisi (`enabled-sizes.ts`) ve mevcut tüketicileri
  (POST /api/rooms, HomeActions→BoardConfigPicker) DEĞİŞMEDİ.

##############################################################################
# 1) KILL SWITCH TEK KAYNAK KANITI — ikinci kopya yazılmadı
##############################################################################

enabled_sizes_dosyasina_dokunulmadi:
  komut: 'git diff --stat apps/web/lib/game/enabled-sizes.ts apps/web/app/api/rooms/route.ts'
  sonuc: '(boş çıktı) — HİÇBİR satır değişmedi. Kill switch API-BOARD-001'in bıraktığı hâliyle korundu.'

gercek_import_grafiği:
  komut: "grep -rn \"^import.*enabled-sizes\\|from '@/lib/game/enabled-sizes'\" apps/web --include='*.ts' --include='*.tsx' | grep -v test"
  sonuc: |
    apps/web/app/page.tsx:2:import { getEnabledBoardSizes } from '@/lib/game/enabled-sizes'
    apps/web/app/api/rooms/route.ts:10:import { isBoardSizeEnabled } from '@/lib/game/enabled-sizes'
  yorum: >
    TAM OLARAK İKİ gerçek tüketici — biri sunucu-render (RSC, page.tsx),
    biri sunucu-doğrulama (POST /api/rooms). `use-board-modes.ts` ve
    `BoardConfigPicker.tsx` bir önceki grep'te (geniş kalıp: isBoardSizeEnabled
    OR getEnabledBoardSizes) göründü ama bu YALNIZ DOC-COMMENT metni
    ("ADR-0018 kill switch, getEnabledBoardSizes()..." açıklaması) — GERÇEK
    `import` satırı yok. İkinci bir ortam okuması, ikinci bir liste, ikinci
    bir filtre YOK.

daraltma_odaya_asla_geriye_donuk_uygulanmiyor_kaniti:
  komut: "grep -rln 'enabled-sizes\\|isBoardSizeEnabled\\|XOX_ENABLED_BOARD_SIZES' packages/db packages/shared packages/game-core 'apps/web/app/api/rooms/[code]' 'apps/web/app/api/rooms/[code]/ws'"
  sonuc: '(boş çıktı) — kill switch join/move/WS/DB katmanlarının HİÇBİRİNDE görünmüyor.'
  yorum: >
    Kapı YALNIZ `POST /api/rooms` (oda KURMA) içinde var. Zaten kurulmuş bir
    11×11 odası, kill switch daha sonra 3'e daraltılsa bile joinRoom/applyMove/
    WS bu ortam değişkenine hiç bakmadığı için OYNANMAYA DEVAM EDER (Sonda 2,
    ADR-0018 §3 "geriye dönük daraltma yapmaz"). Bu YAPISAL bir garanti,
    ortama bağımlı bir test flake'i değil — mevcut `enabled-sizes.test.ts`
    (API-BOARD-001, dokunulmadı) zaten "Sonda 1"i (kapalı boyut REDDEDİLİR)
    kapsıyor; ben yalnız "Sonda 2"nin YOKLUĞUNU (kill switch'in başka hiçbir
    yerde çağrılmadığını) grep ile kanıtladım.

##############################################################################
# 2) use-board-modes.ts — TEK KAYNAK, kapalı boyut istemcide hiç görünmez
##############################################################################

dosya: 'apps/web/components/board-config/use-board-modes.ts (yeni)'
ne: >
  `useBoardModes(enabledSizes)` — `BOARD_MODES`'u (kural, game-core, donmuş)
  `enabledSizes`'a (operasyon, ADR-0018) göre filtreler. `useMemo` ile
  referans stabilitesi korunur. `enabled-sizes.ts`'i KENDİSİ import ETMEZ
  (yalnız sunucuda anlamlı bir ortam okuması burada YENİDEN yapılmaz) —
  çağıran zaten RSC zincirinden çözülmüş `enabledSizes`'ı verir.

test_kaniti:
  komut: 'pnpm --filter @xox/web exec vitest run components/board-config/use-board-modes'
  sonuc: '6/6 test yeşil'
  ornekler:
    - "'yalnız 3 açıkken 6 ve 11 listede HİÇ görünmez' → result.current.map(size) === [3]"
    - "'hiçbir boyut açık değilse BOŞ liste döner, ÇÖKMEZ' → []"
    - "'kural mantığını yeniden yazmaz: dönen her mod BOARD_MODES içindeki AYNI referanstır'"

BILINCLI_SAPMA_ACIKCA_YAZILIYOR: >
  Kartın çakışma kümesi `apps/web/components/board-config/**` içinde YALNIZ
  bu yeni dosyayı bana veriyor ("Dokunma: ... board-config/** (yalnız yeni
  use-board-modes.ts senin)") — `BoardConfigPicker.tsx`'e DOKUNAMADIM. O
  yüzden bu hook BUGÜN henüz hiçbir yerden ÇAĞRILMIYOR:
  `BoardConfigPicker.tsx` kendi satır-içi `BOARD_MODES.filter(...)`'ını
  (UI-CFG-001) hâlâ kullanıyor. İKİ MANTIK ŞU AN BİT BİT AYNI (aynı filtre,
  aynı `BOARD_MODES`, aynı `enabledSizes` parametresi) — davranışta HİÇBİR
  fark yok, ama gelecekte biri değişip diğeri değişmezse sessizce sapabilir.
  ÖNERİ (takip kartı): `BoardConfigPicker.tsx`'te `const modes = BOARD_MODES.
  filter(...)` satırını `const modes = useBoardModes(enabledSizes)` ile
  değiştiren tek satırlık bir kart. Kapsamım dışında olduğu için YAPMADIM,
  YAPTIM DEMEDİM — board.json'a not düşülmeli.

##############################################################################
# 3) Skew ölçümü — MEKANİK sonda kodda, GERÇEK ölçüm YAPILAMADI (deploy yok)
##############################################################################

health_route_degisikligi: |
  GET /api/health artık HER yanıt dalında (ok:true, ortam uyuşmazlığı 500,
  db erişilemez 503) şu iki alanı taşıyor:
    skewProtectionEnabled: process.env.VERCEL_SKEW_PROTECTION_ENABLED === '1'
    deploymentIdPresent:   process.env.VERCEL_DEPLOYMENT_ID var mı (DEĞERİ DEĞİL)
  DEĞER SIZDIRILMADI — yalnız boolean.

db_alanina_dokunulmadigi_kaniti:
  komut: 'git diff apps/web/app/api/health/route.ts | grep -n "db"'
  sonuc: |
    -      return Response.json({ ok: false, db: dbName, error: mismatch }, { status: 500 })
    +      return Response.json({ ok: false, db: dbName, error: mismatch, ...skew }, { status: 500 })
    -    return Response.json({ ok: true, db: dbName, at: new Date().toISOString() })
    +    return Response.json({ ok: true, db: dbName, at: new Date().toISOString(), ...skew })
  yorum: >
    `db: dbName` HER İKİ satırda da AYNEN KALDI — ad, tip, konum değişmedi,
    yalnız `...skew` EKLENDİ (spread, sona). `apps/e2e/global-setup.ts`'in
    bloke edici ön kontrolü (`db !== 'xox_test'` → koşuyu durdur, OPS-007)
    KIRILMADI.

test_kaniti:
  komut: 'pnpm --filter @xox/web exec vitest run app/api/health'
  sonuc: '2 dosya, tümü yeşil (mevcut KK-101 dört-hücreli tablo + yeni skew testleri)'
  yeni_testler:
    - "5 hücreli it.each: (skewFlag, deploymentId) × 4 kombinasyon + '0' özel durumu — booleanlar HER hücrede doğru"
    - "'DEĞER hiçbir zaman yanıta yazılmaz' → JSON.stringify(json) 'dpl_abc123' İÇERMİYOR (deploymentId string'i sızdırılmadı testi)"
    - "'db erişilemezken (503) de skew sinyalleri yanıtta bulunur' — sonda db durumundan BAĞIMSIZ çalışıyor"

deploymentId_next_config: |
  apps/web/next.config.ts:
    ...(vercelDeploymentId !== undefined ? { deploymentId: vercelDeploymentId } : {})
  Gerekçe: `exactOptionalPropertyTypes: true` altında `deploymentId?: string`e
  elle `undefined` ATANAMAZ (TS2375) — bu yüzden anahtar Vercel dışında
  (yerel/CI) TAMAMEN ATLANIYOR, `deploymentId: undefined` yazılmıyor.
  Vercel'de VERCEL_DEPLOYMENT_ID her zaman set olduğundan build sırasında
  anahtar her zaman mevcut olacak.

YAPAMADIKLARIM_ACIKCA (kartın açık doğrulaması KAPANMADI):
  gerekce: >
    ADR-0018 §3'ün "İLK KRİTER BİR ÖLÇÜMDÜR" maddesi ve board.json'daki
    "GERI ALMA UC KADEMESI ... 1. KADEME GERÇEKTEN DENENIR: ortam değişkeni +
    redeploy'un dakikalar içinde etkili olduğu PREVIEW'DA KANITLANIR" maddesi
    GERÇEK bir Vercel deploy'u ve gerçek env okuması gerektiriyor. Görev
    talimatım açıkça şunu yasakladı: "Production'a DOKUNMA — env değişkeni
    ayarlamak, deploy etmek, Vercel ayarı değiştirmek yok; kod ve test yaz,
    gerekeni raporda öner." Bu ikisi ÇELİŞİYOR; talimatım daha özel/güncel
    olduğu için ONA UYDUM ve DEPLOY ETMEDİM.
  yapmadigim_somut_seyler:
    - 'GET /api/health'i gerçek preview'a karşı çağırıp skewProtectionEnabled/deploymentIdPresent gerçek değerlerini OKUMADIM.'
    - 'XOX_ENABLED_BOARD_SIZES=3 ortam değişkenini hiçbir Vercel ortamına EKLEMEDİM, redeploy TETİKLEMEDİM.'
    - 'Kademe 1 (kill switch) geri alma senaryosunu preview'da GERÇEKTEN DENEMEDİM — yalnız kod/birim test seviyesinde kanıtladım (bkz. bölüm 1).'
  bu_izin_reddi_degil: >
    Bu bir "izin istemi reddedildi" olayı DEĞİL — hiçbir komutu denemedim ki
    reddedilsin. Görev tanımım deploy'u baştan kapsam dışı bıraktı, ben de
    denemedim. Bu yüzden lead'e "reddedildi" olarak değil, "kapsam dışı
    bırakıldığı için yapılmadı, devops'a devrediliyor" olarak bildiriyorum.
  oneri: >
    xox-devops bu branch merge olduktan sonra preview deploy alıp
    `GET /api/health`'i çağırsın. `skewProtectionEnabled: true` çıkarsa
    next.config.ts'teki elle-yazılmış `deploymentId` ZATEN ZARARSIZ (Next'in
    otomatik skew mekanizmasıyla ÇAKIŞMAZ, üstüne yazmaz) — kod değişikliği
    GEREKMEZ. `false`/yoksa ADR'nin öngördüğü hâl zaten kodda: deploymentId
    elle var. Sonrasında Kademe 1 (XOX_ENABLED_BOARD_SIZES=3 + redeploy)
    preview'da denenip dakikalar içinde etkili olduğu doğrulanmalı.

##############################################################################
# 4) Gates + doğrulama
##############################################################################

pnpm_gates:
  komut: 'pnpm gates'
  sonuc: 'EXIT 0 — typecheck + lint + format:check + test:coverage (842/842 test, 81 dosya) + knip (yalnız pre-existing configuration hint'ler, kapı kırılmadı)'
  kapsam: 'Statements 94.2% / Branches 89.36% / Functions 93.85% / Lines 96.5% (apps/web geneli)'

force_yeniden_kosum_turbo_cache_replay_degil:
  komut: 'pnpm exec turbo run typecheck --force && pnpm exec turbo run test:coverage --force --filter=@xox/web'
  sonuc: "Her ikisi de 'Cached: 0 cached' — eski yeşilin replay'i değil, gerçek yeniden koşum."

ci_kontrolu: >
  Bu branch main'e MERGE OLMADI (görev talimatı: "Merge/push yok"). Bu
  yüzden `gh run list --workflow=CI` kontrolü bu aşamada ANLAMLI DEĞİL —
  integrator merge ettikten SONRA lead'in Definition of Done listesindeki
  bu adımı çalıştırması gerekiyor.

##############################################################################
# 5) Değişen dosyalar
##############################################################################

degisiklikler:
  - dosya: 'apps/web/app/api/health/route.ts'
    ne: 'skewProtectionSignals() eklendi; ok:true/ok:false(mismatch)/ok:false(503) yanıtlarının HEPSİNE ...skew eklendi. db alanı DEĞİŞMEDİ.'
  - dosya: 'apps/web/app/api/health/route.test.ts'
    ne: '5+1 yeni test (skew×deploymentId matrisi + db-erişilemez durumunda sinyallerin varlığı + değerin sızdırılmadığı sondası).'
  - dosya: 'apps/web/next.config.ts'
    ne: 'deploymentId elle eklendi (Vercel dışında anahtar hiç yazılmaz — exactOptionalPropertyTypes uyumu).'
  - dosya: 'apps/web/components/board-config/use-board-modes.ts (yeni)'
    ne: 'useBoardModes(enabledSizes) — seçenek listesinin TEK türetme noktası. Henüz hiçbir yerden çağrılmıyor (bkz. bilinçli sapma).'
  - dosya: 'apps/web/components/board-config/use-board-modes.test.ts (yeni)'
    ne: '6 test — kapalı boyut hiçbir zaman dönmüyor, boş liste çökmüyor, referans kimliği korunuyor.'

commit_sha: 'c3b2f7d — feat(web): skew sondası + deploymentId + tahta boyutu kill switch tekilleştirme'
merge_push: 'YAPILMADI (görev talimatı gereği). Branch: feat/ROLLOUT-BOARD-001, worktree: .claude/worktrees/ROLLOUT-BOARD-001'
```
