import type { HandlerContext } from '../context'

/**
 * **İSKELET (W1-02 doldurur)** — KK-054, tasarım §3.7.
 *
 * Kayıt defteri Dalga 0'da TAM doldurulur; gövde sonraki dalgada gelir. Bu
 * dosyanın var olması, W1-02'nin `handlers/index.ts`'e dokunmadan çalışmasını
 * sağlar (kayıt defteri sıcak dosya olmaz, iki gerçek zamanlı görev paralel
 * gider). `@xox/db`'nin fırlatan `resign` iskeletine bilerek DOKUNULMAZ.
 */
export function handleResign(context: HandlerContext): Promise<void> {
  context.connection.sendError('SERVER_ERROR', 'Pes etme henüz uygulanmadı.')
  return Promise.resolve()
}
