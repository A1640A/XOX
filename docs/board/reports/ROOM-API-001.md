```yaml
task: ROOM-API-001
status: done
summary: >
  Oda REST yüzeyi eklendi: `POST /api/rooms` (kurucu için 201 + `{ code }`) ve
  `GET /api/rooms/[code]` (`{ code, state, seats, canJoin }` / 404). Her iki
  route ince (< 60 satır) — kural yok, koşullu yazma yok; tüm otorite
  `@xox/db`'nin `createRoom`/`Room.findOne`'ında. Kimlik `resolveIdentity`
  (allowTicket GEÇİLMEDEN, varsayılan false) ile çözüldü — bilet bu uçlarda
  kabul edilmiyor. Kod sunucu tarafında normalleştirilir (`trim().toUpperCase()`)
  ve normalleştirme SONRASI `roomCodeSchema`'ya karşı doğrulanır; alfabe dışı
  karakter/yanlış uzunluk 400 INVALID_CODE. `createRoom`'un 5 denemede
  çakışma sonucu (`{ ok:false, code:'CODE_GENERATION_FAILED' }`) 503'e,
  beklenmeyen bir `ok:false` kodu (savunmacı dal) 500 SERVER_ERROR'a eşlendi;
  hiçbir sürücü hata mesajı istemciye sızmıyor (`console.error` + sabit kod).

  Testler `apps/auth/register`/`ws/ticket` kalıbını izliyor: yalnız `@/auth`nin
  `auth()`'u ve `@xox/db`'nin `createRoom`/`Room.findOne` çağrıları mock'landı;
  `resolveIdentity`, `verifyToken`, `signToken` GERÇEK kodla çalıştı — böylece
  çerez VE Bearer'ın AYNI userId'ye çözüldüğü (AC2) ve `createRoom`'a giden
  argümanın gerçek `resolveIdentity` çıktısından geldiği fiilen kanıtlandı
  (bağımlılığı tamamen mock'layıp kendi mock'unu doğrulama tuzağına düşülmedi).
  `packages/db/src/rooms/create.test.ts` (DB-002'de merge edilmiş, dokunulmadı)
  zaten gerçek `xox_test`e karşı 5 deneme çakışma sondasını koşturuyor; bu
  görevde route seviyesinde `createRoom`'un döndürdüğü `CODE_GENERATION_FAILED`
  sonucunun 503'e doğru eşlendiği ayrıca doğrulandı (route testi @xox/db'yi
  mock'ladığı için gerçek Atlas çakışmasını BURADA tekrar üretmiyor — o kanıt
  zaten create.test.ts'te).

  `pnpm --filter @xox/web test` (150/150 yeşil, yeni 13 test dahil),
  `pnpm --filter @xox/web typecheck` ve `pnpm lint apps/web packages/db`
  (root'tan `eslint .` olarak koşuyor, tüm repo dahil) temiz. `prettier --write`
  ile biçimlendirme uygulandı, `prettier --check` yeşil.

files_changed:
  - apps/web/app/api/rooms/route.ts # YENİ — POST, 49 satır
  - apps/web/app/api/rooms/route.test.ts # YENİ — 6 test
  - apps/web/app/api/rooms/[code]/route.ts # YENİ — GET, 51 satır
  - apps/web/app/api/rooms/[code]/route.test.ts # YENİ — 7 test

acceptance:
  AC1_created_seat_X: >
    "AC1/AC2: Auth.js çerezi ile 201 + { code } döner" testi createRoom'a
    { userId, name } geçirildiğini ve yanıtın { code:'ABC234' } olduğunu
    doğruluyor; createRoom'un kendisi (packages/db, dokunulmadı) X koltuğuna
    oturtmayı zaten garanti ediyor (create.test.ts: "waiting durumunda X
    koltuklu ... oda oluşturur").
  AC2_identity_parity: >
    Aynı route testinde hem çerez (auth() mock → { id:'cerez-kullanici' })
    hem gerçek imzalı Bearer token (@/lib/auth/tokens signToken ile üretilen
    GERÇEK JWT) ile çağrılıp createRoom'a giden userId'nin ayrıştığı
    doğrulandı — resolveIdentity mock'lanmadığı için bu gerçek bir kanıt.
    Kimliksiz istek 401 UNAUTHENTICATED (createRoom hiç çağrılmıyor).
  AC3_code_generation_failed: >
    "AC3: createRoom 5 denemede de çakışırsa ... 503 CODE_GENERATION_FAILED
    döner" — mockCreateRoom { ok:false, code:'CODE_GENERATION_FAILED' } dönünce
    route 503 + aynı kod + sabit mesaj döndü. Alttaki 5-deneme sondası
    packages/db/src/rooms/create.test.ts'te zaten var (bu görevin çakışma
    kümesi dışı, DB-002'de merge edildi) ve dokunulmadı.
  AC4_get_room_shape: >
    GET testleri { code, state, seats, canJoin } birebir eşleşmesini
    (toStrictEqual) ve canJoin'in yalnız waiting+boş-koltuk'ta true olduğunu
    (roomStateResponseSchema'nın superRefine değişmeziyle uyumlu) doğruluyor.
    Var olmayan/silinmiş kod 404 ROOM_NOT_FOUND.
  AC5_normalization: >
    Gerçek test çıktısı — " abc234 " girdisiyle çağrılan GET, Room.findOne'ı
    TAM OLARAK { code: 'ABC234' } argümanıyla çağırdı (mockFindOne üzerinde
    toHaveBeenCalledWith ile doğrulandı) ve yanıt gövdesinde code:'ABC234'
    döndü. roomCodeSchema dışı karakter ('abc!23') ve yanlış uzunluk ('AB')
    400 INVALID_CODE verdi, Room.findOne hiç çağrılmadı.
  AC6_thin_routes: "route.ts 49 satır, [code]/route.ts 51 satır — ikisi de < 120."
  AC7_gates: "test/typecheck/lint üçü de temiz (aşağıdaki komutlar bölümüne bak)."

commands_run:
  - cmd: pnpm --filter @xox/web test
    result: "Test Files 16 passed (16) · Tests 150 passed (150)"
  - cmd: pnpm --filter @xox/web typecheck
    result: "tsc --noEmit -p tsconfig.json — hatasız"
  - cmd: pnpm lint apps/web packages/db
    result: "eslint . --max-warnings=0 apps/web packages/db — hatasız (repo genelini kapsıyor)"
  - cmd: pnpm exec prettier --check "apps/web/app/api/rooms/**/*.ts"
    result: "All matched files use Prettier code style!"

conflict_probe:
  note: >
    Bu görev @xox/db'ye DOKUNMADI (DB-002 zaten merge edilmişti); yalnız
    apps/web/app/api/rooms/route.ts ve apps/web/app/api/rooms/[code]/route.ts
    (+ testleri) yazıldı — çakışma kümesi tam olarak talimattaki gibi kaldı.
    WS-001/UI-SKEL-001'in dokunduğu apps/web/app/api/rooms/[code]/ws/**,
    lib/realtime/**, apps/web/app/**, components/** dizinlerine hiç girilmedi.

commits:
  - sha: 8f79651
    message: "feat(web): oda REST yüzeyi — POST /api/rooms ve GET /api/rooms/[code]"

follow_ups:
  - "GET /api/rooms/[code] kimliksiz erişime izin veriyor (tasarım §5.1'in "WS
    öncesi ön kontrol" / davet akışı amacına uygun); kart bunu açıkça
    zorunlu kılmıyordu ama bir sonraki incelemede bilinçli karar olarak
    teyit edilmeli."
```
