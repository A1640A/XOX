export interface FriendAddButtonProps {
  /** Rakibin `userId`'si — henüz oynanmamışsa `null`. */
  readonly opponentId: string | null
  /** Yalnız oyun bittiğinde görünür (P2 — arkadaşlık yalnızca bitmiş oyun üzerinden kurulur). */
  readonly visible: boolean
}

/**
 * İSKELET (kart DONDURMA #1) — W3-04 "Arkadaşlar" görevi `POST /api/friends`
 * çağrısını ve `tr.friends.add` düğmesini burada ekler (KK-125/126).
 */
export function FriendAddButton(props: FriendAddButtonProps): React.ReactElement | null {
  void props
  return null
}
