import { TESTID } from '@xox/shared'
import { tr } from '@/messages/tr'

export interface ConnectionBadgeProps {
  readonly status: 'baglaniyor' | 'bagli' | 'kopuk' | 'devredildi'
  /**
   * KK-062: bağlantı koptuğunda kullanıcı manuel yeniden deneyebilmeli.
   * `useRoom().actions.reconnect` — daha önce hiçbir yere bağlanmayan ölü bir
   * API'ydi (inceleme minor bulgusu); şimdi tek tüketicisi burası.
   * `'kopuk'` DIŞINDA görünmez — `'devredildi'`de (§3.2) BİLEREK gösterilmez,
   * o durumda yeniden bağlanmak sonsuz takeover savaşı doğurur.
   */
  readonly onRetry?: () => void
}

/**
 * `data-durum` DÖRT değer yazar: `bagli`|`baglaniyor`|`kopuk`|`devredildi`.
 *
 * Spec §2.0'ın tablosu üç değerle yazılmıştı ve iskelet `devredildi`yi
 * `kopuk`a eşliyordu. W1-03 bunu **bilerek genişletti**: eşleme, birbirinden
 * TAM TERSİ davranış gerektiren iki durumu tek değere sıkıştırıyordu —
 * `kopuk`ta istemci üstel geri çekilmeyle yeniden bağlanır ve kullanıcıya
 * "Tekrar dene" gösterilir (KK-062), `devredildi`de (§3.2) hiçbir yeniden
 * bağlanma denenmez (aksi hâlde iki sekme sonsuz takeover savaşına girer).
 * Ayrım DOM'a yazılmazsa E2E "yeniden bağlanma denenmedi"yi ekrandan hiç
 * doğrulayamaz. KK-062'nin `kopuk` iddiası bundan etkilenmez: gerçek ağ
 * kesintisi (1006) hâlâ `kopuk` üretir.
 */
export function ConnectionBadge({ status, onRetry }: ConnectionBadgeProps): React.ReactElement {
  return (
    <p data-testid={TESTID.baglantiDurumu} data-durum={status}>
      {connectionLabel(status)}
      {status === 'kopuk' && onRetry ? (
        <button type="button" onClick={onRetry}>
          {tr.common.retry}
        </button>
      ) : null}
    </p>
  )
}

function connectionLabel(status: ConnectionBadgeProps['status']): string {
  switch (status) {
    case 'bagli':
      return tr.connection.connected
    case 'baglaniyor':
      return tr.connection.connecting
    case 'kopuk':
      return tr.connection.disconnected
    case 'devredildi':
      return tr.connection.takenOver
  }
}
