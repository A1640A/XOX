// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ADR-0018 §3 — kill switch okuma kapısı. `game-core`/`shared`/`db`'ye
 * GİRMEZ, yalnız `apps/web`'te yaşar. `logWarn` mock'lanır (KK-010'un
 * dersi: gerçek `@/lib/log` gürültü basıyor, testte tek doğrulanan şey
 * "gürültülü mü sessiz mi düştüğü").
 */
const mockLogWarn = vi.fn()
vi.mock('../log', () => ({ logWarn: mockLogWarn }))

const ENV_VAR = 'XOX_ENABLED_BOARD_SIZES'
const ORIGINAL = process.env[ENV_VAR]

function setEnv(value: string | undefined): void {
  if (value === undefined) {
    delete process.env['XOX_ENABLED_BOARD_SIZES']
  } else {
    process.env[ENV_VAR] = value
  }
}

describe('lib/game/enabled-sizes', () => {
  beforeEach(() => {
    vi.resetModules()
    mockLogWarn.mockReset()
  })

  afterEach(() => {
    setEnv(ORIGINAL)
  })

  it('ayarlanmamışsa (undefined) TÜM boyutları döner — kapalı kalma riski yok (ADR-0018)', async () => {
    setEnv(undefined)
    const { getEnabledBoardSizes } = await import('./enabled-sizes')

    expect(getEnabledBoardSizes()).toStrictEqual([3, 6, 11])
    expect(mockLogWarn).not.toHaveBeenCalled()
  })

  it('boş dize ayarlanmışsa TÜM boyutları döner', async () => {
    setEnv('   ')
    const { getEnabledBoardSizes } = await import('./enabled-sizes')

    expect(getEnabledBoardSizes()).toStrictEqual([3, 6, 11])
  })

  it('kill switch: "3" yalnız 3ü döner — 6/11 kapalı sayılır', async () => {
    setEnv('3')
    const { getEnabledBoardSizes, isBoardSizeEnabled } = await import('./enabled-sizes')

    expect(getEnabledBoardSizes()).toStrictEqual([3])
    expect(isBoardSizeEnabled(3)).toBe(true)
    expect(isBoardSizeEnabled(6)).toBe(false)
    expect(isBoardSizeEnabled(11)).toBe(false)
  })

  it('boşluklu ve tekrarlı liste ("6, 6 ,11") temizlenip tekilleştirilir', async () => {
    setEnv('6, 6 ,11')
    const { getEnabledBoardSizes } = await import('./enabled-sizes')

    expect(getEnabledBoardSizes()).toStrictEqual([6, 11])
  })

  it(
    'bilinmeyen bir boyut ("7") listede varsa sessizce ATLANIR, geçerli olanlar korunur ' +
      '(gürültü yok — kısmi bozukluk)',
    async () => {
      setEnv('3,7')
      const { getEnabledBoardSizes } = await import('./enabled-sizes')

      expect(getEnabledBoardSizes()).toStrictEqual([3])
      expect(mockLogWarn).not.toHaveBeenCalled()
    },
  )

  it(
    'TAMAMEN anlaşılmaz bir değer ("abc") TÜM boyutlara GÜRÜLTÜLÜ biçimde düşer — ' +
      'sessiz düşüş yerine logWarn çağrılır (bir typo tüm oda kurmayı kilitlemesin)',
    async () => {
      setEnv('abc')
      const { getEnabledBoardSizes } = await import('./enabled-sizes')

      expect(getEnabledBoardSizes()).toStrictEqual([3, 6, 11])
      expect(mockLogWarn).toHaveBeenCalledTimes(1)
    },
  )

  it('isBoardSizeEnabled: geçerli ama BOARD_MODES dışı bir sayı (ör. 4) her zaman false döner', async () => {
    setEnv(undefined)
    const { isBoardSizeEnabled } = await import('./enabled-sizes')

    expect(isBoardSizeEnabled(4)).toBe(false)
  })
})
