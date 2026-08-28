import type { SocketLike } from '@xox/shared'

/**
 * İNCE TEL — `@xox/shared`'ın `SocketLike`'ı gerçek `WebSocket`'e (native
 * DAHİL, kartın değişmezi: React Native'in YERLEŞİK `WebSocket`'i kullanılır,
 * polyfill KURULMAZ) bağlayan tek yer. Dallanma yok, bu yüzden Vitest'te
 * ayrıca test edilmiyor (`web-room-client.test.ts`/`native-room-client.test.ts`
 * zaten `createSocket`i enjekte edilen bir sahteyle sınıyor — buradaki tek
 * risk gerçek `WebSocket` çağrısının KENDİSİdir, bu da yalnız gerçek bir
 * ortamda (Expo Go/web) gözlemlenebilir, KK-093 manuel doğrulamasının işi).
 */
function wrap(socket: WebSocket): SocketLike {
  const wrapper: SocketLike = {
    send: (data) => {
      socket.send(data)
    },
    close: (code, reason) => {
      socket.close(code, reason)
    },
    onopen: null,
    onmessage: null,
    onclose: null,
  }
  socket.onopen = () => wrapper.onopen?.()
  socket.onmessage = (event) => {
    wrapper.onmessage?.({ data: event.data as unknown })
  }
  socket.onclose = (event) => {
    wrapper.onclose?.({ code: event.code })
  }
  return wrapper
}

/** Web hedefi (react-native-web) — bilet zaten `url`nin `?ticket=`inde. */
export function createWebSocketLike(url: string): SocketLike {
  return wrap(new WebSocket(url))
}

/**
 * Native hedef — kimlik `Authorization: Bearer` başlığıyla taşınır.
 * React Native'in `WebSocket`'i standart-dışı ÜÇÜNCÜ argüman olarak
 * `{ headers }` kabul eder (belgelenmiş RN davranışı; tarayıcı WebSocket
 * API'sinde bu argüman yoktur — ADR-0006'nın "tarayıcı özel başlık
 * gönderemez" kısıtı yalnız web hedefi için geçerlidir).
 */
export function createNativeSocketLike(url: string, accessToken: string): SocketLike {
  const RNWebSocket = WebSocket as unknown as new (
    url: string,
    protocols: undefined,
    options: { headers: Record<string, string> },
  ) => WebSocket
  const socket = new RNWebSocket(url, undefined, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return wrap(socket)
}
