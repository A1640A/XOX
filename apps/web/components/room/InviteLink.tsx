import type { RoomCode } from '@xox/shared'

export interface InviteLinkProps {
  readonly roomCode: RoomCode
}

/**
 * İSKELET (kart §4c, inceleme MAJOR #4) — W3-03 "Emoji tepkileri, hız sınırı
 * ve davet linki" görevi KK-120'yi ("Linki kopyala" → `<origin>/davet/<KOD>`,
 * `data-kopyalandi`) burada uygular; `components/room/CopyButton.tsx` (bu
 * görevde "Kodu kopyala" için zaten yazıldı) doğrudan tüketilebilir.
 * `roomCode` prop'u BİLEREK gerçek değere bağlı mount edilir.
 */
export function InviteLink(props: InviteLinkProps): React.ReactElement | null {
  void props
  return null
}
