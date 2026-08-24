export interface OpponentLeftBannerProps {
  /** `state.graceEndsAt` — epoch ms, rakip bağlıyken `null`. */
  readonly graceEndsAt: number | null
  /** `state.serverOffsetMs` — istemci saat sapmasını düzeltmek için. */
  readonly serverOffsetMs: number
}

/**
 * İSKELET (kart §4b, inceleme MAJOR #4) — W2-01 "Hamle süresi ve terk grace'i"
 * görevi burada KK-070/071'in canlı geri sayımını (`tr.connection.
 * opponentDisconnected`/`opponentReturned`) uygular. `@xox/shared`'ın
 * `opponentLeftVisible(state, now)` saf yardımcısı zaten hazır — bu bileşen
 * onu TÜKETECEK, W2-01 yalnız bu dosyayı doldurur, `RoomScreen.tsx`'i AÇMAZ.
 *
 * Prop'lar BİLEREK gerçek `state` alanlarına bağlı mount edilir (boş/sabit
 * değer DEĞİL) — aksi hâlde imza değişikliği yine `RoomScreen.tsx`'i açmayı
 * gerektirirdi ve dondurma tutmazdı.
 */
export function OpponentLeftBanner(props: OpponentLeftBannerProps): React.ReactElement | null {
  void props
  return null
}
