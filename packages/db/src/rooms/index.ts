/**
 * Otoriter oda geçişleri — `packages/db/src/rooms/` (tasarım §3.7).
 *
 * Her biri saf girdi → koşullu yazma → `TransitionResult` sonucu. Hiçbiri
 * Next.js bilmez. **Bu barrel DB-002'den sonra DONAR**: sonraki dalgalarda
 * her görev yalnız kendi dosyasının GÖVDESİNİ değiştirir (`resign.ts`,
 * `rematch.ts`, `settle.ts`, `emoji.ts`, `finish.ts`, `detach.ts`, `create.ts`)
 * — dışa aktarım listesi burada sabitlenir ki iki gerçek zamanlı görev aynı
 * dalgada paralel gidebilsin (WS-001'in ön koşulu).
 */
export { createRoom } from './create'
export { joinRoom } from './join'
export { detachConnection } from './detach'
export { applyMove } from './apply-move'
export { resign } from './resign'
export { offerRematch, acceptRematch } from './rematch'
export { settleDeadlines } from './settle'
export { pushEmoji } from './emoji'
export { finishGame } from './finish'
export type { RoomEvent, TransitionResult } from './types'
