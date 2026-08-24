```yaml
task: ROOM-API-001
status: done
summary: >
  Oda REST yüzeyi eklendi: `POST /api/rooms` (kurucu için 201 + `{ code }`) ve
  `GET /api/rooms/[code]` (`{ code, state, seats, canJoin }` / 404). Her iki
  route ince (< 120 satır) — kural yok, koşullu yazma yok; tüm otorite
  `@xox/db`'nin `createRoom`/`Room.findOne`'ında. Kimlik `resolveIdentity`
  (allowTicket GEÇİLMEDEN, varsayılan false) ile çözüldü — bilet bu uçlarda
  kabul edilmiyor. Kod sunucu tarafında normalleştirilir (`trim().toUpperCase()`)
  ve normalleştirme SONRASI `roomCodeSchema`'ya karşı doğrulanır; alfabe dışı
  karakter/yanlış uzunluk 400 INVALID_CODE. `createRoom`'un 5 denemede
  çakışma sonucu (`{ ok:false, code:'CODE_GENERATION_FAILED' }`) 503'e,
  beklenmeyen bir `ok:false` kodu (savunmacı dal) 500 SERVER_ERROR'a eşlendi;
  hiçbir sürücü hata mesajı istemciye sızmıyor (`console.error` + sabit kod).

  Testler `apps/auth/register`/`ws/ticket` kalıbını izliyor: yalnız `@/auth`nin
  `auth()`'u ve `@xox/db`'nin `createRoom`/`connectDb`/`Room.findOne` çağrıları
  mock'landı; `resolveIdentity`, `verifyToken`, `signToken` GERÇEK kodla
  çalıştı — böylece çerez VE Bearer'ın AYNI userId'ye çözüldüğü (AC2) ve
  `createRoom`'a giden argümanın gerçek `resolveIdentity` çıktısından geldiği
  fiilen kanıtlandı (bağımlılığı tamamen mock'layıp kendi mock'unu doğrulama
  tuzağına düşülmedi). `packages/db/src/rooms/create.test.ts` (DB-002'de
  merge edilmiş, dokunulmadı) zaten gerçek `xox_test`e karşı 5 deneme çakışma
  sondasını koşturuyor; bu görevde route seviyesinde `createRoom`'un
  döndürdüğü `CODE_GENERATION_FAILED` sonucunun 503'e doğru eşlendiği ayrıca
  doğrulandı.

  **İnceleme turu (review_round_1) sonrası — deneme 1/3, blocker yok, iki
  major düzeltildi:** aşağıdaki `review_round_1` bölümüne bak. Fix commit'i
  sonrası `pnpm --filter @xox/web test` 159/159 yeşil (bu görevin yeni 22
  testi dahil, önceki turdan +9), typecheck ve `pnpm lint apps/web packages/db`
  temiz, `prettier --check` yeşil.

files_changed:
  - apps/web/app/api/rooms/route.ts # POST, 49 satır (wc -l ile ölçüldü)
  - apps/web/app/api/rooms/route.test.ts # 7 test
  - apps/web/app/api/rooms/[code]/route.ts # GET, 73 satır (wc -l ile ölçüldü)
  - apps/web/app/api/rooms/[code]/route.test.ts # 15 test

review_round_1:
  reviewer_verdict: 'blocker yok, 2 major + 3 minor — mutantlar canlı koşturulmuş, iddia edilmemiş'
  major_1_canjoin_operand_ambiguity:
    finding: >
      route.test.ts:53-72'deki tek `false` fikstürü {state:'finished', iki
      koltuk dolu} idi — İKİ operand aynı anda false olduğu için test hangi
      operandın düştüğünü ayırt edemiyordu. Reviewer iki mutantı da (her
      operandı ayrı ayrı düşürerek) canlı koşturdu, ikisi de 13/13 yeşil
      kaldı. Somut risk: "boş koltuk" operandı düşerse waiting+iki-koltuk-dolu
      odada route canJoin:true hesaplıyor, roomStateResponseSchema'nın
      superRefine'ı reddediyor → ZodError → catch → 500 — ön kontrol
      uç noktasının kendisi patlıyor.
    fix: >
      İki YENİ fikstür eklendi, her biri TAM OLARAK bir operandı false
      yapıyor: {state:'playing', X dolu, O boş} → canJoin:false (state
      operandı false) ve {state:'waiting', X ve O dolu} → canJoin:false
      (koltuk operandı false). Eski iki-operand-birden-false testi de
      (finished + iki koltuk dolu) ayrıca bırakıldı.
    mutation_probe_1_state_operand_dropped:
      mutation: "canJoin: room.state === 'waiting' && bosKoltukVar  →  canJoin: room.state === 'waiting'"
      applied_with: 'perl -0pi, diff -q ile UYGULANDIĞI doğrulandı (git diff --stat: 1 dosya değişti)'
      real_output: >
        1 test kırmızı: "MAJOR-1 fix: canJoin false — state waiting AMA koltuk
        boş DEĞİL" → AssertionError: expected 500 to be 200 (roomStateResponseSchema
        superRefine'ı canJoin:true + iki koltuk dolu kombinasyonunu reddetti,
        route 500 SERVER_ERROR döndürdü). Diğer 14 test yeşil kaldı.
      reverted_with: 'git checkout -- "apps/web/app/api/rooms/[code]/route.ts" (fix zaten commit''liydi)'
    mutation_probe_2_seat_operand_dropped:
      mutation: "canJoin: room.state === 'waiting' && bosKoltukVar  →  canJoin: bosKoltukVar"
      applied_with: 'perl -0pi, diff -q ile UYGULANDIĞI doğrulandı'
      real_output: >
        1 test kırmızı: "MAJOR-1 fix: canJoin false — state waiting DEĞİL,
        koltuk boş" → AssertionError: expected 500 to be 200 (aynı superRefine
        reddi — state:'playing' + boş koltukta canJoin:true hesaplandı, şema
        reddetti). Diğer 14 test yeşil kaldı.
      reverted_with: 'git checkout -- "apps/web/app/api/rooms/[code]/route.ts"; git status --porcelain boş doğrulandı'
  major_2_unauthenticated_get_leaks_userid:
    finding: >
      Kimliksiz GET yanıtı seats.X/O.userId'yi (gerçek adla) veriyordu; bu
      değer POST /api/friends'in {userId} gövdesinin birebir kabul ettiği
      şey. Sızmış TEK bir oda kodu anonim tarafa hedeflenebilir kimlik +
      gerçek ad veriyordu. Reviewer'ın tüketici sondası: feat/UI-SKEL-001'de
      JoinCodeField doğrudan /oda/[kod]'a push ediyor, use-room doğrudan
      WS'e bağlanıyor — bu uca bugün hiçbir istemci kimliksiz erişmiyor.
    fix: >
      Lead kararı: uç nokta kimliğe bağlandı (userId'yi anonim projeksiyondan
      düşürmek roomStateResponseSchema değişikliği + CTR-001 unfreeze
      gerektirirdi, bu dalın dışı). GET artık başında resolveIdentity(req)
      çağırıyor (allowTicket GEÇİLMEDEN — POST'takiyle aynı disiplin), null
      ise 401 UNAUTHENTICATED (POST ile birebir aynı gövde). Sıra kimlik→kod
      doğrulama: kimliksiz çağıran artık "bu kod geçerli formatta mı"
      bilgisini bile öğrenemiyor. Kimlik reddedilince Room.findOne HİÇ
      çağrılmıyor — testte `expect(mockFindOne).not.toHaveBeenCalled()` ile
      kilitlendi (hem geçersiz kod hem geçerli kod senaryosunda). Dosya başı
      yorumu güncellendi (artık "kimlik gerektirmez" demiyor, kararın tam
      gerekçesini taşıyor). `_req` → `req` (artık kullanılıyor).
    tests_added:
      - 'kimliksiz + geçerli kod → 401, Room.findOne çağrılmadı'
      - 'kimliksiz + GEÇERSİZ kod → 401 (400 DEĞİL) — sıra kanıtı'
      - 'çerezle 200'
      - 'gerçek imzalı Bearer (signToken) ile 200 — mobil yol'
  minor_3_resolve_identity_outside_try:
    finding: >
      apps/web/app/api/rooms/route.ts:20 — resolveIdentity try dışındaydı;
      AUTH_SECRET eksik/kısaysa @auth/core MissingSecret fırlatır, istisna
      POST'tan kaçar, Next generic 500 döner, {code,message} zarfı atlanır,
      console.error hiç çalışmadığı için Vercel log'unda bağlam kaybolur.
    fix: >
      Her iki route'ta da resolveIdentity çağrısı try bloğunun İÇİNE alındı.
      Her iki route testine de mockAuth.mockRejectedValue(new Error(...)) ile
      sözleşme BİÇİMİNİN (500 + {code:'SERVER_ERROR'}) korunduğunu doğrulayan
      test eklendi; sürücü mesajının (ör. 'MissingSecret') gövdeye sızmadığı
      ayrıca kontrol edildi.
  minor_4_projection_and_connectdb_untested:
    finding: >
      Reviewer sondası: route .select('code') olarak daraltılınca 13/13
      yeşil kaldı — bu daraltma room.seats'i undefined yapar, room.seats.X
      TypeError fırlatır, her oda için 500 olurdu; bulgu 2 sonrası projeksiyon
      satırı güvenlik yükü taşıyan bir satır.
    fix: >
      GET testine `expect(mockSelect).toHaveBeenCalledWith('code state seats')`
      ve `expect(mockConnectDb).toHaveBeenCalled()` eklendi; POST testine de
      `expect(mockConnectDb).toHaveBeenCalled()` eklendi.
  minor_5_report_line_count_wrong:
    finding: 'Önceki rapor [code]/route.ts için 51 diyordu, gerçek (o anki hali) 56 idi.'
    fix: >
      Bu rapor satır sayılarını `wc -l`ÇIKTISINDAN alıyor (aşağıdaki
      `line_counts` bloğu); MAJOR-2 fix'i dosyayı 73 satıra çıkardı
      (identity kontrolü + genişletilmiş yorum bloğu).

acceptance:
  AC1_created_seat_X: >
    "AC1/AC2: Auth.js çerezi ile 201 + { code } döner" testi createRoom'a
    { userId, name } geçirildiğini ve yanıtın { code:'ABC234' } olduğunu
    doğruluyor; createRoom'un kendisi (packages/db, dokunulmadı) X koltuğuna
    oturtmayı zaten garanti ediyor (create.test.ts).
  AC2_identity_parity: >
    Hem POST hem GET testlerinde çerez (auth() mock) VE gerçek imzalı Bearer
    token (signToken ile üretilen GERÇEK JWT) ile aynı sonucun alındığı
    doğrulandı — resolveIdentity mock'lanmadığı için bu gerçek bir kanıt.
    Kimliksiz istek her iki route'ta da 401 UNAUTHENTICATED.
  AC3_code_generation_failed: >
    mockCreateRoom { ok:false, code:'CODE_GENERATION_FAILED' } dönünce route
    503 + aynı kod + sabit mesaj döndü. Gerçek 5-deneme sondası
    packages/db/src/rooms/create.test.ts'te (dokunulmadı).
  AC4_get_room_shape: >
    { code, state, seats, canJoin } birebir eşleşmesi (toStrictEqual) ve
    canJoin'in yalnız waiting+boş-koltuk'ta true olduğu — artık İKİ operandı
    AYRI AYRI düşüren mutasyon sondasıyla (yukarı bak) kanıtlanmış durumda.
    Var olmayan/silinmiş kod 404 ROOM_NOT_FOUND.
  AC5_normalization: >
    Gerçek test çıktısı — " abc234 " girdisiyle (kimlikli) çağrılan GET,
    Room.findOne'ı TAM OLARAK { code: 'ABC234' } argümanıyla çağırdı
    (toHaveBeenCalledWith ile doğrulandı). roomCodeSchema dışı karakter ve
    yanlış uzunluk 400 INVALID_CODE, Room.findOne çağrılmadı.
  AC6_thin_routes: 'route.ts 49 satır, [code]/route.ts 73 satır — ikisi de < 120 (wc -l çıktısı, elle yazılmadı).'
  AC7_gates: 'test(159/159)/typecheck/lint/format üçü de temiz (aşağıdaki komutlar bölümüne bak).'

line_counts:
  cmd: 'wc -l apps/web/app/api/rooms/route.ts "apps/web/app/api/rooms/[code]/route.ts"'
  output: |
    49 apps/web/app/api/rooms/route.ts
    73 apps/web/app/api/rooms/[code]/route.ts
    122 total

commands_run:
  - cmd: pnpm --filter @xox/web test
    result: 'Test Files 16 passed (16) · Tests 159 passed (159)'
  - cmd: pnpm --filter @xox/web typecheck
    result: 'tsc --noEmit -p tsconfig.json — hatasız'
  - cmd: pnpm lint apps/web packages/db
    result: 'eslint . --max-warnings=0 apps/web packages/db — hatasız (repo genelini kapsıyor)'
  - cmd: pnpm exec prettier --check "apps/web/app/api/rooms/**/*.ts"
    result: 'All matched files use Prettier code style!'

conflict_probe:
  note: >
    Bu görev @xox/db'ye DOKUNMADI (DB-002 zaten merge edilmişti); yalnız
    apps/web/app/api/rooms/route.ts ve apps/web/app/api/rooms/[code]/route.ts
    (+ testleri) yazıldı — çakışma kümesi tam olarak talimattaki gibi kaldı.
    WS-001/UI-SKEL-001'in dokunduğu apps/web/app/api/rooms/[code]/ws/**,
    lib/realtime/**, apps/web/app/**, components/** dizinlerine hiç girilmedi.

commits:
  - sha: 8f79651
    message: 'feat(web): oda REST yüzeyi — POST /api/rooms ve GET /api/rooms/[code]'
  - sha: 93c2e12
    message: 'docs(board): ROOM-API-001 raporu'
  - sha: fe68fe1
    message: 'fix(web): oda REST inceleme bulguları — GET kimliğe bağlandı, canJoin sondaları ayrıştırıldı'

out_of_scope_deferred_by_reviewer:
  - "errorJson'ın 4 kopyası → apps/web/lib/http/error-json.ts (dört route'u kapsayan çakışma kümesi gerekiyor)"
  - "packages/db/src/rooms/summary.ts → getRoomSummary(code) ile route'taki doğrudan Mongoose erişimini kaldırma"
  - "packages/shared'a canJoinRoom(state, seats) çıkarıp türetmeyi tekilleştirme (CTR-001 unfreeze gerekiyor)"
```
