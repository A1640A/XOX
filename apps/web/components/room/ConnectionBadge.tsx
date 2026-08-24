import { TESTID } from '@xox/shared'
import { tr } from '@/messages/tr'

export interface ConnectionBadgeProps {
  readonly status: 'baglaniyor' | 'bagli' | 'kopuk' | 'devredildi'
}

/**
 * Spec §2.0 `baglanti-durumu` yalnız üç değer tanımlar: `bagli`|`baglaniyor`|`kopuk`.
 * `devredildi` (§3.2 takeover) görüntüde `kopuk` olarak eşlenir — istemci zaten
 * yeniden bağlanmayı denemeyecektir (`room-client.ts`), yalnız ekran sözleşmesi
 * üçlü kalır. Görsel/animasyon zenginleştirmesi sonraki dalgadadır; bu, iskeletin
 * doğru veri sözleşmesini şimdiden kilitleyen minimum halidir.
 */
export function ConnectionBadge({ status }: ConnectionBadgeProps): React.ReactElement {
  const durum = status === 'devredildi' ? 'kopuk' : status

  return (
    <p data-testid={TESTID.baglantiDurumu} data-durum={durum}>
      {connectionLabel(status)}
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
