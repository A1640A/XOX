/**
 * `apps/web/lib/client/use-room.ts`teki `MAX_REAUTH_ATTEMPTS`in eş biçimi:
 * art arda 4401 (kimlik reddi) gelirse bir noktada pes edilir — aksi halde
 * bozuk bir bilet/refresh döngüsü sonsuza dek "Bağlanıyor…" gösterir.
 */
export const MAX_REAUTH_ATTEMPTS = 5
