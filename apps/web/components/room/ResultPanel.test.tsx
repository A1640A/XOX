import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Player, RematchOffer, TransportStatus } from '@xox/shared'
import { describe, expect, it, vi } from 'vitest'
import { ResultPanel } from './ResultPanel'

const OFFER_BY_X: RematchOffer = { by: 'X', expiresAt: 1_700_000_060_000 }

function setup(options: {
  status: TransportStatus
  you: Player | null
  rematch?: RematchOffer | null
}) {
  const onOfferRematch = vi.fn()
  const onAcceptRematch = vi.fn()
  render(
    <ResultPanel
      status={options.status}
      you={options.you}
      rematch={options.rematch ?? null}
      onOfferRematch={onOfferRematch}
      onAcceptRematch={onAcceptRematch}
    />,
  )
  return { onOfferRematch, onAcceptRematch }
}

describe('ResultPanel', () => {
  it('oyun sürerken hiç render edilmez', () => {
    const { container } = render(
      <ResultPanel
        status={{ kind: 'playing', turn: 'X' }}
        you="X"
        rematch={null}
        onOfferRematch={vi.fn()}
        onAcceptRematch={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('sonuç metnini `you` üzerinden seçer: kazanan "Kazandın!" görür', () => {
    setup({ status: { kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' }, you: 'X' })
    expect(screen.getByRole('heading')).toHaveTextContent('Kazandın!')
  })

  it('AYNI sonuç, karşı taraf: "Kaybettin." görür', () => {
    setup({ status: { kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' }, you: 'O' })
    expect(screen.getByRole('heading')).toHaveTextContent('Kaybettin.')
  })

  it('pes ile biten oyunda sebebe özgü metin gösterilir', () => {
    setup({ status: { kind: 'won', winner: 'O', line: null, reason: 'resign' }, you: 'O' })
    expect(screen.getByRole('heading')).toHaveTextContent('Rakibin pes etti — kazandın!')
  })

  it('pes eden taraf kendi metnini görür', () => {
    setup({ status: { kind: 'won', winner: 'O', line: null, reason: 'resign' }, you: 'X' })
    expect(screen.getByRole('heading')).toHaveTextContent('Pes ettin, oyunu kaybettin.')
  })

  it('beraberlikte "Berabere." yazar', () => {
    setup({ status: { kind: 'draw' }, you: 'X' })
    expect(screen.getByRole('heading')).toHaveTextContent('Berabere.')
  })

  it('teklif yokken yalnız "Rövanş iste" düğmesi vardır', async () => {
    const user = userEvent.setup()
    const { onOfferRematch } = setup({ status: { kind: 'draw' }, you: 'X' })

    expect(screen.queryByTestId('btn-rovans-kabul')).toBeNull()
    await user.click(screen.getByTestId('btn-rovans-teklif'))
    expect(onOfferRematch).toHaveBeenCalledOnce()
  })

  it('kendi teklifim beklerken kabul düğmesi YOK, bekleme metni var', () => {
    setup({ status: { kind: 'draw' }, you: 'X', rematch: OFFER_BY_X })

    expect(screen.queryByTestId('btn-rovans-teklif')).toBeNull()
    expect(screen.queryByTestId('btn-rovans-kabul')).toBeNull()
    expect(screen.getByText('Rövanş yanıtı bekleniyor…')).toBeInTheDocument()
  })

  it('rakip teklif ettiyse bildirim + kabul düğmesi görünür', async () => {
    const user = userEvent.setup()
    const { onAcceptRematch } = setup({ status: { kind: 'draw' }, you: 'O', rematch: OFFER_BY_X })

    expect(screen.getByText('Rakip rövanş istiyor.')).toBeInTheDocument()
    await user.click(screen.getByTestId('btn-rovans-kabul'))
    expect(onAcceptRematch).toHaveBeenCalledOnce()
  })

  it('her sonuçta "Ana sayfa" çıkışı vardır — rakip yanıt vermezse kilitlenme yok', () => {
    setup({ status: { kind: 'draw' }, you: 'X', rematch: OFFER_BY_X })
    expect(screen.getByRole('link', { name: 'Ana sayfa' })).toHaveAttribute('href', '/')
  })
})
