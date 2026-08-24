import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { initialRoomClientState, type RoomClientState } from '@xox/shared'
import { RoomScreen } from './RoomScreen'

/**
 * `useRoom` burada MOCK'lanır — bu, RoomScreen'in KENDİ render/wiring
 * mantığını (doğru testid'ler, doğru prop devri) test eder; `useRoom`'un
 * kendisi zaten `use-room.test.tsx`'te gerçek reducer'a karşı test edilmiştir.
 * İki farklı sınır: burada mock'lanan RoomScreen'in bağımlılığıdır, kendi
 * mantığı değil (gotchas.md'nin uyardığı "kendi mock'unu doğrulama" bu değil).
 */
const actions = {
  move: vi.fn(),
  resign: vi.fn(),
  offerRematch: vi.fn(),
  acceptRematch: vi.fn(),
  sendEmoji: vi.fn(),
  reconnect: vi.fn(),
}

let mockState: RoomClientState = initialRoomClientState()

vi.mock('@/lib/client/use-room', () => ({
  useRoom: () => ({ state: mockState, actions }),
}))

function withState(overrides: Partial<RoomClientState>): void {
  mockState = { ...initialRoomClientState(), ...overrides }
}

describe('RoomScreen', () => {
  it('rakip yokken bekleniyor metnini, sıra bendeyken tahtayı etkileşimli gösterir', async () => {
    const user = userEvent.setup()
    withState({
      connection: 'bagli',
      you: 'X',
      status: { kind: 'playing', turn: 'X' },
      players: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
    })

    render(<RoomScreen roomCode="ABC234" />)

    expect(screen.getByTestId('oda-kodu')).toHaveTextContent('ABC234')
    expect(screen.getByTestId('rakip-adi')).toHaveTextContent('Rakip bekleniyor')
    expect(screen.getByTestId('sira-gostergesi')).toHaveAttribute('data-sira', 'X')
    expect(screen.getByTestId('durum-metni')).toHaveTextContent('Sıra sende')
    expect(screen.getByTestId('baglanti-durumu')).toHaveAttribute('data-durum', 'bagli')

    await user.click(screen.getByTestId('hucre-0'))
    expect(actions.move).toHaveBeenCalledExactlyOnceWith(0)
  })

  it('sıra rakipteyken tahta etkileşimsizdir', async () => {
    const user = userEvent.setup()
    withState({
      connection: 'bagli',
      you: 'X',
      status: { kind: 'playing', turn: 'O' },
      players: { X: { userId: 'u1', name: 'Ayşe' }, O: { userId: 'u2', name: 'Deniz' } },
    })

    render(<RoomScreen roomCode="ABC234" />)

    expect(screen.getByTestId('rakip-adi')).toHaveTextContent('Deniz')
    expect(screen.getByTestId('sira-gostergesi')).toHaveAttribute('data-sira', 'O')
    await user.click(screen.getByTestId('hucre-0'))
    expect(actions.move).not.toHaveBeenCalled()
  })

  it('oyun bittiğinde sira-gostergesi yok olur ve rövanş teklif düğmesi görünür', async () => {
    const user = userEvent.setup()
    withState({
      connection: 'bagli',
      you: 'X',
      status: { kind: 'won', winner: 'X', line: [0, 1, 2], reason: 'line' },
      players: { X: { userId: 'u1', name: 'Ayşe' }, O: { userId: 'u2', name: 'Deniz' } },
    })

    render(<RoomScreen roomCode="ABC234" />)

    expect(screen.getByTestId('sira-gostergesi')).toHaveAttribute('data-sira', 'yok')
    expect(screen.getByTestId('durum-metni')).toHaveTextContent('Kazandın!')
    expect(screen.getByTestId('hucre-0')).toHaveAttribute('data-kazanan', 'true')
    expect(screen.getByTestId('btn-pes-et')).toBeDisabled()

    await user.click(screen.getByTestId('btn-rovans-teklif'))
    expect(actions.offerRematch).toHaveBeenCalledOnce()
  })

  it('hata varsa hata-mesaji görünür', () => {
    withState({ lastError: 'ROOM_NOT_FOUND' })

    render(<RoomScreen roomCode="ABC234" />)

    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'ROOM_NOT_FOUND')
  })
})
