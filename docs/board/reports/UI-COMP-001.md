# UI-COMP-001 — bilgisayar ekranı: boyut/K seçimi, gecikme tabanı, dürüst "Zor" etiketi

**Durum:** Tamamlandı. `pnpm gates` yeşil, `size-limit` yeşil, merge/push YAPILMADI.

**Worktree:** `.claude/worktrees/UI-COMP-001` · **branch:** `feat/UI-COMP-001`
**Commit:** `a528f1f` — `feat(web): bilgisayar ekranına boyut/K seçimi, gecikme tabanı kanıtı ve dürüst Zor etiketi`

## Çakışma kümesi (dokunulan dosyalar)

Yalnız `apps/web/components/computer/**` — `app/oyna/bilgisayar/page.tsx`'e dokunmaya
gerek kalmadı (ince RSC teli zaten `ComputerGameScreen`e delege ediyordu).

```
M  apps/web/components/computer/ComputerGameInner.tsx
M  apps/web/components/computer/ComputerGameScreen.test.tsx
M  apps/web/components/computer/DifficultyPicker.tsx
A  apps/web/components/computer/DifficultyPicker.test.tsx
M  apps/web/components/computer/game-engine.test.ts
M  apps/web/components/computer/game-engine.ts
M  apps/web/components/computer/status-text.ts
A  apps/web/components/computer/status-text.test.ts
M  apps/web/components/computer/use-computer-game.ts
```

`apps/web/components/board-config/**`, `apps/web/lib/game/enabled-sizes.ts`,
`apps/web/app/api/**`, `next.config.ts`, `apps/web/components/home/**`,
`apps/web/components/board/**`, `packages/**` — HİÇBİRİNE dokunulmadı.

## İş 1 — Boyut/K seçimi, oda akışından bağımsız

**`BoardConfigPicker` YENİDEN KULLANILDI, ikinci bir seçici YAZILMADI.**
`ComputerGameInner.tsx` onu doğrudan import eder (`@/components/board-config/BoardConfigPicker`),
`enabledSizes` BİLİNÇLİ OLARAK geçirilmez (bileşenin kendi varsayılanı: `BOARD_MODES`'un
TAMAMI — kill switch yalnız `POST /api/rooms`'u etkiler, bu ekran oda kurmaz).

```tsx
<BoardConfigPicker value={config} onChange={setConfig} />
```

Konfigürasyon `use-computer-game.ts`'te AYRI bir `useState` DEĞİL,
`ComputerGameState.config` alanı olarak taşınır (`game-engine.ts`) — her hamle/kazanan
hesaplaması (`applyHumanMove`, `applyComputerMove`, `evaluateStatus`, `chooseMove`)
`state.config`'i okur, "hangi kurala göre değerlendiriliyor" sorusu tek kaynaktan
cevaplanır.

**Sunucuya istek gitmediğinin kanıtı — iki katman:**

1. Statik: `network-graph.test.ts` (önceden var, dokunulmadı) `ComputerGameInner`'a
   giden TÜM modül grafiğini tarar; `fetch`/`WebSocket`/`XHR`/`sendBeacon` deseni ARANIR,
   `@xox/db`/`use-room` içe aktarımı YASAKTIR. `BoardConfigPicker` bu grafiğe eklendi ve
   test hâlâ yeşil (bareSpecifiers allowlist'i genişletmeye GEREK KALMADI: yalnız
   `@xox/game-core`, `@xox/shared`, birinci-parti — hepsi zaten izinliydi).
2. Çalışma zamanı: yeni testte `fetch` global olarak `vi.fn()` ile STUB'lanıp boyut/K
   seçimi + hücre tıklaması yapıldı, `fetch`'in HİÇ çağrılmadığı doğrulandı
   (`ComputerGameScreen.test.tsx` → `"KK-B42: ... hiçbir seçim sunucuya istek göndermez"`).

**"Büyükten küçüğe" en kırılgan vaka test edildi:** 11×11 → 3×3 geçişinde `console.error`
ÇAĞRILMADI (Board'un KK-B57 hata yolu tetiklenmedi), yeni tahta doğru hücre sayısıyla
(9) BAŞTAN kuruldu. `Board.tsx`'in kendisi (UI-BOARD-001 ürünü, `safeFocusIndex`) hiç
DEĞİŞTİRİLMEDİ — yalnız doğru şekilde yeniden kullanıldı.

Boyut/K değişimi KK-026 ("Yeniden oyna") ile AYNI disiplini izler: yeni konfigürasyonla
SIFIRDAN bir oyun başlar, seçili ZORLUK korunur; ZATEN AKTİF konfigürasyona tekrar
tıklamak süren oyunu SİLMEZ (erken dönüş, `setDifficulty`in simetriği). "Reset yarışı"
durumu da (boyut değişiminden HEMEN önce kurulan bilgisayar zamanlayıcısı) test edildi:
`state`in kendisi değiştiği için `useEffect`in `[state, difficulty]` bağımlılığı eski
zamanlayıcıyı temizler, yeni (küçük) tahtaya YAZILMAZ.

## İş 2 — Gecikme tabanı (ölçülmüş, uydurulmamış)

**Yeni bir sayı İCAT EDİLMEDİ.** Mevcut `COMPUTER_MOVE_DELAY_MS` (`@xox/shared`,
`packages/shared/src/constants.ts:78`) zaten **400 ms** ve zaten ölçülmüş/test edilmiş:

```ts
// packages/shared/src/constants.test.ts
it('COMPUTER_MOVE_DELAY_MS 400 — KK-023 1000 ms üst sınırının altında', () => {
  expect(COMPUTER_MOVE_DELAY_MS).toBe(400)
  expect(COMPUTER_MOVE_DELAY_MS).toBeLessThanOrEqual(1000)
})
```

`use-computer-game.ts`'teki mekanizma (dokunulmadı, YALNIZ doğrulandı) bu tabanı YAPISAL
olarak garanti eder — `chooseMove`dan (hesaplamadan) ÖNCE `setTimeout(..., COMPUTER_MOVE_DELAY_MS)`
kurulur:

```ts
const timer = setTimeout(() => {
  setState((current) => applyComputerMove(current, difficulty))
}, COMPUTER_MOVE_DELAY_MS)
```

Yani görünür gecikme HER ZAMAN `COMPUTER_MOVE_DELAY_MS + hesaplama süresi`dir —
CORE-AI-002'nin 3×3 açılışı 1230 ms'den 48 ms'ye indirmesi ya da CORE-AI-001'in
kazanan/bloklayan hamleyi 0 düğümle bulması bu tabanı ASLA delemez, çünkü zamanlayıcı
hesaplamadan BAĞIMSIZ olarak zaten kurulmuştur.

**Kanıt (yeni test, `ComputerGameScreen.test.tsx`):** 11×11 tahtada `easy` zorlukla (arama
tetiklenmeden, taban iddiası zorluktan bağımsız olduğu için) insan hamlesinden HEMEN sonra
yalnız 1 dolu hücre (insanınki) olduğu, `COMPUTER_MOVE_DELAY_MS` ilerletildikten SONRA 2
dolu hücre (insan + bilgisayar) olduğu doğrulandı — taban N > 3'te de KORUNUYOR.

`game-engine.ts`/`use-computer-game.ts` bu mekanizmaya dokunmadı; yalnız `chooseMove`a
`{ config: state.config }` geçirildi ki `size === 3` tam ağaç aramasına (`bestMove`),
`size > 3` bütçeli aramaya (`searchMove`, ADR-0013 §2-§4) doğru yönlensin — karar TAMAMEN
`@xox/game-core`da.

Ek dürüstlük: bilgisayarın sırasında gösterilen durum metni de boyuta göre ayrıştırıldı
(`status-text.ts`): `size === 3` → `tr.computer.thinking`, `size > 3` →
`tr.computer.thinkingBig` (mesaj ağacında zaten hazırdı, yeni anahtar EKLENMEDİ).

## İş 3 — Dürüst "Zor" etiketi (KK-B47, ADR-0013 §7)

`DifficultyPicker`e `size: number` prop'u eklendi. `Difficulty` tipi ve
`zorluk-unbeatable` test-id'si **DEĞİŞMEDİ** — yalnız GÖRÜNÜR etiket değişti:

```ts
case 'unbeatable':
  return size === 3 ? tr.computer.unbeatable : tr.computer.hard
```

`size > 3`te `tr.computer.strengthNote` ("3×3 tahtada bilgisayar yenilmezdir. Daha büyük
tahtalarda güçlü oynar ama yenilmez değildir.") de görünür hâle gelir. Her iki mesaj da
`messages/tr.ts`'te ZATEN vardı (`hard`, `strengthNote`) — TXT-001 dondurulu ağaca yeni
anahtar EKLENMEDİ, yalnız tüketildi.

**Kanıt (test-id ve tip sabitliği, `DifficultyPicker.test.tsx`):**

```ts
it('test-id ve Difficulty değeri boyuttan BAĞIMSIZ SABİT kalır — yalnız GÖRÜNÜR etiket değişir', () => {
  const button3 = screen.getByTestId(TESTID.zorlukUnbeatable)
  expect(button3).toHaveAttribute('data-testid', 'zorluk-unbeatable')
  rerender(<DifficultyPicker value="medium" onChange={onChange} size={11} />)
  const button11 = screen.getByTestId(TESTID.zorlukUnbeatable)
  expect(button11).toHaveAttribute('data-testid', 'zorluk-unbeatable')
  button11.click()
  expect(onChange).toHaveBeenCalledExactlyOnceWith('unbeatable')
})
```

Entegrasyon testinde de doğrulandı (`ComputerGameScreen.test.tsx`): 6×6 seçilince
`zorluk-unbeatable` düğmesi "Zor" metnini gösterir, `strengthNote` görünür; 3×3'e geri
dönülünce "Yenilmez" ve not kaybolur.

## Test kanıtı

```
pnpm --filter @xox/web exec vitest run components/computer
 Test Files  5 passed (5)
      Tests  56 passed (56)
```

Tüm web paketi (`pnpm gates` içindeki `test:coverage`, FORCE ile tekrar koşuldu — `Cached: 0 cached, 2 total`):

```
Test Files  82 passed (82)
     Tests  854 passed (854)
Statements   : 94.24% ( 1901/2017 )
Branches     : 89.62% ( 1045/1166 )
Functions    : 93.8%  ( 394/420 )
Lines        : 96.49% ( 1736/1799 )
```

Eşikler (70/65/70/70) rahatça aşıldı.

## `pnpm gates`

```
$ pnpm gates
 Tasks:    5 successful, 5 total
$ knip
Configuration hints (30)   ← yalnız bilgilendirici öneriler, hata YOK (exit 0)
```

`typecheck` + `test:coverage` ayrıca `--force` ile tekrar koşuldu (turbo cache'i
atlayarak): `Cached: 0 cached, 2 total`, ikisi de yeşil.

## `size-limit`

```
web — /oyna/bilgisayar
Size limit: 158 kB
Size:       146.82 kB gzipped
```

Görev başlarken ölçülen değer 146.81 kB idi; `BoardConfigPicker`'ın eklenmesi bütçeyi
yalnızca **+0.01 kB** artırdı (11 kB paydan pratikte hiç harcamadı) — beklenen sonuç,
çünkü `BoardConfigPicker` `ComputerGameInner` içinden import edilir ve `ComputerGameInner`
zaten PERF-003'ün `next/dynamic` (`ssr:false`) sınırının İÇİNDE, yani `/oyna/bilgisayar`ın
İLK yükleme JS'ine hiç girmez (yalnız mount sonrası eşzamansız çekilir). `next/dynamic`
sınırına DOKUNULMADI.

## Not

`use-computer-game.ts`, `game-engine.ts`, `status-text.ts` içindeki `COMPUTER_MOVE_DELAY_MS`
kullanan `useEffect`/`setTimeout` mekanizması ve `Board.tsx`'in `safeFocusIndex` odak
güvenliği bu görevde YAZILMADI, yalnız DOĞRULANDI ve doğru şekilde YENİDEN KULLANILDI —
CLAUDE.md'nin "aynı şeyin iki kopyası" gotcha'sına düşülmedi.
