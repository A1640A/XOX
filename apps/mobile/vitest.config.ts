import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../vitest.shared'

/**
 * Yalnız `lib/**` SAF mantığı burada test edilir (`environment: 'node'`).
 * `app/**`/`components/**` gerçek React Native bileşenleridir — jsdom
 * react-native-web'i render EDEMEZ (gerçek Metro/react-native-web derlemesi
 * gerekir, bkz. `pnpm --filter @xox/mobile build`), bu yüzden coverage
 * eşiği yalnız test EDİLEBİLEN katmana uygulanır; ekranların doğruluğu
 * `expo export -p web` (KK-090) + route var-olma sondasıyla kanıtlanır.
 */
export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      name: 'mobile',
      environment: 'node',
      coverage: {
        thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
        include: ['lib/**/*.ts'],
        exclude: [
          '**/*.test.ts',
          '**/*.fixture.ts',
          '**/*.config.*',
          // İNCE TEL dosyaları — `react-native`/`expo-*` import ettikleri için
          // Vitest'te ÇALIŞTIRILAMAZLAR (Metro/Hermes'e özgü çözümleme ister,
          // next-auth'un Vitest'te çalışamamasıyla AYNI sınıf — bkz. dosya
          // başlıklarındaki notlar ve conventions.md). Gerçek davranış kanıtı
          // `expo export -p web` (KK-090) + KK-093 manuel Expo Go doğrulaması.
          'lib/auth/storage.ts',
          'lib/auth/browser-login.ts',
          'lib/auth/session.tsx',
          'lib/ws/sockets.ts',
          'lib/ws/use-room.ts',
          'lib/theme.ts',
          // React hook'u — bu pakette bir React renderer (RTL/react-test-renderer)
          // kurulu değil, bu yüzden birim testi yazılmadı. Çağırdığı kural mantığı
          // (`game-engine.ts`) AYRI test edilir (KK-022); burada yalnız
          // `useState`/`useEffect` orkestrasyonu var.
          'lib/computer/use-computer-game.ts',
        ],
      },
    },
  }),
)
