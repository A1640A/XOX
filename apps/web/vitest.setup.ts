import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * `@testing-library/react`'in otomatik `afterEach(cleanup)` kaydı, test
 * çerçevesinin `globalThis.afterEach`'i GÖRMESİNE bağlıdır — bu projede
 * `vitest.config.ts` `test.globals` AÇIK DEĞİL (her test dosyası `describe`/
 * `it`/`expect`'i `'vitest'`'ten AÇIKÇA import eder), yani otomatik kayıt hiç
 * tetiklenmez. Kanıt: bunsuz aynı dosyadaki ardışık `render()` çağrıları
 * DOM'da BİRİKİR, `getByTestId` "multiple elements found" ile patlar
 * (UI-SKEL-001'de `RoomScreen.test.tsx`'te canlı doğrulandı).
 */
afterEach(() => {
  cleanup()
})
