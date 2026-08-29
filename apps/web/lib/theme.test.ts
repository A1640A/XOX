import { afterEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn<(name: string) => { value: string } | undefined>()

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: getMock }),
}))

/**
 * W2-05 — `@xox/db`'nin GERÇEK modülü DEĞİL, yalnız `connectDb`/`User.findById`
 * mock'lanır (KK-010 disiplini: `resolveTheme`'in kendisi gerçek kodla çalışır).
 * `.select('theme').lean()` zinciri taklit edilir.
 */
const mockConnectDb = vi.fn()
const mockFindById = vi.fn()
vi.mock('@xox/db', () => ({
  connectDb: mockConnectDb,
  User: { findById: mockFindById },
}))

function mockDbTheme(result: { theme: string } | null): void {
  mockFindById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(result) }),
  })
}

function mockDbThrows(error: Error): void {
  mockFindById.mockReturnValue({
    select: () => ({ lean: () => Promise.reject(error) }),
  })
}

describe('resolveTheme', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('çerez yokken varsayılan olarak acik döner (userId verilmezse)', async () => {
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

  it('W2-05 KIRMIZI ÖNCE: çerez YOKKEN ve DB-de users.theme=koyu iken oturumlu kullanıcı için koyu döner', async () => {
    getMock.mockReturnValue(undefined)
    mockDbTheme({ theme: 'koyu' })
    const { resolveTheme } = await import('./theme')

    await expect(resolveTheme('u1')).resolves.toBe('koyu')
    expect(mockConnectDb).toHaveBeenCalledOnce()
    expect(mockFindById).toHaveBeenCalledWith('u1')
  })

  it('çerez YOKKEN userId bir Promise olarak da kabul edilir (layout.tsx paralel auth() paylaşımı)', async () => {
    getMock.mockReturnValue(undefined)
    mockDbTheme({ theme: 'koyu' })
    const { resolveTheme } = await import('./theme')

    await expect(resolveTheme(Promise.resolve('u1'))).resolves.toBe('koyu')
  })

  it('anonim ziyaretçide (userId yok, çerez yok) DB-ye HİÇ gidilmez', async () => {
    getMock.mockReturnValue(undefined)
    const { resolveTheme } = await import('./theme')

    await expect(resolveTheme(undefined)).resolves.toBe('acik')
    expect(mockConnectDb).not.toHaveBeenCalled()
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it('çerez VARKEN oturumlu kullanıcı için bile DB-ye gidilmez (hızlı yol korunur)', async () => {
    getMock.mockReturnValue({ value: 'koyu' })
    const { resolveTheme } = await import('./theme')

    await expect(resolveTheme('u1')).resolves.toBe('koyu')
    expect(mockConnectDb).not.toHaveBeenCalled()
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it('kullanıcı DB-de yoksa (silinmiş ama çerez yok/userId elde) acik-a düşer, patlamaz', async () => {
    getMock.mockReturnValue(undefined)
    mockDbTheme(null)
    const { resolveTheme } = await import('./theme')

    await expect(resolveTheme('silinmis-kullanici')).resolves.toBe('acik')
  })

  it('DB sorgusu düşerse (bağlantı hatası vb.) tema çözümü PATLAMAZ, acik-a düşer', async () => {
    getMock.mockReturnValue(undefined)
    mockDbThrows(new Error('Mongo bağlantı hatası'))
    const { resolveTheme } = await import('./theme')

    await expect(resolveTheme('u1')).resolves.toBe('acik')
  })

  it('connectDb-in kendisi düşerse de tema çözümü PATLAMAZ, acik-a düşer', async () => {
    getMock.mockReturnValue(undefined)
    mockConnectDb.mockRejectedValueOnce(new Error('Atlas erişilemez'))
    const { resolveTheme } = await import('./theme')

    await expect(resolveTheme('u1')).resolves.toBe('acik')
  })
})

/**
 * PERF-008 — `proxy.ts`'in tema-çerezi kararını verdiği fonksiyon.
 * `next/headers` KULLANMAZ (proxy `NextRequest.cookies`'ten geçer), bu
 * yüzden `getMock`'a hiç dokunulmaz; yalnız `@xox/db` mock'u paylaşılır.
 */
describe('resolveThemeCookieValue (proxy.ts tema-çerezi kararı)', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('mevcut çerez zaten geçerliyse (koyu/acik) undefined döner — DB-ye HİÇ gidilmez', async () => {
    const { resolveThemeCookieValue } = await import('./theme')

    await expect(resolveThemeCookieValue('koyu', 'u1')).resolves.toBeUndefined()
    expect(mockConnectDb).not.toHaveBeenCalled()
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it('geçersiz bir çerez (fast-path DIŞI) yine de DB-ye gitmeyi TETİKLER — yalnız acik/koyu hızlı yol sayılır', async () => {
    mockDbTheme({ theme: 'koyu' })
    const { resolveThemeCookieValue } = await import('./theme')

    await expect(resolveThemeCookieValue('mavi', 'u1')).resolves.toBe('koyu')
    expect(mockConnectDb).toHaveBeenCalledOnce()
  })

  it('userId boş string ise undefined döner — DB-ye HİÇ gidilmez', async () => {
    const { resolveThemeCookieValue } = await import('./theme')

    await expect(resolveThemeCookieValue(undefined, '')).resolves.toBeUndefined()
    expect(mockConnectDb).not.toHaveBeenCalled()
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it('DB-de kullanıcı silinmişse (null) yine de acik döner (patlamaz), bu geçerli bir çözümdür', async () => {
    mockDbTheme(null)
    const { resolveThemeCookieValue } = await import('./theme')

    await expect(resolveThemeCookieValue(undefined, 'silinmis-kullanici')).resolves.toBe('acik')
  })

  it('DB sorgusu düşerse undefined döner — çerez YAZILMAZ (kendi kendini onarma korunur)', async () => {
    mockDbThrows(new Error('Mongo bağlantı hatası'))
    const { resolveThemeCookieValue } = await import('./theme')

    await expect(resolveThemeCookieValue(undefined, 'u1')).resolves.toBeUndefined()
  })

  it('connectDb-in kendisi düşerse de undefined döner — çerez YAZILMAZ', async () => {
    mockConnectDb.mockRejectedValueOnce(new Error('Atlas erişilemez'))
    const { resolveThemeCookieValue } = await import('./theme')

    await expect(resolveThemeCookieValue(undefined, 'u1')).resolves.toBeUndefined()
  })

  /**
   * KAPANIŞ ŞARTI (kart PERF-008) — çerezsiz, oturumlu bir kullanıcı için
   * ARDIŞIK İKİ "istek" kurulur (proxy.ts'in aynı fonksiyonu iki kez, ikinci
   * seferinde birincinin döndürdüğü çerezle çağırdığı senaryonun birebir
   * taklidi). DB-çağrısı casusu: BİRİNCİ istekte 1, İKİNCİ istekte 0.
   */
  it('ARDIŞIK İKİ istek: birinci DB-ye 1 kez gider ve çerez döner, ikinci (o çerezle) DB-ye HİÇ gitmez', async () => {
    mockDbTheme({ theme: 'koyu' })
    const { resolveThemeCookieValue } = await import('./theme')

    // 1. istek — proxy.ts'e göre gelen istekte tema çerezi henüz yok.
    const first = await resolveThemeCookieValue(undefined, 'u1')
    expect(first).toBe('koyu')
    expect(mockConnectDb).toHaveBeenCalledOnce()
    expect(mockFindById).toHaveBeenCalledOnce()

    // Tarayıcı artık `Set-Cookie: xox-tema=koyu`yu saklıyor — proxy.ts bir
    // SONRAKİ istekte bu değeri `req.cookies.get(...)`ten okuyacak.
    // 2. istek — aynı kullanıcı, şimdi çerez MEVCUT.
    const second = await resolveThemeCookieValue(first, 'u1')
    expect(second).toBeUndefined() // "çerez zaten var, yazma" sinyali
    expect(mockConnectDb).toHaveBeenCalledOnce() // HÂLÂ bir kez — ikinci istekte ARTMADI
    expect(mockFindById).toHaveBeenCalledOnce() // HÂLÂ bir kez
  })
})
