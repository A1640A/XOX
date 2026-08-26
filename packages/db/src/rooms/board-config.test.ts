import { describe, expect, it, vi } from 'vitest'
import { resolveBoardConfig } from './board-config'

describe('resolveBoardConfig', () => {
  it('KK-B31: iki alan da yoksa {3,3} SESSİZCE döner — gürültü YOK', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(resolveBoardConfig({ size: undefined, winLength: undefined })).toStrictEqual({
      size: 3,
      winLength: 3,
    })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('geçerli {6,4} birebir taşınır', () => {
    expect(resolveBoardConfig({ size: 6, winLength: 4 })).toStrictEqual({ size: 6, winLength: 4 })
  })

  it('geçerli {11,6} birebir taşınır — sıfır olmayan bir vaka (nötr eleman körlüğüne karşı)', () => {
    expect(resolveBoardConfig({ size: 11, winLength: 6 })).toStrictEqual({
      size: 11,
      winLength: 6,
    })
  })

  it('size var, winLength yok → o boyutun defaultWinLength değerine düşer, GÜRÜLTÜ YOK', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(resolveBoardConfig({ size: 11, winLength: undefined })).toStrictEqual({
      size: 11,
      winLength: 5,
    })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('KK-B32: bilinmeyen size → GÜRÜLTÜ + {3,3} varsayılana düşer', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(resolveBoardConfig({ size: 7, winLength: 4 })).toStrictEqual({ size: 3, winLength: 3 })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0]?.[0])).toContain('resolveBoardConfig')
    spy.mockRestore()
  })

  it('KK-B32: size ile uyuşmayan winLength → GÜRÜLTÜ + {3,3} varsayılana düşer', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // size:3 modu yalnız winLength:3 kabul eder — 5 bu modda GEÇERSİZDİR.
    expect(resolveBoardConfig({ size: 3, winLength: 5 })).toStrictEqual({ size: 3, winLength: 3 })
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('KK-B32: winLength var ama size yok (yarı bozuk kayıt) → GÜRÜLTÜ + varsayılan', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // size undefined -> DEFAULT_BOARD_CONFIG.size(3) kullanılır; o modun tek
    // izinli winLength'i 3'tür, 6 REDDEDİLİR.
    expect(resolveBoardConfig({ size: undefined, winLength: 6 })).toStrictEqual({
      size: 3,
      winLength: 3,
    })
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('`doc.size ?? 3` deseni HİÇBİR YERDE yok — sonda: KOD satırlarında (yorumlar hariç) eşleşme sıfır', async () => {
    const fs = await import('node:fs/promises')
    const source = await fs.readFile(new URL('./board-config.ts', import.meta.url), 'utf8')
    // Yorum satırlarını ele (gotcha: "grep yorum satırlarını eşleştirip yanlış
    // bulgu üretti") — bu dosyanın kendi başlık yorumu `?? 3` deseninden
    // BAHSEDER, KOD satırında yazmaz. Sonda yalnız kod satırlarına bakar.
    const codeOnly = source
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n')
    expect(codeOnly).not.toMatch(/\?\?\s*3/)
  })
})
