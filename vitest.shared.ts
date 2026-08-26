// vitest.shared.ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export const sharedConfig = defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Çöken bir Stryker koşusu .stryker-tmp/ bırakır; içindeki test kopyaları
    // toplanırsa test sayısı iki katına çıkar ve sonuç yanıltıcı olur.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.stryker-tmp/**'],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      // `*.fixture.ts` test iskelesidir, ürün kodu DEĞİL — `*.test.ts` ile aynı kategori.
      // Somut sebep (2026-08-26, CORE-AI-001): `corpus.fixture.ts:105`'teki
      // `if (board[result.move] !== null) illegal += 1` bir İDDİA sayacıdır; doğru dalı
      // ASLA çalışmamalıdır çünkü arama geçersiz hamle döndürmüyor. Kapsam onu "eksik dal"
      // sayıp game-core'u %100 eşiğinin altına düşürüyordu (99.79 stmt / 99.6 branch).
      // O dalı "kapatmanın" tek yolu aramayı bozmaktı — yani kapsam, testin kendisini
      // zayıflatmaya BASKI yapıyordu. Ürün dosyalarının tamamı %100'de kalıyor; eşik
      // DÜŞÜRÜLMEDİ, yalnız ölçümün kapsamı doğru çizildi.
      exclude: ['**/*.test.ts', '**/*.fixture.ts', '**/*.config.*', '**/index.ts', '**/dist/**'],
    },
  },
})
