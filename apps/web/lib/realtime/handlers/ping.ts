import type { HandlerContext } from '../context'

/** KK-060 — nabız. Odaya dokunmaz; yalnız soketin canlı olduğunu doğrular. */
export function handlePing(context: HandlerContext): Promise<void> {
  context.connection.send({ type: 'pong' })
  return Promise.resolve()
}
