import { randomUUID } from 'node:crypto'
import {
  Room,
  acceptRematch,
  applyMove,
  detachConnection,
  joinRoom,
  offerRematch,
  pushEmoji,
  resign,
  settleDeadlines,
} from '@xox/db'
import { WS_CLOSE, roomCodeSchema } from '@xox/shared'
import {
  experimental_upgradeWebSocket,
  getDeadline,
  type WebSocket,
  type WebSocketData,
} from '@vercel/functions'
import { connection } from 'next/server'
import { resolveIdentity } from '@/lib/auth/identity'
import type { RoomTransitions } from '@/lib/realtime/context'
import { roomHub } from '@/lib/realtime/room-hub'
import { createRoomSession } from '@/lib/realtime/session'

export const dynamic = 'force-dynamic'

/**
 * ADR-0006: varsayılan 256 KiB gereksiz bir bellek yüzeyi — protokoldeki en
 * büyük mesaj birkaç yüz bayt.
 */
const MAX_PAYLOAD_BYTES = 8 * 1024

/** `ws` yükü Buffer | Buffer[] | ArrayBuffer olabilir; hepsi utf8 metne iner. */
function toText(data: WebSocketData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  return Buffer.from(data).toString('utf8')
}

/**
 * Otoriter geçişlerin TAMAMI `packages/db`'den gelir. `apps/web` içinde ne
 * `evaluateStatus`/`applyMove` yeniden yazılır ne de koşulsuz bir
 * `Room.updateOne` bulunur: her yazma `casUpdateRoom`'un arkasındadır.
 */
const transitions: RoomTransitions = {
  findRoom: (code) => Room.findOne({ code }).lean(),
  joinRoom,
  applyMove,
  resign,
  offerRematch,
  acceptRematch,
  pushEmoji,
  settleDeadlines,
  detachConnection,
}

/** Kimliksiz/yetkisiz istek: upgrade EDİLİR, sonra derhal kapanır (KK-008). */
function upgradeAndClose(code: number, reason: string): Promise<Response> {
  return experimental_upgradeWebSocket(
    (ws: WebSocket) => {
      // Hiçbir oda mesajı gönderilmez. `4401` bir kapanış KODU iddiasıdır;
      // HTTP 401 dönmek istemciye `1006` verirdi ve istemci "ağ hatası" sanıp
      // sonsuz yeniden bağlanma döngüsüne girerdi (ADR-0006).
      ws.close(code, reason)
    },
    { maxPayload: MAX_PAYLOAD_BYTES },
  )
}

/**
 * `GET /api/rooms/[code]/ws` — oyunun tek gerçek zamanlı uç noktası
 * (tasarım §5.2). Bu dosya bilinçli olarak İNCE: kimliği çözer, oda kodunu
 * doğrular, upgrade eder ve gerisini `lib/realtime/session.ts`'e devreder.
 *
 * Kimlik upgrade'den **ÖNCE** çözülmek zorunda: `experimental_upgradeWebSocket`
 * handler'ına `Request` VERİLMEZ (imza `(ws) => void`), yani çerez, başlık ve
 * sorgu parametresi handler içinden okunamaz. Çözülen kimlik closure ile
 * taşınır.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  // Cache Components açıkken upgrade'in istek anında koşmasını garanti eder.
  await connection()

  const { code: rawCode } = await context.params
  const parsedCode = roomCodeSchema.safeParse(rawCode.toUpperCase())
  if (!parsedCode.success) {
    return upgradeAndClose(WS_CLOSE.NOT_FOUND, 'invalid-code')
  }
  const roomCode = parsedCode.data

  // `allowTicket: true` YALNIZ burada geçilir: bilet başka hiçbir uçta kabul
  // edilmez (ADR-0006 · güvenlik denetimi BLOCKER-2).
  const identity = await resolveIdentity(request, { allowTicket: true })
  if (identity === null) {
    return upgradeAndClose(WS_CLOSE.UNAUTHENTICATED, 'unauthenticated')
  }

  // Bilet ODA KODUNA bağlıdır. A odası için kesilmiş bir bilet B odasında
  // "aynı kullanıcı" olarak kabul edilirse yatay yetki sızıntısı doğar.
  if (identity.room !== undefined && identity.room.toUpperCase() !== roomCode) {
    return upgradeAndClose(WS_CLOSE.FORBIDDEN, 'ticket-room-mismatch')
  }

  const connId = randomUUID()

  return experimental_upgradeWebSocket(
    (ws: WebSocket) => {
      const session = createRoomSession({
        roomCode,
        connId,
        identity: { userId: identity.userId, name: identity.name },
        socket: {
          send: (data) => {
            ws.send(data)
          },
          close: (code, reason) => {
            ws.close(code, reason)
          },
        },
        hub: roomHub,
        db: transitions,
        now: () => Date.now(),
        setTimer: (callback, ms) => setTimeout(callback, ms),
        clearTimer: (handle) => {
          clearTimeout(handle as ReturnType<typeof setTimeout>)
        },
        // ADR-0007: süre KODA GÖMÜLMEZ; plan değişince bu dosya değişmez.
        getDeadline: () => getDeadline(),
        logError: (message, error) => {
          console.error(`[ws ${roomCode}] ${message}`, error)
        },
      })

      // `session` kendi içinde sıraya alıyor: `start` bitmeden gelen çerçeve
      // de, art arda gelen iki hamle de sırayla işlenir.
      ws.on('message', (data: WebSocketData) => {
        void session.handleMessage(toText(data))
      })
      ws.on('close', () => {
        void session.end()
      })
      ws.on('error', () => {
        void session.end()
      })

      void session.start()
    },
    { maxPayload: MAX_PAYLOAD_BYTES },
  )
}
