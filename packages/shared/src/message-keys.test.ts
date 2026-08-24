import { describe, expect, it } from 'vitest'
import { ERROR_CODES } from './errors'
import { MESSAGE_KEYS, type MessageTree, diffMessageKeys } from './message-keys'

/** Spec §5 metin ağacının anahtar listesi — web ve mobil `tr.ts` buna uyar. */
const BEKLENEN = {
  app: ['name', 'tagline'],
  common: [
    'loading',
    'error',
    'retry',
    'cancel',
    'save',
    'copy',
    'copied',
    'back',
    'home',
    'confirm',
  ],
  auth: [
    'signIn',
    'signUp',
    'signOut',
    'email',
    'password',
    'displayName',
    'noAccount',
    'hasAccount',
    'signingIn',
    'mobileOpening',
    'mobileReturn',
  ],
  home: ['playVsComputer', 'createRoom', 'joinRoom', 'codePlaceholder', 'welcome'],
  computer: [
    'title',
    'difficulty',
    'easy',
    'medium',
    'unbeatable',
    'thinking',
    'playAgain',
    'notCounted',
  ],
  room: [
    'title',
    'code',
    'copyCode',
    'copyLink',
    'waitingOpponent',
    'shareHint',
    'opponentJoined',
    'you',
    'opponent',
    'yourSymbol',
    'resign',
    'resignConfirm',
    'leave',
  ],
  game: [
    'yourTurn',
    'opponentTurn',
    'youWon',
    'youLost',
    'draw',
    'wonByResign',
    'lostByResign',
    'wonByTimeout',
    'lostByTimeout',
    'wonByAbandon',
    'timeLeft',
    'hurry',
  ],
  connection: [
    'connected',
    'connecting',
    'disconnected',
    'reconnecting',
    'reconnected',
    'resyncing',
    'opponentDisconnected',
    'opponentReturned',
    'opponentLeft',
    'takenOver',
  ],
  rematch: ['offer', 'accept', 'waiting', 'offered', 'expired', 'cancelled', 'started', 'newRoom'],
  profile: [
    'title',
    'stats',
    'wins',
    'losses',
    'draws',
    'elo',
    'rank',
    'editName',
    'nameSaved',
    'theme',
    'themeLight',
    'themeDark',
  ],
  leaderboard: ['title', 'rank', 'player', 'elo', 'record', 'yourRank', 'empty', 'requirement'],
  history: [
    'title',
    'date',
    'opponent',
    'result',
    'eloChange',
    'win',
    'loss',
    'drawResult',
    'unrated',
    'empty',
  ],
  friends: ['title', 'add', 'requestSent', 'pending', 'accept', 'reject', 'remove', 'empty'],
  chat: ['sendEmoji', 'tooFast'],
  errors: [...ERROR_CODES],
}

describe('MESSAGE_KEYS', () => {
  it('spec §5 ağacının gruplarını sırasıyla verir', () => {
    expect(Object.keys(MESSAGE_KEYS)).toEqual(Object.keys(BEKLENEN))
  })

  it('her grubun anahtar listesi birebir aynıdır', () => {
    expect(MESSAGE_KEYS).toEqual(BEKLENEN)
  })

  it('errors grubu hata kodu enum’uyla aynı kümedir', () => {
    expect(MESSAGE_KEYS.errors).toEqual([...ERROR_CODES])
  })
})

describe('diffMessageKeys', () => {
  const tamAgac = Object.fromEntries(
    Object.entries(BEKLENEN).map(([group, keys]) => [
      group,
      Object.fromEntries(keys.map((k) => [k, 'metin'])),
    ]),
  )

  it('tam ağaçta eksik ya da fazla anahtar bulmaz', () => {
    expect(diffMessageKeys(tamAgac)).toEqual({ missing: [], extra: [] })
  })

  it('eksik anahtarı grup.anahtar biçiminde bildirir', () => {
    const bozuk = { ...tamAgac, chat: { sendEmoji: 'Emoji gönder' } }
    expect(diffMessageKeys(bozuk).missing).toEqual(['chat.tooFast'])
  })

  it('eksik grubun tüm anahtarlarını bildirir', () => {
    const grupsuz = Object.fromEntries(Object.entries(tamAgac).filter(([g]) => g !== 'chat'))
    expect(diffMessageKeys(grupsuz).missing).toEqual(['chat.sendEmoji', 'chat.tooFast'])
  })

  it('fazla anahtarı bildirir', () => {
    const bozuk = { ...tamAgac, chat: { sendEmoji: 'x', tooFast: 'y', wink: 'z' } }
    expect(diffMessageKeys(bozuk).extra).toEqual(['chat.wink'])
  })

  it('fazla grubu bildirir', () => {
    expect(diffMessageKeys({ ...tamAgac, uydurma: { a: 'b' } }).extra).toEqual(['uydurma'])
  })
})

describe('MessageTree tipi', () => {
  it('grup başına anahtar kümesini derleme zamanında kısıtlar', () => {
    const chat: MessageTree['chat'] = { sendEmoji: 'Emoji gönder', tooFast: 'Biraz yavaş' }
    expect(Object.keys(chat)).toEqual(['sendEmoji', 'tooFast'])
  })
})
