```yaml
task: CTR-BOARD-001
status: done
summary: >
  packages/shared protokolü tahta boyutu özelliği için TAM OLARAK BİR KEZ
  genişletildi (ADR-0015 tek pencere): cellIndexSchema 0..120, boardSchema
  9..121, yeni boardSizeSchema/winLengthSchema/boardConfigSchema, +1 hata
  kodu (INVALID_BOARD_CONFIG, 21 kod), roomCreateBodySchema, roomStateResponseSchema
  +size/+winLength, stateMessageSchema +size/+winLength/+lastMove,
  RoomClientState aynı üç alanla genişledi, message-keys.ts'e boardConfig(16)
  + game(4) + computer(3) anahtarı, testids.ts açıldı (+5 TESTID, +3 DATA_ATTR,
  ADR-0016), canJoinRoom(state, seats) CTR-003 payı olarak shared'a çıktı.
  İki tüketici sondası (state 14 alan, roomStateResponse 6 alan) tasarımın
  §3.2 tablosundan ELLE kopyalandı ve mutasyonla doğrulandı (aşağıda).
files_changed:
  - packages/shared/src/primitives.ts
  - packages/shared/src/primitives.test.ts
  - packages/shared/src/errors.ts
  - packages/shared/src/errors.test.ts
  - packages/shared/src/game-status.test.ts
  - packages/shared/src/rest-contract.ts
  - packages/shared/src/rest-contract.test.ts
  - packages/shared/src/ws-protocol.ts
  - packages/shared/src/ws-protocol.test.ts
  - packages/shared/src/ws-client.test.ts
  - packages/shared/src/room-client.ts
  - packages/shared/src/room-client.test.ts
  - packages/shared/src/message-keys.ts
  - packages/shared/src/message-keys.test.ts
  - packages/shared/src/testids.ts
  - packages/shared/src/testids.test.ts
  - apps/web/messages/tr.ts
  - apps/web/messages/tr.test.ts
  - apps/mobile/messages/tr.ts
tests:
  added: 39
  passing: 389
  coverage: '100% (statements/branches/functions/lines)'
  mutation: 'çalıştırılmadı — packages/shared mutasyon eşiği yok (yalnız game-core için zorunlu); iki tüketici sondası ELLE mutasyonla (kod düzenleme + diff -q + revert) doğrulandı, aşağıda'
decisions:
  - karar: 'roomCreateBodySchema = boardConfigSchema.partial(), ham `undefined`ı KABUL ETMEZ'
    gerekçe: >
      Tasarım "gövde tamamen yok da olabilir" derken req.json()'ın patlamasını
      kastediyor — bu route'un (API-BOARD-001) sorumluluğu, şemanın değil.
      Şema yalnız NESNEYİ doğrular; route `{}`'e düşürüp şemadan geçirir.
    reddedilen_alternatif: 'Şemayı .optional() yapıp undefined'ı da kabul ettirmek — sorumluluğu bulanıklaştırır, "gövde var ama boş" ile "gövde hiç yok" ayrımını şemaya taşır.'
  - karar: 'Yer tutucu adları camelCase DEĞİL, küçük harf (baslangicsatir, bitissutun...)'
    gerekçe: >
      apps/web/messages/tr.test.ts'teki YER_TUTUCU regex'i (/\{[a-zçğıöşü]+\}/gu)
      yalnız küçük Türkçe harfleri eşler. Spec metninde camelCase örnek
      (`{baslangicSatir}`) verilmiş olsa da, o hâliyle regex'ten kaçar ve
      sonda o alanı hiç denetlemez — kodun kendi doğrulama sözleşmesine uyum
      metnin görünümünden önceliklidir.
    reddedilen_alternatif: 'camelCase aynen kullanmak — sessizce doğrulanmayan bir yer tutucu üretirdi (gotcha örüntü 2 ile aynı sınıf: kendi kontrolünü atlayan biçim).'
  - karar: 'canJoinRoom rest-contract.ts içinde, roomStateResponseSchema.superRefine ONU çağıracak şekilde REFACTOR edildi (iki kopya değil, tek kaynak)'
    gerekçe: 'CTR-003 borcunun kökü tam bu ikilikti: mantık hem şemanın superRefine''ında hem route''ta ayrı ayrı yazılmıştı. Şimdi ikisi de (route CTR-003''te) aynı fonksiyonu çağıracak.'
    reddedilen_alternatif: 'Ayrı bir dosya (canjoin.ts) açmak — rest-contract.ts zaten roomStateResponseSchema''nın tek sahibi, aynı dosyada durmak okunabilirliği artırıyor ve tek bir importla iki tüketici (test + gelecekteki route) besleniyor.'
gotchas:
  - "cellIndexSchema'nın üst sınırı 0..8'den 0..120'ye çıkınca game-status.test.ts'teki 'winLineSchema 9'u reddeder' testi artık YANLIŞ hale geliyordu (9 artık 11×11'de geçerli bir indeks) — testi SİLMEK yerine anlamını tersine çevirip çıplak yeni sınırı (121) iddia eden bir test yazdım. Aynı sınıf gelecekte tekrar oluşabilir: bir sınır genişlediğinde 'eskiden geçersizdi' testleri kör kör silinmemeli, YENİ sınıra göre yeniden ifade edilmeli."
  - "roomStateResponseSchema/stateMessageSchema'ya yeni zorunlu alan eklemek apps/web'in MEVCUT 3×3 üretim kodunu (lib/game/room-view.ts, lib/client/use-room.test.tsx) typecheck'te KIRAR — bu ADR-0015'in bilinen, kabul edilmiş sonucu (tek pencere sonra donar, tüketiciler B3/B4'te güncellenir). DB-BOARD-001/API-BOARD-001 merge olana kadar `pnpm gates` (tüm monorepo) KIRMIZI kalacak; bu benim kartımın hatası değil, bölümlemenin bilinen zayıf noktası (ADR-0015 §10.5 madde 1)."
  - "git worktree kurulduktan hemen sonra ilk birkaç Edit çağrısı yanlışlıkla ANA CHECKOUT'a gitti (pwd doğrulaması atlanmıştı, worktree yeni açılmışken absolute path'ler main'e işaret ediyordu). git diff ile patch çıkarıp ana checkout'u git checkout -- ile temizleyip patch'i worktree'ye git apply ile taşıdım. Ders: worktree açtıktan SONRAKİ İLK Read/Edit çağrısını pwd çıktısıyla çapraz doğrula, ilk dosya yazımından ÖNCE değil."
blocked_reason: null
next_suggestions:
  - "DB-BOARD-001 ve API-BOARD-001 mümkün olan en kısa sürede dispatch edilmeli: apps/web şu an typecheck'te KIRIK (lib/game/room-view.ts, lib/client/use-room.test.tsx — size/winLength/lastMove eksik). 'main her dalgada yayınlanabilir' ilkesi bu iki kart merge olana kadar teknik olarak ihlal ediliyor; pencere olabildiğince hızlı kapanmalı."
  - "İntegratör merge sonrası `pnpm exec turbo run typecheck --force` çalıştırdığında apps/web hatasını GÖRMEZDEN GELMEMELİ — bu beklenen ama izlenmesi gereken bir borç, board.json'da DB-BOARD-001/API-BOARD-001'in 'main kırık' uyarısıyla işaretlenmesini öneririm."
  - "CTR-003 kartı artık yalnız route bağlaması: apps/web/app/api/rooms/[code]/route.ts'teki satır içi `room.state === 'waiting' && bosKoltukVar` ifadesi `canJoinRoom(room.state, room.seats)` çağrısıyla değiştirilmeli (muhtemelen API-BOARD-001 ile aynı kartta, zaten aynı dosyaya dokunuyor)."
```
