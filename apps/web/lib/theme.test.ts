import { describe, expect, it, vi } from 'vitest'

const getMock = vi.fn<(name: string) => { value: string } | undefined>()

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: getMock }),
}))

describe('resolveTheme', () => {
  it('çerez yokken varsayılan olarak acik döner', async () => {
    getMock.mockReturnValue(undefined)
    const { resolveTheme } = await import('./theme')

    await expect(resolveTheme()).resolves.toBe('acik')
  })

  it('çerez koyu ise koyu döner', async () => {
    getMock.mockReturnValue({ value: 'koyu' })
    const { resolveTheme } = await import('./theme')

    await expect(resolveTheme()).resolves.toBe('koyu')
  })

  it('geçersiz bir çerez değeri acik-a düşer', async () => {
    getMock.mockReturnValue({ value: 'mavi' })
    const { resolveTheme } = await import('./theme')

    await expect(resolveTheme()).resolves.toBe('acik')
  })
})
