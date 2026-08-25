import type { HandlerContext } from '../context'

/** **İSKELET (W1-02 doldurur)** — KK-055, tasarım §3.7. */
export function handleRematchOffer(context: HandlerContext): Promise<void> {
  context.connection.sendError('SERVER_ERROR', 'Rövanş teklifi henüz uygulanmadı.')
  return Promise.resolve()
}

/** **İSKELET (W1-02 doldurur)** — KK-056/058, koltuk takası + `version` korunur. */
export function handleRematchAccept(context: HandlerContext): Promise<void> {
  context.connection.sendError('SERVER_ERROR', 'Rövanş kabulü henüz uygulanmadı.')
  return Promise.resolve()
}
