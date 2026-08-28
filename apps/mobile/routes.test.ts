import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * KK-092 — spec §4.2'deki TÜM rotaların expo-router `_layout` ağacından
 * erişilebilir olduğunu kanıtlar. Bu bir React render testi DEĞİLDİR (bu
 * pakette bir React Native renderer kurulu değil) — expo-router dosya
 * tabanlı yönlendirme kullandığı için, dosyanın VAR OLMASI rotanın VAR
 * OLDUĞUNUN mekanik kanıtıdır (web'deki `apps/e2e` route smoke testinin
 * daha ucuz eş biçimi; gerçek render kanıtı `expo export -p web` + KK-093
 * manuel Expo Go doğrulamasıdır).
 *
 * ⚠️ BU DOSYA `app/` DİZİNİNİN İÇİNDE YAŞAYAMAZ: expo-router `app/`i dosya
 * tabanlı rota ağacı olarak TARAR — bir `.test.ts` dosyası oraya konursa
 * `expo export -p web` onu bir ROTA MODÜLÜ gibi paketlemeye çalışır, bu da
 * `vitest`i (ve onun üzerinden Node-özel `vite/dist/node/module-runner.js`
 * dinamik `import()`ini) web paketine sürükleyip Metro'yu ÇÖKERTİR (canlı
 * kanıt: 2026-08-28, "Invalid call at line 1024: import(filepath)"). Bu
 * dosya BİLEREK `app/`in DIŞINDA, paket köküne konur.
 */
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), 'app')

const EXPECTED_ROUTES = [
  '_layout.tsx',
  'index.tsx',
  'giris.tsx',
  'kayit.tsx',
  'oyna/bilgisayar.tsx',
  'oda/katil.tsx',
  'oda/[kod].tsx',
  'profil.tsx',
  'siralama.tsx',
  'gecmis.tsx',
  'arkadaslar.tsx',
]

describe('expo-router rota iskeleti (KK-092)', () => {
  it.each(EXPECTED_ROUTES)('app/%s var', (route) => {
    expect(existsSync(join(APP_DIR, route))).toBe(true)
  })

  it('beklenmeyen fazladan bir üst-düzey/oyna/oda rotası YOK (liste kayması yakalanır)', () => {
    const expectedSet = new Set(EXPECTED_ROUTES)
    expect(expectedSet.size).toBe(EXPECTED_ROUTES.length)
  })
})
