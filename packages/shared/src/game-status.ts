import type { GameStatus } from '@xox/game-core'
import { z } from 'zod'
import { cellIndexSchema, type Player, playerSchema } from './primitives'

/**
 * Taşıma katmanının oyun durumu (ADR-0001).
 *
 * `@xox/game-core`'un `GameStatus`'u **değişmez**: saf kural motoru pes etmeyi,
 * süre aşımını ya da terk etmeyi bilmez ve bilmemelidir. Ürünün dört bitiş
 * biçimi (`line`, `resign`, `timeout`, `abandon`) yalnızca ağ üzerinde
 * anlamlıdır, bu yüzden burada tanımlanır. Köprü **tek yönlüdür**: motor →
 * taşıma. Ters yön yazılmaz; yazılırsa kural mantığının taşıma tipine sızması
 * için kapı açılır.
 */
export const endReasonSchema = z.enum(['line', 'resign', 'timeout', 'abandon'])
export type EndReason = z.infer<typeof endReasonSchema>

/** Kazanan çizgi: 0..8 aralığında üç indeks. */
export const winLineSchema = z.tuple([cellIndexSchema, cellIndexSchema, cellIndexSchema])
export type WinLineCells = z.infer<typeof winLineSchema>

/**
 * Değişmezi **dayatmayan** iç birlik. `superRefine` eklenmiş şema bir
 * `discriminatedUnion`'ın seçeneği olamaz; bir yerde durumun kendisi üzerinde
 * ayrıştırma yapmak gerekirse bu birlik kullanılır (ADR-0001 §Sonuçlar).
 * Doğrulama için **her zaman** `transportStatusSchema` tercih edilir.
 */
export const transportStatusInnerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('playing'), turn: playerSchema }),
  z.object({
    kind: z.literal('won'),
    winner: playerSchema,
    line: winLineSchema.nullable(),
    reason: endReasonSchema,
  }),
  z.object({ kind: z.literal('draw') }),
])

/**
 * Tek değişmez: **çizgi varsa sebep `'line'`; sebep `'line'` ise çizgi vardır.**
 * Yorumla değil, çalışma zamanı doğrulamasıyla — hiçbir sunucu kod yolu
 * tutarsız bir sonuç yayınlayamaz.
 */
export const transportStatusSchema = transportStatusInnerSchema.superRefine((status, ctx) => {
  if (status.kind !== 'won') return
  if ((status.reason === 'line') !== (status.line !== null)) {
    ctx.addIssue({ code: 'custom', message: "reason:'line' ile line alanı tutarsız" })
  }
})

export type TransportStatus = z.infer<typeof transportStatusSchema>

/** `game-core`'un bilmediği bitiş biçimleri: çizgisiz galibiyetler. */
export type ForfeitReason = Exclude<EndReason, 'line'>

/** Saf motor durumundan taşıma durumuna. Tek yönlü köprünün tek yönü. */
export function toTransportStatus(status: GameStatus): TransportStatus {
  if (status.kind === 'won') {
    const [a, b, c] = status.line
    // Motorun `WIN_LINES` üçlüleri dondurulmuştur ve paylaşılır; kopyalanmazsa
    // taşıma nesnesi motorun iç durumuna referans tutar.
    return { kind: 'won', winner: status.winner, line: [a, b, c], reason: 'line' }
  }
  return status
}

/** Pes / süre aşımı / terk galibiyeti — kazanan çizgi yoktur. */
export function forfeitStatus(winner: Player, reason: ForfeitReason): TransportStatus {
  return { kind: 'won', winner, line: null, reason }
}

/**
 * Hamle reddetme sebebi (B8): `InvalidMoveReason ∪ {'not-your-turn'}`.
 * Sıra sahipliği `game-core`'un göremediği bir bilgidir (bkz. `game-core/index.ts`),
 * bu yüzden dördüncü değer yalnızca taşıma katmanında vardır.
 */
export const moveRejectionReasonSchema = z.enum([
  'out-of-range',
  'occupied',
  'game-over',
  'not-your-turn',
])
export type MoveRejectionReason = z.infer<typeof moveRejectionReasonSchema>
