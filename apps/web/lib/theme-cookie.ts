/**
 * Tema çerezinin adı — tek kaynak (bkz. `lib/theme.ts`, `components/profile/
 * ProfileContent.tsx`). Bu sabit kasıtlı olarak `next/headers` import EDEN
 * `lib/theme.ts`'ten AYRI bir dosyada yaşar: `ProfileContent.tsx` istemci
 * bileşenidir ve `theme.ts`'i import etseydi `next/headers` (sunucu-yalnız
 * modül) istemci paketine sızardı — `pnpm --filter @xox/web build` bunu
 * Turbopack hatası olarak reddediyordu ("You're importing a module that
 * depends on next/headers ... Client Component"). `lib/theme.ts` bu sabiti
 * BURADAN tekrar dışa aktarır; iki ayrı sabit olarak KOPYALANMAZ.
 */
export const THEME_COOKIE = 'xox-tema'
