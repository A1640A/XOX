import { loadEnvLocal } from './load-env'

loadEnvLocal()

// Gerçek Atlas'a koşan tüm `packages/db` testleri yalnız `xox_test`'e dokunur —
// `reset.ts`'in `xox_prod`/`xox_dev` reddi bunu ihlal edilirse zaten durdurur,
// ama bağlantı hiç `xox_dev`'e açılmasın diye burada da zorlanır.
process.env['MONGODB_DB'] = 'xox_test'
