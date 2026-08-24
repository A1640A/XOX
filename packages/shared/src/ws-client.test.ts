import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WS_HEARTBEAT_MS, WS_RECONNECT_BASE_MS } from './constants'
import type { RoomClientState } from './room-client'
import { WS_CLOSE } from './ws-close'
import type { ServerMessage, StateMessage } from './ws-protocol'
import {
  type RoomWsClient,
  type RoomWsClientDeps,
  type SocketLike,
  createRoomWsClient,
} from './ws-client'

/**
 * Sahte soket: `SocketLike`'ı gerçekler. Bu dosyada `WebSocket` sözcüğü hiç
 * geçmez — taşıma istemcisinin soketi yalnız enjekte edilen fabrikadan aldığı
 * mekanik kanıt budur.
 */
class SahteSoket implements SocketLike {
  public readonly gonderilen: string[] = []
  public readonly kapanislar: (number | undefined)[] = []
  public onopen: (() => void) | null = null
  public onmessage: ((event: { data: unknown }) => void) | null = null
  public onclose: ((event: { code: number }) => void) | null = null

  public constructor(public readonly url: string) {}

  public send(data: string): void {
    this.gonderilen.push(data)
  }

  public close(code?: number): void {
    this.kapanislar.push(code)
  }

  // ─── test tarafı tetikleyiciler ───
  public ac(): void {
    this.onopen?.()
  }

  public getir(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  public hamCerceve(data: unknown): void {
    this.onmessage?.({ data })
  }

  public sunucuKapatti(code: number): void {
    this.onclose?.({ code })
  }

  public get mesajlar(): unknown[] {
    return this.gonderilen.map((satir) => JSON.parse(satir) as unknown)
  }
}

function tamDurumMesaji(patch: Partial<StateMessage> = {}): StateMessage {
  return {
    type: 'state',
    roomCode: 'ABC234',
    board: [null, null, null, null, null, null, null, null, null],
    status: { kind: 'playing', turn: 'X' },
    players: { X: { userId: 'u1', name: 'Ayse' }, O: null },
    you: 'X',
    version: 7,
    turnDeadline: null,
    graceEndsAt: null,
    rematch: null,
    serverTime: 1_000,
    ...patch,
  }
}

interface Kurulum {
  readonly client: RoomWsClient
  readonly soketler: SahteSoket[]
  readonly degisimler: RoomClientState[]
  readonly reauthDenemeleri: number[]
}

function kur(overrides: Partial<RoomWsClientDeps> = {}): Kurulum {
  const soketler: SahteSoket[] = []
  const degisimler: RoomClientState[] = []
  const reauthDenemeleri: number[] = []
  const deps: RoomWsClientDeps = {
    url: 'wss://ornek/api/rooms/ABC234/ws',
    roomCode: 'ABC234',
    createSocket: (url) => {
      const soket = new SahteSoket(url)
      soketler.push(soket)
      return soket
    },
    now: () => Date.now(),
    rng: () => 0.5,
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    },
    onChange: (state) => degisimler.push(state),
    onReauth: (attempt) => reauthDenemeleri.push(attempt),
    ...overrides,
  }
  return { client: createRoomWsClient(deps), soketler, degisimler, reauthDenemeleri }
}

function son(soketler: SahteSoket[]): SahteSoket {
  const soket = soketler.at(-1)
  if (soket === undefined) throw new Error('hiç soket açılmadı')
  return soket
}

/** Açık, tam durumu alınmış bir istemci. */
function bagli(overrides: Partial<RoomWsClientDeps> = {}): Kurulum {
  const kurulum = kur(overrides)
  kurulum.client.connect()
  son(kurulum.soketler).ac()
  son(kurulum.soketler).getir(tamDurumMesaji())
  return kurulum
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('soket enjeksiyonu', () => {
  it('soketi yalnız enjekte edilen fabrikayla açar', () => {
    const { client, soketler } = kur()
    client.connect()

    expect(soketler).toHaveLength(1)
    expect(son(soketler).url).toBe('wss://ornek/api/rooms/ABC234/ws')
  })

  it('bağlanma denemesi durumu baglaniyor yapar, açılış bagli yapar', () => {
    const { client, soketler } = kur()
    client.connect()
    expect(client.getState().connection).toBe('baglaniyor')

    son(soketler).ac()
    expect(client.getState().connection).toBe('bagli')
  })

  it('durum her değişimde yayınlanır', () => {
    const { client, degisimler } = bagli()

    expect(degisimler.at(-1)).toEqual(client.getState())
    expect(degisimler.length).toBeGreaterThan(1)
  })
})

describe('gelen çerçeveler', () => {
  it('geçerli mesaj indirgeyiciye işlenir', () => {
    const tahta = [null, 'X', null, null, null, null, null, null, null] as StateMessage['board']
    const { client, soketler } = bagli()
    son(soketler).getir(tamDurumMesaji({ board: tahta, version: 8 }))

    expect(client.getState().board[1]).toBe('X')
    expect(client.getState().version).toBe(8)
  })

  it('saat sapması enjekte edilen now ile hesaplanır', () => {
    vi.setSystemTime(10_000)
    const { client, soketler } = kur()
    client.connect()
    son(soketler).ac()
    son(soketler).getir(tamDurumMesaji({ serverTime: 12_500 }))

    expect(client.getState().serverOffsetMs).toBe(2_500)
  })

  it('bozuk JSON durumu değiştirmez', () => {
    const { client, soketler } = bagli()
    const once = client.getState()
    son(soketler).hamCerceve('{ bozuk')

    expect(client.getState()).toBe(once)
  })

  it('şemaya uymayan mesaj yoksayılır', () => {
    const { client, soketler } = bagli()
    const once = client.getState()
    son(soketler).hamCerceve(JSON.stringify({ type: 'move:applied', index: 99 }))

    expect(client.getState()).toBe(once)
  })

  it('metin olmayan çerçeve yoksayılır', () => {
    const { client, soketler } = bagli()
    const once = client.getState()
    son(soketler).hamCerceve(new Uint8Array([1, 2, 3]))

    expect(client.getState()).toBe(once)
  })
})

describe('giden mesajlar', () => {
  it('kullanıcı olayı sokete JSON olarak gider', () => {
    const { client, soketler } = bagli()
    client.dispatch({ type: 'ui:cell', index: 4 })

    expect(son(soketler).mesajlar).toEqual([{ type: 'move', index: 4 }])
  })

  it('kapı kapalıysa sokete hiçbir şey yazılmaz', () => {
    const { client, soketler } = bagli()
    client.dispatch({ type: 'ui:cell', index: 4 })
    client.dispatch({ type: 'ui:cell', index: 5 })

    expect(son(soketler).mesajlar).toEqual([{ type: 'move', index: 4 }])
  })

  it('resync efekti oda koduyla join gönderir', () => {
    const { client, soketler } = bagli()
    son(soketler).getir({ type: 'move:applied', index: 3, by: 'O', version: 12 })

    expect(son(soketler).mesajlar).toEqual([{ type: 'join', roomCode: 'ABC234' }])
    expect(client.getState().version).toBe(7)
  })

  it('kapanmış soketten gelen geç mesaj gönderim üretmez', () => {
    const { soketler } = bagli()
    const soket = son(soketler)
    soket.sunucuKapatti(1006)
    soket.getir({ type: 'move:applied', index: 3, by: 'O', version: 12 })

    expect(soket.mesajlar).toEqual([])
  })

  // S4: RN köprüsünde olay sırası garanti değil; ölü soketten düşen bir `state`
  // istemciyi sürümce GERİ sardırırdı.
  it('ölü soketten gelen geç durum mesajı sürümü geri sarmaz', () => {
    const { client, soketler } = bagli()
    const soket = son(soketler)
    soket.getir(tamDurumMesaji({ version: 20 }))
    soket.sunucuKapatti(1006)

    soket.getir(tamDurumMesaji({ version: 7 }))

    expect(client.getState().version).toBe(20)
    expect(client.getState().connection).not.toBe('bagli')
  })
})

describe('heartbeat (KK-060)', () => {
  it('WS_HEARTBEAT_MS aralığıyla ping gönderir', () => {
    const { soketler } = bagli()
    vi.advanceTimersByTime(WS_HEARTBEAT_MS)
    expect(son(soketler).mesajlar).toEqual([{ type: 'ping' }])

    son(soketler).getir({ type: 'pong' })
    vi.advanceTimersByTime(WS_HEARTBEAT_MS)
    expect(son(soketler).mesajlar).toEqual([{ type: 'ping' }, { type: 'ping' }])
  })

  it('2 heartbeat içinde pong gelmezse kopuk sayılır ve yeniden bağlanılır', () => {
    const { client, soketler } = bagli()
    const ilk = son(soketler)

    vi.advanceTimersByTime(WS_HEARTBEAT_MS)
    expect(client.getState().connection).toBe('bagli')

    vi.advanceTimersByTime(WS_HEARTBEAT_MS)
    expect(client.getState().connection).toBe('kopuk')
    expect(ilk.kapanislar).toEqual([WS_CLOSE.IDLE_TIMEOUT])

    vi.advanceTimersByTime(WS_RECONNECT_BASE_MS)
    expect(soketler).toHaveLength(2)
  })

  it('pong geldikçe bağlantı kopuk sayılmaz', () => {
    const { client, soketler } = bagli()

    for (let tur = 0; tur < 4; tur += 1) {
      vi.advanceTimersByTime(WS_HEARTBEAT_MS)
      son(soketler).getir({ type: 'pong' })
    }

    expect(client.getState().connection).toBe('bagli')
    expect(soketler).toHaveLength(1)
  })

  it('nabız kaybında soketin kendi kapanış olayı ikinci kez işlenmez', () => {
    const { client, soketler } = bagli()
    const ilk = son(soketler)
    vi.advanceTimersByTime(WS_HEARTBEAT_MS * 2)
    const sayac = client.getState().reconnectAttempt

    ilk.sunucuKapatti(1006)

    expect(client.getState().reconnectAttempt).toBe(sayac)
  })

  it('kapanmış bağlantıda nabız zamanlayıcısı durur', () => {
    const { soketler } = bagli()
    const ilk = son(soketler)
    ilk.sunucuKapatti(WS_CLOSE.NOT_FOUND)

    vi.advanceTimersByTime(WS_HEARTBEAT_MS * 10)

    expect(ilk.mesajlar).toEqual([])
  })
})

describe('yeniden bağlanma', () => {
  it('4499 planlı rotasyonda gecikmesiz bağlanılır', () => {
    const { client, soketler } = bagli()
    son(soketler).sunucuKapatti(WS_CLOSE.ROTATE)

    expect(client.getState().connection).toBe('baglaniyor')
    vi.advanceTimersByTime(0)
    expect(soketler).toHaveLength(2)
  })

  it('geçici kopmada üstel geri çekilme uygulanır ve rng enjekte edilir', () => {
    const { client, soketler } = bagli({ rng: () => 0.5 })
    son(soketler).sunucuKapatti(1006)
    expect(client.getState().connection).toBe('kopuk')

    vi.advanceTimersByTime(WS_RECONNECT_BASE_MS - 1)
    expect(soketler).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(soketler).toHaveLength(2)
    expect(client.getState().connection).toBe('baglaniyor')

    son(soketler).sunucuKapatti(1006)
    vi.advanceTimersByTime(WS_RECONNECT_BASE_MS * 2 - 1)
    expect(soketler).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(soketler).toHaveLength(3)
  })

  it('4409 devralmada hiç yeniden bağlanılmaz', () => {
    const { client, soketler } = bagli()
    son(soketler).sunucuKapatti(WS_CLOSE.SESSION_TAKEOVER)

    vi.advanceTimersByTime(60_000)

    expect(client.getState().connection).toBe('devredildi')
    expect(soketler).toHaveLength(1)
  })

  it('kalıcı kapanışta yeniden bağlanılmaz', () => {
    const { client, soketler } = bagli()
    son(soketler).sunucuKapatti(WS_CLOSE.NOT_FOUND)

    vi.advanceTimersByTime(60_000)

    expect(client.getState().lastError).toBe('ROOM_NOT_FOUND')
    expect(soketler).toHaveLength(1)
  })

  it('4401 kör bağlanma yerine yeni bilet ister', () => {
    const { client, soketler, reauthDenemeleri } = bagli()
    son(soketler).sunucuKapatti(WS_CLOSE.UNAUTHENTICATED)

    vi.advanceTimersByTime(60_000)
    expect(reauthDenemeleri).toEqual([0])
    expect(soketler).toHaveLength(1)

    client.connect('wss://ornek/api/rooms/ABC234/ws?ticket=yeni')
    expect(soketler).toHaveLength(2)
    expect(son(soketler).url).toContain('ticket=yeni')
  })

  // S6: bozuk bilet üretilirse çağıran pes edebilmeli; deneme sayısı ona verilir.
  it('bozuk bilet döngüsünde deneme sayısı çağırana taşınır', () => {
    const { client, soketler, reauthDenemeleri } = bagli()

    for (let tur = 0; tur < 3; tur += 1) {
      son(soketler).sunucuKapatti(WS_CLOSE.UNAUTHENTICATED)
      client.connect('wss://ornek/api/rooms/ABC234/ws?ticket=bozuk')
      son(soketler).ac()
    }

    expect(reauthDenemeleri).toEqual([0, 1, 2])
  })
})

describe('terk edilen soket', () => {
  // S2: React StrictMode effect'i iki kez koşturur; çift tık ve 4401 sonrası
  // onReauth yarışı da aynı yolu tetikler. Kapatılmayan bağlantı sunucunun
  // 4408 eşiğine kadar bir Fluid çağrısını tutar ve sahte takeover yazdırır.
  it('ikinci connect() birinci soketi KAPATIR', () => {
    const { client, soketler } = kur()
    client.connect()
    const ilk = son(soketler)
    client.connect()

    expect(soketler).toHaveLength(2)
    expect(ilk.kapanislar).toEqual([1000])
  })

  it('terk edilen soketin geç kapanışı yeni bağlantıyı etkilemez', () => {
    const { client, soketler } = kur()
    client.connect()
    const ilk = son(soketler)
    client.connect()
    son(soketler).ac()

    ilk.sunucuKapatti(1006)

    expect(client.getState().connection).toBe('bagli')
    expect(soketler).toHaveLength(2)
  })
})

describe('close()', () => {
  it('terminal geçiş üretir — getState() yalan söylemez', () => {
    const { client, degisimler } = bagli()
    const oncekiSayi = degisimler.length
    client.close()

    expect(client.getState().connection).toBe('kopuk')
    expect(degisimler.length).toBeGreaterThan(oncekiSayi)
  })

  // S3: kapanıştan sonra kapı hâlâ açıksa `pending` kalıcı kurulur, mesaj
  // sessizce yutulur; kullanıcıya "bekliyor" yanar, sunucuya hiçbir şey gitmez.
  it('kapandıktan sonra hücreye basmak pending KURMAZ', () => {
    const { client, soketler } = bagli()
    const ilk = son(soketler)
    client.close()

    client.dispatch({ type: 'ui:cell', index: 4 })

    expect(client.getState().pending).toBeNull()
    expect(ilk.mesajlar).toEqual([])
  })

  it('kapanış yeniden bağlanma zamanlamaz', () => {
    const { client, soketler } = bagli()
    client.close()

    vi.advanceTimersByTime(60_000)

    expect(soketler).toHaveLength(1)
  })

  it('soketi kapatır, zamanlayıcıları durdurur', () => {
    const { client, soketler } = bagli()
    const ilk = son(soketler)
    client.close()

    expect(ilk.kapanislar).toEqual([1000])

    vi.advanceTimersByTime(60_000)
    expect(ilk.mesajlar).toEqual([])
    expect(soketler).toHaveLength(1)
  })

  it('bekleyen yeniden bağlanmayı iptal eder', () => {
    const { client, soketler } = bagli()
    son(soketler).sunucuKapatti(1006)
    client.close()

    vi.advanceTimersByTime(60_000)

    expect(soketler).toHaveLength(1)
  })

  it('hiç bağlanmadan çağrılabilir', () => {
    const { client, soketler } = kur()

    expect(() => {
      client.close()
    }).not.toThrow()
    expect(soketler).toHaveLength(0)
  })
})
