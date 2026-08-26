```yaml
task: AUTH-002
status: done
summary: >
  KK-005'in "yanlış parolayla girişte HTTP 401" şartı SPEC değil KOD tarafında
  düzeltildi. Ön karar (spec'i değiştir) REDDEDİLDİ — ölçüm bunun gereksiz
  olduğunu gösterdi: `@auth/core@0.41.3` gerçekten durum kodunu 200'e
  sabitliyor (bu Auth.js'in kasıtlı `X-Auth-Return-Redirect` sözleşmesi,
  bir kusur değil), AMA bu sarmalayıcı zaten SEC-002 için `hasSessionCookie`
  ile başarı/başarısızlığı gövdeden/durum kodundan BAĞIMSIZ ayırt ediyordu.
  Aynı sinyali kullanıp yalnız BAŞARISIZ dalda `Response`'u durum kodu 401
  ile yeniden kurmak, `lib/auth/**`/`auth.ts`e (donuk katman) HİÇ
  DOKUNMADAN, `route.ts`in kendi çakışma kümesinde (`apps/web/app/api/
  auth/[...nextauth]/route.ts`) yeterliydi.

olcum_1_signin_401_deneyi:
  soru: 'next-auth istemcisinin signIn(...,{redirect:false}) çağrısı 401 alırsa NE OLUR?'
  yontem: >
    `next-auth@5.0.0-beta.32`'nin gerçek `node_modules` kaynağı okundu
    (`react.js`, `signIn()` fonksiyonu, satır ~152-185) — mock/varsayım
    DEĞİL, kurulu paketin kendi kodu.
  bulgu: >
    `signIn()` şu sırayla çalışıyor: (1) `fetch()` her zaman `POST` +
    `X-Auth-Return-Redirect: 1` başlığıyla gider, (2) `const data = await
    res.json()` — DURUM KODUNA BAKMADAN gövdeyi ayrıştırır (fetch zaten
    non-2xx'te reddetmiyor, yalnız ağ hatasında reddeder), (3) `const error =
    new URL(data.url).searchParams.get('error')` — hata `data.url`deki
    query param'dan çıkarılır, `res.status`tan DEĞİL, (4) `if (res.ok) {
    await __NEXTAUTH._getSession(...) }` — YALNIZ bu adım `res.status`a
    bakıyor, (5) dönüş: `{error, code, status: res.status, ok: res.ok,
    url: error ? null : data.url}`.
  sonuc: >
    Durum kodunu 401'e çevirmek `signIn()`'i KIRMIYOR. `res.json()` gövde
    değişmediği sürece sorunsuz ayrıştırır; hata her zaman `data.url`den
    çıkarılıyor. TEK etki: `res.ok` artık `false` olduğu için adım (4)
    (`_getSession()`) çalışmıyor — bu bir REGRESYON değil, bir DÜZELTME:
    şu anki (200-sabit) davranışta bile BAŞARISIZ girişte `res.ok` zaten
    `true` (200 olduğu için), yani `_getSession()` başarısız girişte de
    gereksiz yere tetikleniyordu; 401'e geçince bu gereksiz ağ çağrısı
    artık BAŞARISIZ girişte hiç yapılmıyor.
  ek_dogrulama: >
    `GirisForm.tsx`in kendi mantığı (`result.error !== undefined` kontrolü)
    durum koduna hiç bakmıyor, yalnız `signIn()`'in döndürdüğü `error`
    alanına bakıyor — bu alan adım (3)'ten geliyor, durum kodundan bağımsız.
    `GirisForm.test.tsx` zaten `signIn()`'in KENDİSİNİ mock'luyor (fetch'i
    değil), bu yüzden bu değişiklik o testleri hiç etkilemiyor (ayrıca
    çalıştırılıp doğrulandı — bkz. test_kaniti).
  kok_neden: >
    `@auth/core@0.41.3` (`src/index.ts` ~172. satır) `X-Auth-Return-Redirect`
    başlığı geldiğinde `return Response.json({ url }, { headers:
    response.headers })` yapıyor — `Response.json()` durum belirtilmezse
    HER ZAMAN 200 varsayılan kullanır, orijinal yönlendirme (302/303)
    durumu KAYBOLUYOR. Bu, başarı/başarısızlık FARK ETMEKSİZİN gerçekleşen
    KASITLI bir davranış (next-auth'un kendi TODO yorumu: "Return error if
    redirect:false" — bilinen, henüz iyileştirilmemiş bir kütüphane
    tasarımı, framework hatası değil).

olcum_2_hiz_sinirlayici_etkisi:
  soru: "SEC-002'nin credential-request.ts'teki set-cookie tabanlı tespiti kırılıyor mu?"
  bulgu: >
    HAYIR. `hasSessionCookie(response)` çağrısı `authPOST()`in ORİJİNAL
    yanıtı üzerinde, durum kodu değişiminden ÖNCE yapılıyor — kilit sayacı
    (`recordLoginSuccess`/`recordLoginFailure`) hâlâ aynı orijinal yanıtın
    `set-cookie` başlığına bakıyor, yeni 401 dönüşümünden TAMAMEN bağımsız.
  test_kaniti: >
    `route.test.ts`teki TÜM mevcut kilit/hız-sınırı testleri (429 kısa
    devre, kilit mesajı ayrım-yapmama, HIGH-2 e-posta+IP birlikte kayıt,
    HIGH-1 bölünmüş çerez, BLOCKER-1 parametre kirliliği×2, BLOCKER-2
    tutarlı IP) değişiklik sonrası TEKRAR koşuldu — 580/580 yeşil, hiçbiri
    kırılmadı.

olcum_3_guvenlik_degerlendirmesi:
  soru: '200→401 geçişi kullanıcı numaralandırmaya ya da başka bir açığa yol açıyor mu?'
  sonuc: 'HAYIR.'
  gerekce: >
    (a) Mesaj/kod hâlâ `authorize()`ın kendisinden geliyor — bu değişiklik
    `authorize()`a dokunmuyor, `verifyFakePassword` sabit-zamanlı savunması
    (AUTH-001, KK-005 sabit-zamanlı ölçümü) AYNEN duruyor. (b) 401 durum
    kodu var-olan/var-olmayan hesap arasında AYIRT ETMİYOR — HER başarısız
    kimlik doğrulama denemesi (yanlış parola, kayıtsız e-posta, malformed
    istek) aynı şekilde 401 alıyor; bu aslında STANDART HTTP semantiğine
    (401 = kimlik doğrulama başarısız) daha yakın, önceki 200 istisnası
    daha "sızdıran" değildi ama daha az standarttı. (c) Kilit sayacı
    (rate-limit) davranışı değişmedi (bkz. ölçüm 2) — zamanlama yan kanalı
    yeni açılmadı.

secilen_yol: "A' (ölçülmüş): SPEC DEĞİL, kod düzeltildi — ama lead'in önerdiği 'spec'i değiştir' yolunun TAM TERSİ"
gerekce: >
  Lead'in ön kararı "401 zorlamak signIn'i kırar, o yüzden spec'i düzelt"
  varsayımına dayanıyordu. Ölçüm bu varsayımı YANLIŞLADI: `signIn()`
  kaynağı okununca 401'in HİÇBİR ŞEYİ kırmadığı görüldü — yalnız gereksiz
  bir `_getSession()` çağrısını (daha doğru şekilde) engelliyor. `route.ts`
  zaten `hasSessionCookie` ile başarı/başarısızlığı hesaplıyordu (SEC-002);
  bu bilgiyi durum koduna da yansıtmak `lib/auth/**`/`auth.ts`e dokunmadan,
  tek dosyada (`route.ts`), ~25 satırlık bir yorum+kod bloğuyla mümkündü.
  KK-005'in "401 döner" şartı DOĞRU bir beklentiydi; Auth.js'in
  X-Auth-Return-Redirect kısayolu bunu gizliyordu, framework'ün istemci
  DAVRANIŞINI kırmadan (istemci zaten durum koduna bakmıyor) gövdeyi
  değiştirmeden yalnız durum kodunu düzeltmek "framework'le güreşmek"
  değil, framework'ün ZATEN durum kodundan bağımsız çalışan istemcisiyle
  UYUMLU bir düzeltme.
reddedilen_alternatif: >
  KK-005'i "401 yerine hata kodu/mesajının ulaşması yeterli" şeklinde
  yumuşatmak (lead'in B/A önerisi). Reddedildi çünkü (1) ölçüm 401'in
  maliyetsiz olduğunu gösterdi — spec'i zayıflatmaya gerek yoktu, (2) kart
  metni (KK-005, `[E2E]` etiketli) HTTP durumunu açıkça test edilebilir bir
  sözleşme olarak tanımlıyor; bunu gevşetmek gelecekte başka istemcilerin
  (mobil, curl tabanlı entegrasyon testleri, üçüncü taraf) durum koduna
  güvenebilme hakkını kısıtlardı — 401 daha genel/daha az kırılgan bir
  sözleşme.

degisiklikler:
  - dosya: 'apps/web/app/api/auth/[...nextauth]/route.ts'
    ne: >
      `authPOST(forwardedRequest)`in dönüşü artık `hasSessionCookie` ile
      `authenticated` olarak değerlendiriliyor (aynı hesap zaten vardı,
      isim verildi). `authenticated` `true` ise orijinal `response` AYNEN
      dönüyor (davranış DEĞİŞMEDİ). `authenticated` `false` ise
      `new Response(response.body, { status: 401, headers: response.headers
      })` ile YENİ bir Response kuruluyor — gövde ve başlıklar (dolayısıyla
      `data.url`, `error`, `code`) BİREBİR korunuyor, yalnız durum kodu
      401. Dönüşüm SADECE `/callback/credentials` dalında, `authorize()`ın
      kendisine veya diğer NextAuth eylemlerine dokunmadan uygulanıyor.
  - dosya: 'apps/web/app/api/auth/[...nextauth]/route.test.ts'
    ne: >
      2 yeni test eklendi — (1) BAŞARISIZ girişte (`set-cookie` yok, mock
      200+error url) dönen `response.status === 401` VE gövdenin
      (`data.url`) DEĞİŞMEDİĞİ, (2) BAŞARILI girişte (`set-cookie` var,
      mock 200) durum kodunun/başlıkların DEĞİŞMEDEN aynen geçtiği.

test_kaniti:
  kirmizi: >
    Yeni testler önce mevcut (401 dönüşümü olmayan) `route.ts`e karşı
    yazılıp KIRMIZI olduğu doğrulandı (`expect(response.status).toBe(401)`
    → alınan 200), sonra `route.ts`e dönüşüm eklenip YEŞİLE döndü.
  yesil: '@xox/web: 56 test dosyası, 580/580 test yeşil (2 yeni test dahil).'
  coverage: "%94.95 ifade · %89.98 dal · %93.7 fonksiyon · %97.38 satır (worktree'de test:coverage koşusu)."
  typecheck: 'tsc --noEmit temiz.'
  lint: 'eslint apps/web packages/db --max-warnings=0 temiz.'
  format: "prettier temiz (pre-commit hook'ta bir format uyarısı çıktı, `pnpm format` ile düzeltilip yeniden commit edildi)."

e2e_002_icin_gerekli_degisiklik: >
  `feat/E2E-002` dalına DOKUNULMADI (talimat gereği) — ama şu değişmeli:
  `auth.spec.ts`teki KK-005 testi HTTP durumunu `401` BEKLEMELİ (spec
  metniyle birebir), şu an muhtemelen 200 bekliyordu ya da hiç
  kontrol etmiyordu (kırmızı kalma nedeni köke göre farklı olabilir —
  lead E2E-002'nin gerçek assertion'ını kontrol etmeli). Mesaj/kod
  assertion'ları (varsa) DEĞİŞMEMELİ, çünkü gövde/`error`/`code`
  aynı kaldı. Spec metninde (`docs/superpowers/specs/2026-08-24-xox-oyun-
  spec.md` KK-005) HERHANGİ BİR DEĞİŞİKLİK GEREKMİYOR — 401 beklentisi
  zaten doğruydu ve şimdi gerçek davranışla eşleşiyor.

commit_shas:
  - '6d6b052 fix(web): basarisiz kimlik dogrulamada HTTP 401 don (KK-005, AUTH-002) — feat/AUTH-002'

worktree: ".claude/worktrees/AUTH-002 (branch feat/AUTH-002, main'den ayrıldı, main'e merge/push YAPILMADI)"

not_islem: >
  Değişiklikler yanlışlıkla önce ana checkout'ta (main) yapıldı; fark
  edilince `git stash` ile main'den geri alınıp doğru worktree'ye
  (`feat/AUTH-002`) taşındı ve orada commit edildi. `main` şu an temiz
  (yalnız harness'in otomatik `docs/board/journal.ndjson` kaydı var, bu
  rapor onu değiştirmedi).

blocked_reason: null

next_suggestions:
  - >
    Lead: `feat/E2E-002` dalındaki `auth.spec.ts`in KK-005 testini gerçek
    401 beklentisiyle güncelle (varsa 200 bekleyen assertion'ı düzelt);
    spec metnine (KK-005) dokunmaya GEREK YOK, zaten doğruydu.
  - >
    İleri güvenlik notu (bu görevin kapsamı dışı, sadece gözlem): 401
    dönüşümü şu an `/callback/credentials`e giden HER başarısız denemede
    (yanlış parola, malformed istek, olası CSRF hatası) uygulanıyor —
    hepsi aynı KK-005 anlamıyla "kimlik doğrulama başarısız" sayılıyor.
    Eğer ileride CSRF/Configuration hatası gibi kimlik-doğrulama-dışı bir
    hata sınıfı ayrı bir durum koduna (ör. 400) ihtiyaç duyarsa, bu ayrım
    `internalResponse`in `error` tipine bakılarak `route.ts` içinde
    genişletilebilir — bugün böyle bir ayrım isteyen bir kart kriteri yok.
```
