# ADR-0005 — Mobil auth köprüsü: tarayıcı akışı → deep link → döndürmeli JWT

- **Tarih:** 2026-08-24 · **Görev:** ARCH-001 · **Durum:** kabul edildi
- **İlgili:** spec §0 (yer gerçeği), AS-09 · KK-009, KK-010, US-P0-04

## Bağlam

Mobil uygulamanın web ile **aynı hesabı** kullanması gerekiyor. Web tarafı Auth.js v5 +
Credentials + JWT session çerezi kullanıyor. Çerez, `xox://` şemasıyla açılan bir React Native
uygulamasına taşınamaz.

Yer gerçeği ve spec bir akış sabitlemiş:
`expo-auth-session` → `/api/auth/mobile/*` → kısa ömürlü JWT → `expo-secure-store`.
KK-009 bunu ölçülebilir kılıyor: "geçerli akış sonunda `xox://auth?token=…&refresh=…` deep
link'ine yönlendirir; access token'ın `exp` ≤ 15 dakika, refresh token'ınki ≤ 30 gündür."

KK-010 ise ikinci bir kısıt koyuyor: `Authorization: Bearer <mobil-access-token>` ile gelen
REST isteği **ve WS upgrade'i**, web çerez oturumuyla **aynı** `userId`'ye çözülmeli.

AS-09: mobilde ayrı kayıt formu yazılmayacak; kayıt da aynı tarayıcı köprüsünden geçecek.

## Karar

### Akış — üç uç nokta, her birinin tek işi

```
GET /api/auth/mobile/authorize?state=<rastgele>
    oturum yok  → 307 /giris?donus=<authorize URL'inin kendisi>
    oturum var  → 307 /api/auth/mobile/callback?state=<state>

GET /api/auth/mobile/callback?state=<state>
    auth() → userId
    access  = JWT { sub, aud:'xox-mobile', typ:'access',  exp: +15 dk }
    refresh = JWT { sub, aud:'xox-mobile', typ:'refresh', exp: +30 gün, jti }
    jti → mobileRefreshTokens koleksiyonuna yazılır (TTL indeksli)
    → 307 xox://auth?token=<access>&refresh=<refresh>&state=<state>

POST /api/auth/mobile/refresh  { refresh }
    jti kayıtlı mı? → değilse 401 (yeniden kullanım tespiti)
    eski jti SİLİNİR, yeni çift üretilir ve yeni jti yazılır  (döndürmeli refresh)
```

Kayıt da aynı köprüden geçer: `/giris` sayfasındaki "Kayıt ol" bağlantısı `?donus=` parametresini
koruduğu için kullanıcı `/kayit`'ta hesabı açar, oturum açılır ve akış `authorize`'a geri döner
(AS-09'un varsaydığı davranış, ek kod gerektirmez).

### Token disiplini

- İmza: `jose`, HS256, anahtar `AUTH_SECRET`'ten türetilir.
- `aud: 'xox-mobile'` claim'i mobil token'ları web oturum JWT'sinden **ayırır**: birinin diğeri
  yerine kabul edilmesi imkânsızdır.
- `typ: 'access' | 'refresh'` — access token'la refresh çağrısı yapılamaz, tersi de.
- Refresh **döndürmelidir** (rotating): her kullanımda eski `jti` silinir. Silinmiş bir `jti`
  ile gelen istek 401 alır → çalınmış refresh'in yeniden kullanımı tespit edilir.
- `mobileRefreshTokens` TTL indeksi (`expiresAt`, `expireAfterSeconds: 0`) koleksiyonu
  kendiliğinden temizler.

### Tek kimlik çözücü

`apps/web/lib/auth/identity.ts` → `resolveIdentity(req)`, sıra:

1. `Authorization: Bearer` (aud `xox-mobile`, typ `access`)
2. Auth.js oturum çerezi
3. `?ticket=` (yalnız WS upgrade'inde — ADR-0006)

Üçü de aynı `{ userId, name }` sonucuna çözülür. KK-010'un birim testi tam olarak budur:
aynı kullanıcı için üç yoldan gelen üç istek, tek `userId`.

## Gerekçe

- **Tarayıcı köprüsü, gömülü WebView değil.** `expo-auth-session` sistem tarayıcısını
  (`ASWebAuthenticationSession` / Custom Tabs) kullanır; parola uygulamanın kendi JS'inden
  hiç geçmez ve web ile aynı oturum çerezi paylaşılır.
- **İki uç nokta ayrılığı** (`authorize` / `callback`) KK-009'un harfini karşılar ve her uç
  noktanın tek sorumluluğu olur: `authorize` "oturum var mı?" sorusunu çözer, `callback`
  token basar. Tek uç nokta olsaydı, giriş yönlendirmesinden dönüşte "bu istek zaten
  token bastı mı?" durumu takip edilmek zorunda kalırdı.
- **`aud` ayrımı** en ucuz ve en etkili izolasyon: aynı `AUTH_SECRET` kullanılsa bile
  web oturum JWT'si mobil uçlarda, mobil access token'ı web oturumu olarak kabul edilemez.
- **Döndürmeli refresh**, deep link'te token taşımanın ana riskini (bkz. Sonuçlar) somut
  biçimde azaltır: çalınan bir refresh, meşru kullanıcı bir kez yenilediği anda ölür ve
  hırsızın kullanımı tespit edilir.
- **Tek çözücü fonksiyon**, KK-010'u "üç yolun aynı sonucu vermesi" olarak tek bir testte
  kilitler. Üç ayrı yerde kimlik çözülseydi, biri güncellenmeyince sessizce ayrışırdı.

## Reddedilen alternatifler

| Alternatif                                                                | Neden reddedildi                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PKCE + kod değişimi** (deep link'te `code`, token ayrı POST ile alınır) | Güvenlik açısından **kesinlikle daha iyi**: token hiç URL'e girmez. Ama KK-009 açıkça `xox://auth?token=…&refresh=…` yönlendirmesini şart koşuyor ve dördüncü bir uç nokta + istemci tarafı S256 üretimi gerektiriyor. Yükseltme yolu olarak **açık bırakıldı** (bkz. Sonuçlar) |
| **Mobilde yerel parola formu + doğrudan `POST /api/auth/mobile/login`**   | Parola girişi ve doğrulaması iki yerde; iki ayrı hız sınırı, iki ayrı hata yüzeyi, iki ayrı zamanlama saldırısı yüzeyi. AS-09 da bunu reddetmiş                                                                                                                                 |
| **Çerezi mobile taşımak** (WebView'dan cookie okuma)                      | Gömülü WebView + çerez okuma; parola uygulamanın JS bağlamına girer, mağaza politikalarıyla sorunlu, `xox://` şemasında çerez yok                                                                                                                                               |
| **Auth.js'in kendi `session` uç noktasını mobile açmak**                  | Auth.js oturum çerezi `httpOnly`; Bearer akışı yok. Ayrıca web oturum ömrü mobil için uygun değil                                                                                                                                                                               |
| **Kalıcı (süresiz) mobil token**                                          | Çalınırsa iptal edilemez; KK-009'un ≤ 15 dk / ≤ 30 gün sınırlarını ihlal eder                                                                                                                                                                                                   |
| **Döndürmesiz refresh** (aynı refresh sonsuza dek geçerli)                | Yeniden kullanım tespiti imkânsız; çalınan token 30 gün yaşar                                                                                                                                                                                                                   |
| **`aud` ayrımı yerine ayrı `MOBILE_JWT_SECRET`**                          | İkinci bir secret = ikinci bir dönüş prosedürü ve `.env` senkronizasyon yükü. `aud` claim'i aynı izolasyonu sıfır operasyonel maliyetle verir                                                                                                                                   |

## Sonuçlar

- ✅ KK-009 ve KK-010 doğrudan karşılanır; ikisi de birim testtir (E2E gerektirmez).
- ✅ Mobil kayıt için ayrı kod yazılmaz (AS-09).
- ✅ Web ve mobil tek kullanıcı tablosunu paylaşır; hesap birleştirme sorunu yok.
- ⚠️ **Kabul edilen risk:** `xox://` özel şeması Android'de başka bir uygulama tarafından
  kaydedilebilir (scheme hijacking). Deep link'teki token o uygulamaya düşer. Azaltıcılar:
  `state` bağlama (uygulama beklemediği bir `state` ile gelen yönlendirmeyi reddeder),
  15 dakikalık access ömrü, döndürmeli refresh. **Yükseltme yolu:** PKCE + kod değişimi;
  `authorize`'a `code_challenge` eklemek ve `callback`'i token yerine `code` döndürecek şekilde
  değiştirmek yeterlidir. Bu ADR'ın yeniden değerlendirme tetikleyicisi: uygulama mağazaya
  çıkacaksa PKCE'ye geçilir.
- ⚠️ `AUTH_SECRET` artık iki iş yapıyor (web oturumu + mobil token'lar). Döndürülürse
  **tüm mobil oturumlar** düşer. Operasyonel not olarak `.env.example`'a yazıldı.
- ⚠️ Mobil WS bağlantısı `Authorization` başlığı gönderemiyor olabilir (`react-native-web`
  hedefinde tarayıcı `WebSocket` API'si başlık desteklemez). Bu ADR-0006'nın (WS bileti)
  varlık sebebidir.
- 📌 Bu iş **Dalga 2**'dedir (`W2-03`). P0 yalnız web akışını gerektirir; mobil auth köprüsü
  P0 yürüyen iskeletini bloklamaz.
