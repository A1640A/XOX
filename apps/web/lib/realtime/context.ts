import type { RoomDoc, TransitionResult } from '@xox/db'
import type { ClientMessage, Emoji, Player, SeatOccupant } from '@xox/shared'
import type { RoomConnection } from './connection'

/**
 * Handler'ların gördüğü **tek** veritabanı yüzeyi. `@xox/db`'nin otoriter
 * geçişleri buraya bire bir yansıtılır ve enjekte edilir:
 *
 * 1. `apps/web` içinde koşulsuz bir `Room.updateOne` yazılamaz — yazma
 *    yüzeyinin tamamı bu arayüzdir ve arkasında `casUpdateRoom` vardır.
 * 2. Handler testleri gerçek Atlas'a gitmeden koşar; ama testler geçişin
 *    KENDİSİNİ değil, handler'ın geçiş sonucuna verdiği TEPKİYİ doğrular
 *    (geçişlerin kendi testleri `packages/db`'de).
 */
export interface RoomTransitions {
  findRoom(code: string): Promise<RoomDoc | null>
  joinRoom(code: string, user: SeatOccupant, connId: string): Promise<TransitionResult>
  applyMove(code: string, userId: string, index: number): Promise<TransitionResult>
  resign(code: string, userId: string): Promise<TransitionResult>
  offerRematch(code: string, userId: string): Promise<TransitionResult>
  acceptRematch(code: string, userId: string): Promise<TransitionResult>
  pushEmoji(code: string, seat: Player, emoji: Emoji): Promise<TransitionResult>
  settleDeadlines(code: string, now: number): Promise<TransitionResult | null>
  detachConnection(code: string, seat: Player, connId: string): Promise<void>
}

export interface HandlerIdentity {
  readonly userId: string
  readonly name: string
}

export interface HandlerContext {
  readonly roomCode: string
  readonly connId: string
  readonly identity: HandlerIdentity
  readonly connection: RoomConnection
  readonly db: RoomTransitions
  readonly now: () => number
}

type ClientMessageType = ClientMessage['type']
export type ClientMessageOf<T extends ClientMessageType> = Extract<ClientMessage, { type: T }>

type MessageHandler<T extends ClientMessageType> = (
  context: HandlerContext,
  message: ClientMessageOf<T>,
) => Promise<void>

/**
 * **DONDURULMUŞ kayıt defteri tipi.** Eşlenmiş tip, protokoldeki HER istemci
 * mesaj tipi için bir giriş olmasını derleme zamanında zorunlu kılar: yeni bir
 * mesaj tipi eklenince `handlers/index.ts` derlenmez. Sebep (tasarım §5.1):
 * sonraki dalgalarda her görev yalnız KENDİ handler dosyasını değiştirsin,
 * kayıt defteri sıcak dosya olmasın ve iki gerçek zamanlı görev aynı dalgada
 * paralel gidebilsin.
 */
export type HandlerRegistry = { readonly [K in ClientMessageType]: MessageHandler<K> }
