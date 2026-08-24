'use client'

import { TESTID, type Player, type RematchOffer, type TransportStatus } from '@xox/shared'
import { tr } from '@/messages/tr'

export interface ResultPanelProps {
  readonly status: TransportStatus
  readonly you: Player | null
  readonly rematch: RematchOffer | null
  readonly onOfferRematch: () => void
  readonly onAcceptRematch: () => void
}

/**
 * Rövanş aksiyonlarının minimum hâli (KK-055/056, P0 — §9 katman tablosu).
 * Sonuç METNİ zaten `durum-metni` üzerinden (`RoomScreen`) gösteriliyor; bu
 * panel yalnız `btn-rovans-teklif`/`btn-rovans-kabul` düğmelerini taşır.
 * Zengin sonuç kartı (kazanan çizgi animasyonu, paylaşım vb.) W1-02'de
 * buraya eklenir — DONDURMA #1'in "gövdesi boş/pasif" niteliği bu genişlemeyi
 * kapsar, temel testid sözleşmesini kapsamaz.
 */
export function ResultPanel({
  status,
  you,
  rematch,
  onOfferRematch,
  onAcceptRematch,
}: ResultPanelProps): React.ReactElement | null {
  if (status.kind === 'playing') return null

  const offeredByOpponent = rematch !== null && rematch.by !== you

  return (
    <div>
      {rematch === null ? (
        <button type="button" data-testid={TESTID.btnRovansTeklif} onClick={onOfferRematch}>
          {tr.rematch.offer}
        </button>
      ) : null}
      {offeredByOpponent ? (
        <button type="button" data-testid={TESTID.btnRovansKabul} onClick={onAcceptRematch}>
          {tr.rematch.accept}
        </button>
      ) : null}
      {rematch !== null && !offeredByOpponent ? <p>{tr.rematch.waiting}</p> : null}
    </div>
  )
}
