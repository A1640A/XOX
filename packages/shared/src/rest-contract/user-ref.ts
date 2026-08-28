import { z } from 'zod'

/**
 * PERF-005: `matchSchema`/`friendSchema` arasında paylaşılan yapı taşı.
 * BİLEREK `rest-contract.ts` barrel'ından `export *` EDİLMEZ — hiçbir zaman
 * kamuya açık değildi (eski `rest-contract.ts`'te de dışa verilmeyen bir
 * modül-içi `const`'tı). Bu dosya yalnızca `matches.ts`/`friends.ts` gibi
 * kardeş modüllerin ondan `import` edebilmesi için var; barrel yüzeyinin 103
 * adlık listesi bu isimden ETKİLENMEZ.
 */
export const userRefSchema = z.object({ userId: z.string().min(1), name: z.string().min(1) })
