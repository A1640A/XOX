import { connection } from 'next/server'
import { experimental_upgradeWebSocket, type WebSocketData } from '@vercel/functions'

/**
 * `ws` mesaj yükü Buffer, Buffer[] ya da ArrayBuffer olabilir. Düz `String(data)`
 * ArrayBuffer için `[object ArrayBuffer]` üretirdi; hepsini utf8 metne indirgiyoruz.
 */
function toText(data: WebSocketData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  return Buffer.from(data).toString('utf8')
}

/**
 * Salt kanıt uç noktası: gelen mesajı `echo:` ön ekiyle geri gönderir.
 * Gerçek oyun WS'i buna değil `/api/rooms/[code]/ws` yoluna kurulacak;
 * bu uç nokta harness doğrulaması için kalıcı olarak durur.
 */
export async function GET(): Promise<Response> {
  await connection()

  return experimental_upgradeWebSocket((ws) => {
    ws.on('message', (data: WebSocketData) => {
      ws.send(`echo:${toText(data)}`)
    })
  })
}
