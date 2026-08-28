'use client'

import { TESTID, type Player, type RematchOffer, type TransportStatus } from '@xox/shared'
import Link from 'next/link'
import { buttonPrimary, card, headingDisplay, mutedText, textLink } from '@/components/ui/styles'
import { tr } from '@/messages/tr'
import { statusText } from './status-text'

export interface ResultPanelProps {
  readonly status: TransportStatus
  readonly you: Player | null
  readonly rematch: RematchOffer | null
  readonly onOfferRematch: () => void
  readonly onAcceptRematch: () => void
}

/**
 * Oyun sonucu + rövanş aksiyonları (KK-050/054/055/056).
 *
 * Sonuç metni `statusText`ten gelir — yani `tr.game.*` ve **`you`** üzerinden
 * (ADR-0001: `reason` dört ayrı Türkçe metni ayırt ettirir, `you` "Kazandın /
 * Kaybettin" ayrımını yapar). Metin `RoomScreen`in `durum-metni` canlı
 * bölgesinde de var; orası oyun SÜRERKEN de konuşan `aria-live` satırıdır,
 * burası ise sonuç kartının başlığıdır. Testid sözleşmesi dondurulmuş
 * (`durum-metni` tekil olmalı), bu yüzden başlık kendi kancasını taşımaz.
 *
 * Kazanan çizginin `data-kazanan="true"` işaretini `Board` yazar
 * (`status.line` → `RoomScreen` → `Board.winningLine`); sonuç kartı tahtayı
 * ikinci kez çizmez.
 *
 * "Ana sayfa" bilinçli olarak HER sonuçta duruyor: rakip rövanşa yanıt
 * vermezse (ya da ayrılırsa) kullanıcının odadan çıkış yolu olmalı — sonuç
 * ekranında tek eylem "Rövanş iste" olursa kullanıcı kilitlenir.
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
  const waitingForOpponent = rematch !== null && !offeredByOpponent

  return (
    <section className={`${card} flex flex-col gap-3`}>
      <h2 className={`${headingDisplay} text-2xl`}>{statusText(status, you)}</h2>

      {rematch === null ? (
        <button
          type="button"
          data-testid={TESTID.btnRovansTeklif}
          onClick={onOfferRematch}
          className={`${buttonPrimary} w-fit`}
        >
          {tr.rematch.offer}
        </button>
      ) : null}

      {offeredByOpponent ? (
        <>
          <p className={mutedText}>{tr.rematch.offered}</p>
          <button
            type="button"
            data-testid={TESTID.btnRovansKabul}
            onClick={onAcceptRematch}
            className={`${buttonPrimary} w-fit`}
          >
            {tr.rematch.accept}
          </button>
        </>
      ) : null}

      {waitingForOpponent ? <p className={mutedText}>{tr.rematch.waiting}</p> : null}

      <Link href="/" className={`${textLink} w-fit`}>
        {tr.common.home}
      </Link>
    </section>
  )
}
