import { ERROR_CODES } from './errors'

/**
 * Türkçe metin ağacının anahtar listesi (spec §5) — tek kaynak.
 *
 * Web ve mobil kendi `messages/tr.ts` dosyalarını tutar (boundaries: mobil
 * web'in ağacını import edemez), ama **ikisi de** bu listeye karşı doğrulanır.
 * Böylece bir ekranda çevrilmiş, diğerinde eksik metin kalması testle yakalanır.
 * Metinlerin kendisi burada değildir: sözleşme anahtar kümesidir, kelimeler
 * uygulamanın işidir.
 */
export const MESSAGE_KEYS = {
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
  /** `errors` grubu hata kodu enum'unun kendisidir — ikisi ayrışamaz (§2.3). */
  errors: ERROR_CODES,
} as const

export type MessageGroup = keyof typeof MESSAGE_KEYS
export type MessageKey<G extends MessageGroup> = (typeof MESSAGE_KEYS)[G][number]

/** `tr.ts` dosyalarının uyması gereken şekil: grup → anahtar → metin. */
export type MessageTree = {
  readonly [G in MessageGroup]: Readonly<Record<MessageKey<G>, string>>
}

/**
 * Bir metin ağacını sözleşmeyle karşılaştırır. Web ve mobil testleri
 * `expect(diffMessageKeys(tr)).toEqual({ missing: [], extra: [] })` yazar;
 * tip kısıtı eksik anahtarı yakalar, bu fonksiyon **fazlasını** da yakalar.
 */
export function diffMessageKeys(
  tree: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): {
  missing: string[]
  extra: string[]
} {
  const missing: string[] = []
  const extra: string[] = []

  for (const [group, keys] of Object.entries(MESSAGE_KEYS)) {
    const subtree = tree[group] ?? {}
    const bilinen: readonly string[] = keys
    for (const key of bilinen) {
      if (!(key in subtree)) missing.push(`${group}.${key}`)
    }
    for (const key of Object.keys(subtree)) {
      if (!bilinen.includes(key)) extra.push(`${group}.${key}`)
    }
  }

  for (const group of Object.keys(tree)) {
    if (!(group in MESSAGE_KEYS)) extra.push(group)
  }

  return { missing, extra }
}
