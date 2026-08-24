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
 * Spec §2.0 `baglanti-durumu` yalnız üç değer tanımlar: `bagli`|`baglaniyor`|`kopuk`.
 * `devredildi` (§3.2 takeover) görüntüde `kopuk` olarak eşlenir — istemci zaten
 * yeniden bağlanmayı denemeyecektir (`room-client.ts`), yalnız ekran sözleşmesi
 * üçlü kalır. Görsel/animasyon zenginleştirmesi sonraki dalgadadır; bu, iskeletin
 * doğru veri sözleşmesini şimdiden kilitleyen minimum halidir.
 */
export function ConnectionBadge({ status, onRetry }: ConnectionBadgeProps): React.ReactElement {
  const durum = status === 'devredildi' ? 'kopuk' : status

  return (
    <p data-testid={TESTID.baglantiDurumu} data-durum={durum}>
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
