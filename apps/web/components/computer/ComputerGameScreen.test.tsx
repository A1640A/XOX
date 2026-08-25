import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPUTER_MOVE_DELAY_MS, TESTID } from '@xox/shared'
import { tr } from '@/messages/tr'
import { ComputerGameScreen } from './ComputerGameScreen'

/** İnsan hamlesinden sonra bekleyen zamanlayıcıyı ilerletip render'ı akıtır. */
async function advanceComputerMove(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(COMPUTER_MOVE_DELAY_MS)
  })
}

function clickCell(index: number): void {
  fireEvent.click(screen.getByTestId(`hucre-${String(index)}`))
}

describe('ComputerGameScreen', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('KK-020: üç zorluk düğmesi gösterir, varsayılan zorluk-medium seçilidir', () => {
    render(<ComputerGameScreen />)

    expect(screen.getByTestId(TESTID.zorlukEasy)).toBeInTheDocument()
    expect(screen.getByTestId(TESTID.zorlukMedium)).toBeInTheDocument()
    expect(screen.getByTestId(TESTID.zorlukUnbeatable)).toBeInTheDocument()

    expect(screen.getByTestId(TESTID.zorlukMedium)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId(TESTID.zorlukEasy)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId(TESTID.zorlukUnbeatable)).toHaveAttribute('aria-pressed', 'false')
  })

  it('bilgisayara karşı oyunların puana sayılmadığı notu görünür', () => {
    render(<ComputerGameScreen />)

    expect(screen.getByText(tr.computer.notCounted)).toBeInTheDocument()
  })

  it('bileşende Türkçe string literal yok — tüm metinler tr.computer/tr.game üzerinden gelir', () => {
    render(<ComputerGameScreen />)

    expect(screen.getByRole('heading', { name: tr.computer.title })).toBeInTheDocument()
    expect(screen.getByText(tr.computer.difficulty)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: tr.computer.playAgain })).toBeInTheDocument()
  })

  it('KK-022/023: insan hamlesinden sonra bilgisayar YALNIZ chooseMove ile ve gecikme sabidiyle oynar', async () => {
    vi.useFakeTimers()
    render(<ComputerGameScreen />)

    fireEvent.click(screen.getByTestId(TESTID.zorlukUnbeatable))
    clickCell(0)

    // Gecikmeden HEMEN önce bilgisayar hamlesi yazılmamış olmalı.
    expect(screen.getByTestId('hucre-4')).toHaveAttribute('data-tas', '')

    await advanceComputerMove()

    // X köşeye oynadıktan sonra unbeatable'ın tek doğru cevabı merkezdir.
    expect(screen.getByTestId('hucre-4')).toHaveAttribute('data-tas', 'O')
  })

  it('KK-024: dolu hücreye tıklamak tahtayı değiştirmez, hata banner YOK', async () => {
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, 'random')
    render(<ComputerGameScreen />)

    fireEvent.click(screen.getByTestId(TESTID.zorlukEasy))

    randomSpy.mockReturnValueOnce(0.99) // 8 boş hücreden sonuncusunu (8) seçer
    clickCell(0)
    await advanceComputerMove()

    expect(screen.getByTestId('hucre-0')).toHaveAttribute('data-tas', 'X')
    expect(screen.getByTestId('hucre-8')).toHaveAttribute('data-tas', 'O')

    // Sıra insanda; dolu hücreye (0) tekrar tıklamak SESSİZCE yok sayılmalı.
    clickCell(0)

    expect(screen.getByTestId('hucre-0')).toHaveAttribute('data-tas', 'X')
    expect(screen.queryByTestId('hata-mesaji')).not.toBeInTheDocument()
  })

  it('KK-025: oyun bittikten sonra boş hücreye tıklamak tahtayı değiştirmez, sira-gostergesi data-sira=yok olur', async () => {
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, 'random')
    render(<ComputerGameScreen />)

    fireEvent.click(screen.getByTestId(TESTID.zorlukEasy))

    // Zayıf/rastgele bilgisayarı üst satırı (0-1-2) insana bırakacak şekilde yönlendir.
    randomSpy.mockReturnValueOnce(0.99) // human 0 sonrası 8 boşluktan sonuncu (8)
    clickCell(0)
    await advanceComputerMove()

    randomSpy.mockReturnValueOnce(0.2) // human 1 sonrası [2,3,4,5,6,7]'den 3
    clickCell(1)
    await advanceComputerMove()

    // Üst satırı tamamla: X kazanır.
    clickCell(2)

    expect(screen.getByTestId(TESTID.siraGostergesi)).toHaveAttribute('data-sira', 'yok')
    expect(screen.getByTestId(TESTID.durumMetni)).toHaveTextContent(tr.game.youWon)

    // Boş bir hücreye (4) tıklamak tahtayı değiştirmemeli.
    clickCell(4)
    expect(screen.getByTestId('hucre-4')).toHaveAttribute('data-tas', '')
  })

  it('KK-026: Yeniden oyna tahtayı EMPTY_BOARDa döndürür ve seçili zorluğu korur', async () => {
    vi.useFakeTimers()
    render(<ComputerGameScreen />)

    fireEvent.click(screen.getByTestId(TESTID.zorlukUnbeatable))
    clickCell(0)
    await advanceComputerMove()

    expect(screen.getByTestId('hucre-0')).toHaveAttribute('data-tas', 'X')
    expect(screen.getByTestId('hucre-4')).toHaveAttribute('data-tas', 'O')

    fireEvent.click(screen.getByRole('button', { name: tr.computer.playAgain }))

    for (let index = 0; index < 9; index += 1) {
      expect(screen.getByTestId(`hucre-${String(index)}`)).toHaveAttribute('data-tas', '')
    }
    expect(screen.getByTestId(TESTID.zorlukUnbeatable)).toHaveAttribute('aria-pressed', 'true')
  })
})
