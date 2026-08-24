/**
 * Test kancası sözleşmesi (spec §2.0) — tek kaynak.
 *
 * Web `data-testid`, mobil `testID`, `apps/e2e` `getByTestId` **aynı** sabiti
 * import eder; hiçbir yerde string olarak serpiştirilmez. Kimlikler Türkçedir
 * çünkü kod tanımlayıcısı değil, arayüz kimliğidir.
 */
export const TESTID = {
  tahta: 'tahta',
  durumMetni: 'durum-metni',
  siraGostergesi: 'sira-gostergesi',
  odaKodu: 'oda-kodu',
  baglantiDurumu: 'baglanti-durumu',
  sureSayaci: 'sure-sayaci',
  rakipAdi: 'rakip-adi',
  btnPesEt: 'btn-pes-et',
  btnRovansTeklif: 'btn-rovans-teklif',
  btnRovansKabul: 'btn-rovans-kabul',
  btnBilgisayaraKarsi: 'btn-bilgisayara-karsi',
  btnOdaKur: 'btn-oda-kur',
  btnOdayaKatil: 'btn-odaya-katil',
  zorlukEasy: 'zorluk-easy',
  zorlukMedium: 'zorluk-medium',
  zorlukUnbeatable: 'zorluk-unbeatable',
  girisEposta: 'giris-eposta',
  girisParola: 'giris-parola',
  btnGiris: 'btn-giris',
  btnKayit: 'btn-kayit',
  hataMesaji: 'hata-mesaji',
  istatistikGalibiyet: 'istatistik-galibiyet',
  istatistikMaglubiyet: 'istatistik-maglubiyet',
  istatistikBeraberlik: 'istatistik-beraberlik',
  eloPuani: 'elo-puani',
  emojiBalonu: 'emoji-balonu',
} as const

export type TestId = (typeof TESTID)[keyof typeof TESTID]

/**
 * Kancalara eşlik eden veri nitelikleri. Kriterlerin çoğu bunların
 * **değerini** okur (`data-tas="X"`, `data-durum="bagli"`, `data-kod=<HATA>`),
 * bu yüzden nitelik adları da kimlikler kadar sözleşmedir.
 */
export const DATA_ATTR = {
  tas: 'data-tas',
  kazanan: 'data-kazanan',
  bekliyor: 'data-bekliyor',
  sira: 'data-sira',
  durum: 'data-durum',
  kod: 'data-kod',
  tema: 'data-tema',
  kopyalandi: 'data-kopyalandi',
} as const

/** Tahta hücresi: 0..8 → `hucre-0` … `hucre-8`. */
export function cellTestId(index: number): string {
  return `hucre-${String(index)}`
}

/** Emoji paleti düğmesi: 0..7 → `emoji-0` … `emoji-7`. */
export function emojiTestId(index: number): string {
  return `emoji-${String(index)}`
}

/** Sıralama tablosu satırı. */
export function leaderboardRowTestId(row: number): string {
  return `siralama-satir-${String(row)}`
}

/** Maç geçmişi satırı. */
export function historyRowTestId(row: number): string {
  return `gecmis-satir-${String(row)}`
}
