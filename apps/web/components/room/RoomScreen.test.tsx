import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialRoomClientState, type RoomClientState } from '@xox/shared'

/**
 * İnceleme minor bulgusu: dondurmanın (DONDURMA #1) asıl sözleşmesi
 * GÖVDELER değil PROP YÜZEYİDİR — W1-03/W2-01/W3-03/W3-04 bu dosyayı hiç
 * AÇMADAN kendi bileşen dosyalarını dolduracak, bu yalnızca doğru prop'ların
 * ŞİMDİDEN geçtiğini kilitlersek işe yarar. İskelet bileşenler (`TurnTimer`,
 * `EmojiTray`, `FriendAddButton`, `OpponentLeftBanner`, `InviteLink`) burada
 * casus bileşenlere çevrilir; aldıkları prop'lar iddia edilir.
 */
vi.mock('./TurnTimer', () => ({ TurnTimer: vi.fn(() => null) }))
vi.mock('./EmojiTray', () => ({ EmojiTray: vi.fn(() => null) }))
vi.mock('./FriendAddButton', () => ({ FriendAddButton: vi.fn(() => null) }))
vi.mock('./OpponentLeftBanner', () => ({ OpponentLeftBanner: vi.fn(() => null) }))
vi.mock('./InviteLink', () => ({ InviteLink: vi.fn(() => null) }))

const { RoomScreen } = await import('./RoomScreen')
const { TurnTimer } = await import('./TurnTimer')
const { EmojiTray } = await import('./EmojiTray')
const { FriendAddButton } = await import('./FriendAddButton')
const { OpponentLeftBanner } = await import('./OpponentLeftBanner')
const { InviteLink } = await import('./InviteLink')

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

function lastPropsOf(mockFn: (...args: never[]) => unknown): unknown {
  return vi.mocked(mockFn).mock.calls.at(-1)?.[0]
}

describe('RoomScreen', () => {
  // `@testing-library/user-event`'in `setup()`'ı KENDİ `navigator.clipboard`
  // sahtesini kuruyor (jsdom'da yerel destek yok) ve `beforeEach`te tanımlanan
  // bir stub'ı EZİYOR — bu yüzden clipboard stub'ı her testte `userEvent.setup()`
  // çağrısından SONRA kurulur (`stubClipboard` yardımcı fonksiyonu).
  function stubClipboard(): { writeText: ReturnType<typeof vi.fn> } {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    return { writeText }
  }

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

  it('durum-metni ekran okuyucuya duyurulacak şekilde role=status aria-live=polite taşır', () => {
    withState({ connection: 'bagli', you: 'X', status: { kind: 'playing', turn: 'X' } })

    render(<RoomScreen roomCode="ABC234" />)

    const statusEl = screen.getByTestId('durum-metni')
    expect(statusEl).toHaveAttribute('role', 'status')
    expect(statusEl).toHaveAttribute('aria-live', 'polite')
  })

  it('you===null iken rakip-adi kendi taşını GÖSTERMEZ, bekliyor metnini gösterir (minor bulgu)', () => {
    // İlk `state` mesajından ÖNCE düşen bir `opponent:joined` senaryosu:
    // `you` henüz bilinmiyor. Eski kod `players.X`'i her zaman "rakip"
    // sayıyordu — bu, kullanıcının KENDİ adını "rakip" olarak göstermesine
    // yol açardı.
    withState({
      connection: 'bagli',
      you: null,
      status: { kind: 'playing', turn: 'X' },
      players: { X: { userId: 'u1', name: 'Ayşe' }, O: null },
    })

    render(<RoomScreen roomCode="ABC234" />)

    expect(screen.getByTestId('rakip-adi')).toHaveTextContent('Rakip bekleniyor')
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
    // Kriter 12: kazanan çizginin TAM ÜÇ hücresi işaretlenir, fazlası değil.
    for (const index of [0, 1, 2]) {
      expect(screen.getByTestId(`hucre-${String(index)}`)).toHaveAttribute('data-kazanan', 'true')
    }
    const isaretli = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((index) =>
      screen.getByTestId(`hucre-${String(index)}`).hasAttribute('data-kazanan'),
    )
    expect(isaretli).toStrictEqual([0, 1, 2])
    expect(screen.getByTestId('btn-pes-et')).toBeDisabled()

    await user.click(screen.getByTestId('btn-rovans-teklif'))
    expect(actions.offerRematch).toHaveBeenCalledOnce()
  })

  it('hata varsa hata-mesaji görünür', () => {
    withState({ lastError: 'ROOM_NOT_FOUND' })

    render(<RoomScreen roomCode="ABC234" />)

    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'ROOM_NOT_FOUND')
  })

  describe('pes etme onayı (MAJOR düzeltmesi — KK-054)', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('btn-pes-et yalnız window.confirm ONAYLANDIĞINDA actions.resign çağırır', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm')
      withState({
        connection: 'bagli',
        you: 'X',
        status: { kind: 'playing', turn: 'X' },
        players: { X: { userId: 'u1', name: 'Ayşe' }, O: { userId: 'u2', name: 'Deniz' } },
      })

      render(<RoomScreen roomCode="ABC234" />)

      confirmSpy.mockReturnValueOnce(false)
      await user.click(screen.getByTestId('btn-pes-et'))
      expect(confirmSpy).toHaveBeenCalledOnce()
      expect(actions.resign).not.toHaveBeenCalled()

      confirmSpy.mockReturnValueOnce(true)
      await user.click(screen.getByTestId('btn-pes-et'))
      expect(actions.resign).toHaveBeenCalledOnce()
    })
  })

  it('"Kodu kopyala" oda kodunu panoya yazar', async () => {
    const user = userEvent.setup()
    const { writeText } = stubClipboard()
    withState({ connection: 'bagli', you: 'X', status: { kind: 'playing', turn: 'X' } })

    render(<RoomScreen roomCode="ABC234" />)

    await user.click(screen.getByRole('button', { name: 'Kodu kopyala' }))

    expect(writeText).toHaveBeenCalledExactlyOnceWith('ABC234')
  })

  it('bağlantı koptuğunda "Tekrar dene" actions.reconnect çağırır (KK-062)', async () => {
    const user = userEvent.setup()
    withState({ connection: 'kopuk', you: 'X', status: { kind: 'playing', turn: 'X' } })

    render(<RoomScreen roomCode="ABC234" />)

    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(actions.reconnect).toHaveBeenCalledOnce()
  })

  it('size/winLength taşımayan eski oda {3,3} olarak görünür — "undefined" sızmaz (kart §Sert şart 3)', () => {
    // `initialRoomClientState()` zaten `{size:3, winLength:3}` varsayılanını
    // taşır (ilk `state` mesajından ÖNCEki geçici değer) — override YOK.
    withState({ connection: 'bagli', you: 'X', status: { kind: 'playing', turn: 'X' } })

    render(<RoomScreen roomCode="ABC234" />)

    const ozet = screen.getByTestId('oyun-ayari-ozeti')
    expect(ozet).toHaveTextContent('3×3 tahta · 3 taş yan yana')
    expect(ozet.textContent).not.toContain('undefined')
  })

  it('oyun-ayari-ozeti odanın GERÇEK size/winLength değerini gösterir', () => {
    withState({
      connection: 'bagli',
      you: 'X',
      status: { kind: 'playing', turn: 'X' },
      size: 11,
      winLength: 5,
    })

    render(<RoomScreen roomCode="ABC234" />)

    expect(screen.getByTestId('oyun-ayari-ozeti')).toHaveTextContent('11×11 tahta · 5 taş yan yana')
  })

  it("11×11 gibi 3×3 dışı boyutlarda dar-ekran ipucu render edilir, 3×3'te edilmez", () => {
    withState({
      connection: 'bagli',
      you: 'X',
      status: { kind: 'playing', turn: 'X' },
      size: 11,
      winLength: 5,
    })
    const { unmount } = render(<RoomScreen roomCode="ABC234" />)
    expect(
      screen.getByText('Tahtayı daha rahat görmek için cihazını yatay çevir.'),
    ).toBeInTheDocument()
    unmount()

    withState({ connection: 'bagli', you: 'X', status: { kind: 'playing', turn: 'X' } })
    render(<RoomScreen roomCode="ABC234" />)
    expect(
      screen.queryByText('Tahtayı daha rahat görmek için cihazını yatay çevir.'),
    ).not.toBeInTheDocument()
  })

  it('durum-metni rakibin son hamlesinin FARKINI sıra metniyle birlikte duyurur (ADR-0017 §7)', () => {
    withState({
      connection: 'bagli',
      you: 'X',
      status: { kind: 'playing', turn: 'X' },
      size: 11,
      winLength: 5,
      lastMove: { index: 26, by: 'O' },
    })

    render(<RoomScreen roomCode="ABC234" />)

    expect(screen.getByTestId('durum-metni')).toHaveTextContent(
      'Rakip 3. satır 5. sütuna oynadı. Sıra sende',
    )
  })

  it('DONDURMA #1 sözleşmesi: iskelet bileşenler gerçek state alanlarına bağlı mount edilir', () => {
    withState({
      connection: 'bagli',
      you: 'X',
      status: { kind: 'playing', turn: 'X' },
      turnDeadline: 12_345,
      serverOffsetMs: 42,
      graceEndsAt: 6_789,
      lastEmoji: { from: 'O', emoji: '🔥', at: 111 },
      players: { X: { userId: 'u1', name: 'Ayşe' }, O: { userId: 'u2', name: 'Deniz' } },
    })

    render(<RoomScreen roomCode="ABC234" />)

    expect(lastPropsOf(TurnTimer)).toStrictEqual({ deadline: 12_345, serverOffsetMs: 42 })
    expect(lastPropsOf(OpponentLeftBanner)).toStrictEqual({
      graceEndsAt: 6_789,
      serverOffsetMs: 42,
      // UI-005: bu state 'playing' olduğu için false. Prop'un DOĞRU bağlandığını
      // (yalnız var olduğunu değil) alttaki ayrı test kanıtlıyor — burada true
      // olsaydı bu satır sessizce yanlış bir kablolamayı da kabul ederdi.
      gameEnded: false,
    })
    expect(lastPropsOf(InviteLink)).toStrictEqual({ roomCode: 'ABC234' })
    expect(lastPropsOf(EmojiTray)).toStrictEqual({
      onSend: actions.sendEmoji,
      lastEmoji: { from: 'O', emoji: '🔥', at: 111 },
    })
    expect(lastPropsOf(FriendAddButton)).toStrictEqual({ opponentId: 'u2', visible: false })
  })

  it(
    'UI-005: oyun BİTTİĞİNDE OpponentLeftBanner gameEnded=true alır — grace dolup terk ' +
      'galibiyetiyle sonuçlanmak ile GERÇEK yeniden bağlanma aynı sinyali (graceEndsAt null) ' +
      'üretiyor; ayrımı yalnız bu prop taşıyor',
    () => {
      withState({
        connection: 'bagli',
        you: 'X',
        graceEndsAt: null,
        serverOffsetMs: 42,
        status: { kind: 'won', winner: 'X', line: null, reason: 'abandon' },
      })

      render(<RoomScreen roomCode="ABC234" />)

      expect(lastPropsOf(OpponentLeftBanner)).toMatchObject({ gameEnded: true })
    },
  )
})
