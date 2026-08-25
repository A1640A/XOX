import type { ClientMessage } from '@xox/shared'
import type { HandlerContext, HandlerRegistry } from '../context'
import { handleChatEmoji } from './emoji'
import { handleJoin } from './join'
import { handleMove } from './move'
import { handlePing } from './ping'
import { handleRematchAccept, handleRematchOffer } from './rematch'
import { handleResign } from './resign'

/**
 * **DONDURULMUŞ kayıt defteri** (tasarım §5.1). Protokoldeki HER istemci
 * mesaj tipi burada bir giriş bulundurur — yazılmamış olanlar `SERVER_ERROR`
 * dönen tek satırlık iskeletlerdir.
 *
 * Neden hepsi Dalga 0'da: sonraki dalgalarda her görev **yalnız kendi handler
 * dosyasını** değiştirsin. Bu dosya sıcak olmaktan çıkar ve iki gerçek zamanlı
 * görev aynı dalgada paralel gidebilir — dalga bölümlemesinin ön koşulu budur.
 *
 * `HandlerRegistry` eşlenmiş bir tiptir: bir mesaj tipi eklenip buraya
 * yazılmazsa **derleme kırılır**. Eksik giriş çalışma zamanına sızamaz.
 */
export const handlers: HandlerRegistry = {
  join: handleJoin,
  move: handleMove,
  resign: handleResign,
  'rematch:offer': handleRematchOffer,
  'rematch:accept': handleRematchAccept,
  'chat:emoji': handleChatEmoji,
  ping: handlePing,
}

/**
 * Ayrıştırılmış bir istemci mesajını kendi handler'ına verir.
 *
 * Tek `as`: TypeScript `handlers[message.type]`in aldığı mesaj tipiyle
 * `message`in tipini eşleştiremez (ilişkili birlik indekslemesi). Eşleşmenin
 * doğruluğunu `HandlerRegistry`nin eşlenmiş tipi zaten garanti ediyor.
 */
export function dispatchMessage(context: HandlerContext, message: ClientMessage): Promise<void> {
  const handler = handlers[message.type] as (
    context: HandlerContext,
    message: ClientMessage,
  ) => Promise<void>
  return handler(context, message)
}
