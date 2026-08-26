import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPUTER_MOVE_DELAY_MS, TESTID } from '@xox/shared'
import { tr } from '@/messages/tr'
import { ComputerGameScreen } from './ComputerGameScreen'

/**
 * PERF-003: `ComputerGameScreen` artık BİLEREK `next/dynamic` (`ssr: false`)
 * ile `ComputerGameInner`'ı eşzamansız çeker (bkz. dosyanın kendisi + rapor).
 * Bu yüzden ilk render'da içerik YOKTUR — `act(async () => {})` dinamik
 * `import()`in çözülmesini bekleyen mikro görevleri akıtır. Gerçek
 * zamanlayıcılar (`vi.useFakeTimers()` DEĞİL) kullanılır çünkü bu bir
 * `setTimeout` değil, modül çözümlemesidir; sahte zamanlayıcı kurulumu bu
 * yüzden HER ZAMAN bu akıştan SONRA yapılır.
 */
async function renderScreen(): Promise<void> {
  render(<ComputerGameScreen />)
  // Gerçek zamanlayıcılarla beklenir (henüz `vi.useFakeTimers()` KURULMADI) —
  // `waitFor`/`findBy` iç sorgu döngüsü gerçek `setInterval` kullanır.
  await screen.findByTestId(TESTID.zorlukMedium)
}

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

  it('KK-020: üç zorluk düğmesi gösterir, varsayılan zorluk-medium seçilidir', async () => {
    await renderScreen()

    expect(screen.getByTestId(TESTID.zorlukEasy)).toBeInTheDocument()
    expect(screen.getByTestId(TESTID.zorlukMedium)).toBeInTheDocument()
    expect(screen.getByTestId(TESTID.zorlukUnbeatable)).toBeInTheDocument()

    expect(screen.getByTestId(TESTID.zorlukMedium)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId(TESTID.zorlukEasy)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId(TESTID.zorlukUnbeatable)).toHaveAttribute('aria-pressed', 'false')
  })

  it('bilgisayara karşı oyunların puana sayılmadığı notu görünür', async () => {
    await renderScreen()

    expect(screen.getByText(tr.computer.notCounted)).toBeInTheDocument()
  })

  it('render edilen metinler tr.computer/tr.game üzerinden gelir', async () => {
    await renderScreen()

    expect(screen.getByRole('heading', { name: tr.computer.title })).toBeInTheDocument()
    expect(screen.getByText(tr.computer.difficulty)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: tr.computer.playAgain })).toBeInTheDocument()
  })

  /**
   * İNCELEME MINOR DÜZELTMESİ: üstteki test yalnız RENDER EDİLEN metni
   * doğruluyordu — `tr.computer.title` yerine gömme bir `'Bilgisayara karşı'`
   * literal'i konsaydı test AYNEN yeşil kalırdı (render edilen metin gene
   * doğru olurdu, kaynağın NEREDEN geldiği doğrulanmıyordu). Bu test
   * `components/computer/**` ÜRETİM kaynağını (test dosyaları hariç),
   * yorumları çıkardıktan sonra, string literal'lerin içinde Türkçeye özgü
   * bir karakter (ç/ğ/ı/ö/ş/ü ve büyükleri) olup olmadığına bakarak tarar —
   * gömme bir Türkçe cümle hemen hemen her zaman bu karakterlerden birini
   * taşır.
   */
  it('components/computer/** ÜRETİM kaynağında (yorumlar hariç) Türkçe karakterli string literal yoktur', () => {
    const here = dirname(fileURLToPath(import.meta.url))

    function listFiles(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) return listFiles(full)
        return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : []
      })
    }

    function stripComments(source: string): string {
      return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    }

    const TURKISH_CHAR_RE = /[çğıöşüÇĞİÖŞÜ]/
    const STRING_LITERAL_RE = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g

    const productionFiles = listFiles(resolve(here))
      .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
      .filter((f) => f !== fileURLToPath(import.meta.url))

    expect(productionFiles.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const file of productionFiles) {
      const code = stripComments(readFileSync(file, 'utf8'))
      for (const literal of code.matchAll(STRING_LITERAL_RE)) {
        if (TURKISH_CHAR_RE.test(literal[0])) offenders.push(`${file}: ${literal[0]}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('KK-022/023: insan hamlesinden sonra bilgisayar YALNIZ chooseMove ile ve gecikme sabidiyle oynar', async () => {
    await renderScreen()
    vi.useFakeTimers()

    fireEvent.click(screen.getByTestId(TESTID.zorlukUnbeatable))
    clickCell(0)

    // Gecikmeden HEMEN önce bilgisayar hamlesi yazılmamış olmalı.
    expect(screen.getByTestId('hucre-4')).toHaveAttribute('data-tas', '')

    await advanceComputerMove()

    // X köşeye oynadıktan sonra unbeatable'ın tek doğru cevabı merkezdir.
    expect(screen.getByTestId('hucre-4')).toHaveAttribute('data-tas', 'O')
  })

  it('KK-024: dolu hücreye tıklamak tahtayı değiştirmez, hata banner YOK', async () => {
    await renderScreen()
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, 'random')

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
    await renderScreen()
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, 'random')

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
    await renderScreen()
    vi.useFakeTimers()

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

  it('İNCELEME MINOR: ZATEN SEÇİLİ zorluğa tekrar tıklamak süren oyunu SİLMEZ', async () => {
    await renderScreen()
    vi.useFakeTimers()

    // Varsayılan zaten zorluk-medium — bir hamle oyna, sonra AYNI düğmeye
    // (teyit amaçlı) tekrar tıkla.
    clickCell(0)
    await advanceComputerMove()

    const filledBefore = Array.from({ length: 9 }, (_unused, i) =>
      screen.getByTestId(`hucre-${String(i)}`).getAttribute('data-tas'),
    )
    expect(filledBefore.filter((v) => v !== '')).toHaveLength(2) // X + O

    fireEvent.click(screen.getByTestId(TESTID.zorlukMedium))

    const filledAfter = Array.from({ length: 9 }, (_unused, i) =>
      screen.getByTestId(`hucre-${String(i)}`).getAttribute('data-tas'),
    )
    expect(filledAfter).toEqual(filledBefore)
    expect(screen.getByTestId(TESTID.zorlukMedium)).toHaveAttribute('aria-pressed', 'true')
  })

  it('İNCELEME MINOR: reset yarışı — insan hamlesinden hemen sonra Yeniden oyna tıklanırsa, beklemedeki bilgisayar zamanlayıcısı sıfırlanmış tahtaya YAZMAZ', async () => {
    await renderScreen()
    vi.useFakeTimers()

    fireEvent.click(screen.getByTestId(TESTID.zorlukUnbeatable))
    clickCell(0) // X oynar, COMPUTER_MOVE_DELAY_MS'lik bir zamanlayıcı kurulur

    // Zamanlayıcı DOLMADAN (400 ms'nin yalnız yarısı) "Yeniden oyna"ya bas.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMPUTER_MOVE_DELAY_MS / 2)
    })
    fireEvent.click(screen.getByRole('button', { name: tr.computer.playAgain }))

    // Eski zamanlayıcının kalan süresini de ilerlet — `useEffect` deps
    // `[state, difficulty]` sayesinde reset yeni bir `state` ürettiği için
    // ESKİ efekt temizlenmiş (cleanup) olmalı; hiçbir "O" boş tahtaya
    // yazılmamalı (X'siz bir O, kural dışı/imkânsız bir pozisyon olurdu).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMPUTER_MOVE_DELAY_MS)
    })

    for (let index = 0; index < 9; index += 1) {
      expect(screen.getByTestId(`hucre-${String(index)}`)).toHaveAttribute('data-tas', '')
    }
  })

  it('İNCELEME MINOR: StrictMode altında çift mount/effectte zamanlayıcı sızdırmaz — tek bir bilgisayar hamlesi yazılır', async () => {
    render(
      <StrictMode>
        <ComputerGameScreen />
      </StrictMode>,
    )
    await screen.findByTestId(TESTID.zorlukMedium)
    vi.useFakeTimers()

    fireEvent.click(screen.getByTestId(TESTID.zorlukUnbeatable))
    clickCell(0)

    await advanceComputerMove()

    // Sızan bir zamanlayıcı ikinci bir bilgisayar hamlesini X'in HÂLÂ sırası
    // olduğu bir anda tetikleyip kural dışı bir tahta üretebilirdi; StrictMode
    // çift efekt çalıştırsa da yalnız BİR "O" yazılmış olmalı.
    const marks = Array.from({ length: 9 }, (_unused, i) =>
      screen.getByTestId(`hucre-${String(i)}`).getAttribute('data-tas'),
    )
    expect(marks.filter((v) => v === 'O')).toHaveLength(1)
    expect(marks.filter((v) => v === 'X')).toHaveLength(1)
  })
})
