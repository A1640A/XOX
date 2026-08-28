/**
 * REST yüzeyinin gövde ve yanıt şemaları (tasarım §7).
 *
 * Sunucu doğrulaması istemciden **bağımsızdır** (KK-003): tarayıcıdaki form
 * kısıtları yardımcıdır, kapı burasıdır. Her route handler gövdeyi bu
 * şemalardan geçirir ve hatayı `errorResponseSchema` biçiminde döner.
 *
 * **PERF-005:** Bu dosya artık yalnızca bir yeniden-dışa-verim toplayıcısıdır —
 * gerçek şema tanımları `./rest-contract/*` altında UÇ NOKTA BAŞINA ayrı
 * dosyalarda yaşar. Neden: `@xox/shared`'ın barrel'ı (`index.ts`)
 * `export *` ile bu dosyayı geçiyordu ve TEK bir modül olduğu için `/profil`
 * gibi yalnız `errorResponseSchema`+`profileResponseSchema`'ya ihtiyaç duyan
 * bir rota, `registerBodySchema`/`leaderboardResponseSchema`/`matchesResponseSchema`/
 * `friendsResponseSchema`/`mobileTokenPairSchema` gibi TAMAMEN alakasız 20'den
 * fazla şemayı da indiriyordu (485 zod izi, ölçüldü — bkz. `docs/board/reports/
 * PERF-004.md`). `package.json`'a eklenen `"sideEffects": false` bundler'a
 * KULLANILMAYAN modülleri tamamen düşürme izni veriyor ama bu yalnız MODÜL
 * GRANÜLERLİĞİNDE çalışıyor — aynı dosyadaki kullanılmayan komşu şemalar
 * düşürülmüyor (ölçüldü: `/giris` -70 kB, `/profil` yalnız -3 kB, çünkü
 * `/profil` hâlâ TEK `rest-contract.ts`'in TAMAMINI çekiyordu). Çözüm: her
 * uç noktanın şemasını kendi dosyasına taşımak, böylece bir tüketici yalnız
 * ihtiyacı olan uç noktanın modülünü (ve onun gerçek transitive
 * bağımlılıklarını) indirir.
 *
 * `@xox/shared`'ın kamuya açık yüzeyi (bu dosyanın dışa verdiği adlar)
 * BİREBİR AYNI kaldı — yalnızca iç dosya yapısı değişti. Kanıt:
 * `docs/board/reports/PERF-005.md` (öncesi/sonrası 103 ad karşılaştırması).
 */
export * from './rest-contract/display-name'
export * from './rest-contract/email'
export * from './rest-contract/error-response'
export * from './rest-contract/friends'
export * from './rest-contract/leaderboard'
export * from './rest-contract/matches'
export * from './rest-contract/mobile'
export * from './rest-contract/password'
export * from './rest-contract/profile-response'
export * from './rest-contract/profile-update'
export * from './rest-contract/register'
export * from './rest-contract/rooms'
export * from './rest-contract/stats'
export * from './rest-contract/theme'
export * from './rest-contract/ws-ticket'
