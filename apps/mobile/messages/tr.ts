import type { MessageTree } from '@xox/shared'

/**
 * Mobilin kendi Türkçe metin ağacı. Web'in `apps/web/messages/tr.ts`
 * dosyasını IMPORT ETMEZ (boundaries: mobil web'e bağımlı olamaz) — eşbiçim
 * kopyadır, tek kaynak `@xox/shared`'daki `MESSAGE_KEYS` anahtar listesidir.
 * `tr.test.ts` bu ağacı `diffMessageKeys` ile iki yönlü doğrular ve web
 * ağacıyla yer tutucu paritesini karşılaştırır.
 *
 * Metin kuralları (spec §5): ikinci tekil şahıs ("sen"), "siz" yasak; hata
 * mesajları ne olduğunu ve ne yapılacağını söyler; yer tutucular `{ad}`,
 * `{saniye}`, `{tas}` biçimindedir.
 */
export const tr: MessageTree = {
  app: { name: 'XOX', tagline: 'Arkadaşınla ya da bilgisayara karşı oyna' },

  common: {
    loading: 'Yükleniyor…',
    error: 'Bir şeyler ters gitti',
    retry: 'Tekrar dene',
    cancel: 'Vazgeç',
    save: 'Kaydet',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    back: 'Geri',
    home: 'Ana sayfa',
    confirm: 'Onayla',
  },

  auth: {
    signIn: 'Giriş yap',
    signUp: 'Kayıt ol',
    signOut: 'Çıkış yap',
    email: 'E-posta',
    password: 'Parola',
    displayName: 'Görünen ad',
    noAccount: 'Hesabın yok mu?',
    hasAccount: 'Zaten hesabın var mı?',
    signingIn: 'Giriş yapılıyor…',
    mobileOpening: 'Tarayıcıda giriş açılıyor…',
    mobileReturn: 'Girişin tamamlandı, uygulamaya dönülüyor…',
  },

  home: {
    playVsComputer: 'Bilgisayara karşı',
    createRoom: 'Oda kur',
    joinRoom: 'Odaya katıl',
    codePlaceholder: 'Oda kodu (6 hane)',
    welcome: 'Hoş geldin, {ad}',
  },

  computer: {
    title: 'Bilgisayara karşı',
    difficulty: 'Zorluk',
    easy: 'Kolay',
    medium: 'Orta',
    unbeatable: 'Yenilmez',
    thinking: 'Bilgisayar düşünüyor…',
    playAgain: 'Yeniden oyna',
    notCounted: 'Bilgisayara karşı oyunlar istatistiklere ve puana sayılmaz.',
  },

  room: {
    title: 'Oda',
    code: 'Oda kodu',
    copyCode: 'Kodu kopyala',
    copyLink: 'Linki kopyala',
    waitingOpponent: 'Rakip bekleniyor',
    shareHint: 'Kodu arkadaşına gönder, aynı odaya katılsın.',
    opponentJoined: '{ad} odaya katıldı.',
    you: 'Sen',
    opponent: 'Rakip',
    yourSymbol: 'Senin taşın: {tas}',
    resign: 'Pes et',
    resignConfirm: 'Pes etmek istediğine emin misin? Oyunu kaybedeceksin.',
    leave: 'Odadan çık',
  },

  game: {
    yourTurn: 'Sıra sende',
    opponentTurn: 'Sıra rakipte',
    youWon: 'Kazandın!',
    youLost: 'Kaybettin.',
    draw: 'Berabere.',
    wonByResign: 'Rakibin pes etti — kazandın!',
    lostByResign: 'Pes ettin, oyunu kaybettin.',
    wonByTimeout: 'Rakibin süresi doldu — kazandın!',
    lostByTimeout: 'Süren doldu, oyunu kaybettin.',
    wonByAbandon: 'Rakibin oyunu terk etti — kazandın!',
    timeLeft: 'Kalan süre: {saniye} sn',
    hurry: 'Acele et!',
  },

  connection: {
    connected: 'Bağlı',
    connecting: 'Bağlanıyor…',
    disconnected: 'Bağlantı koptu',
    reconnecting: 'Yeniden bağlanılıyor…',
    reconnected: 'Bağlantı geri geldi.',
    resyncing: 'Oyun durumu alınıyor…',
    opponentDisconnected:
      'Rakibin bağlantısı koptu — {saniye} sn içinde dönmezse oyunu kazanırsın.',
    opponentReturned: 'Rakip geri döndü.',
    opponentLeft: 'Rakip ayrıldı.',
    takenOver: 'Bu hesapla başka bir sekmeden bağlanıldı. Oyun burada devam etmiyor.',
  },

  rematch: {
    offer: 'Rövanş iste',
    accept: 'Rövanşı kabul et',
    waiting: 'Rövanş yanıtı bekleniyor…',
    offered: 'Rakip rövanş istiyor.',
    expired: 'Rövanş teklifi zaman aşımına uğradı.',
    cancelled: 'Rakip ayrıldığı için rövanş iptal oldu.',
    started: 'Rövanş başladı — taşlar yer değiştirdi.',
    newRoom: 'Yeni oda kur',
  },

  profile: {
    title: 'Profil',
    stats: 'İstatistikler',
    wins: 'Galibiyet',
    losses: 'Mağlubiyet',
    draws: 'Beraberlik',
    elo: 'Puan',
    rank: 'Sıralama',
    editName: 'Adı düzenle',
    nameSaved: 'Adın güncellendi.',
    theme: 'Tema',
    themeLight: 'Açık',
    themeDark: 'Koyu',
  },

  leaderboard: {
    title: 'Sıralama',
    rank: 'Sıra',
    player: 'Oyuncu',
    elo: 'Puan',
    record: 'G/M/B',
    yourRank: 'Senin sıran',
    empty: 'Henüz sıralamaya giren oyuncu yok.',
    requirement: 'Sıralamaya girmek için en az 5 puanlı oyun oynamalısın.',
  },

  history: {
    title: 'Maç geçmişi',
    date: 'Tarih',
    opponent: 'Rakip',
    result: 'Sonuç',
    eloChange: 'Puan',
    win: 'Galibiyet',
    loss: 'Mağlubiyet',
    drawResult: 'Beraberlik',
    unrated: 'Puansız',
    empty: 'Henüz tamamlanmış oyunun yok.',
  },

  friends: {
    title: 'Arkadaşlar',
    add: 'Arkadaş ekle',
    requestSent: 'Arkadaşlık isteği gönderildi.',
    pending: 'Bekleyen istekler',
    accept: 'Kabul et',
    reject: 'Reddet',
    remove: 'Çıkar',
    empty: 'Henüz arkadaşın yok. Bir oyun bitir ve rakibini ekle.',
  },

  chat: {
    sendEmoji: 'Emoji gönder',
    tooFast: 'Biraz yavaş — çok hızlı emoji gönderiyorsun.',
  },

  errors: {
    UNAUTHENTICATED: 'Bu sayfa için giriş yapmalısın.',
    INVALID_CREDENTIALS: 'E-posta veya parola hatalı.',
    EMAIL_TAKEN: 'Bu e-posta zaten kayıtlı.',
    WEAK_PASSWORD: 'Parola en az 8 karakter olmalı.',
    INVALID_EMAIL: 'Geçerli bir e-posta adresi gir.',
    INVALID_NAME: 'Görünen ad 2 ile 40 karakter arasında olmalı.',
    ROOM_NOT_FOUND: 'Böyle bir oda yok. Kodu kontrol et.',
    ROOM_FULL: 'Bu oda dolu.',
    INVALID_CODE: 'Oda kodu 6 haneli olmalı ve yalnızca harf-rakam içermeli.',
    CODE_GENERATION_FAILED: 'Şu anda oda kurulamıyor, birazdan tekrar dene.',
    NOT_YOUR_TURN: 'Sıra sende değil.',
    CELL_OCCUPIED: 'Bu hücre dolu.',
    GAME_OVER: 'Oyun bitti.',
    INVALID_MESSAGE: 'Geçersiz istek.',
    SESSION_TAKEOVER: 'Bu hesapla başka bir yerden bağlanıldı.',
    REMATCH_EXPIRED: 'Rövanş teklifi zaman aşımına uğradı.',
    RATE_LIMITED: 'Çok hızlısın, biraz bekle.',
    NOT_FRIENDS_ELIGIBLE: 'Yalnızca birlikte oyun bitirdiğin oyuncuları ekleyebilirsin.',
    SERVER_ERROR: 'Sunucuda bir sorun oluştu. Tekrar dene.',
    NETWORK: 'Bağlantı sorunu. İnternetini kontrol et.',
    INVALID_BOARD_CONFIG: 'Seçilen tahta boyutu ve kazanma uzunluğu birlikte geçerli değil.',
  },
}
