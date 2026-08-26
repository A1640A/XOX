/**
 * Test kancası sözleşmesi (spec §2.0) — tek kaynak.
 *
 * Web `data-testid`, mobil `testID`, `apps/e2e` `getByTestId` **aynı** sabiti
 * import eder; hiçbir yerde string olarak serpiştirilmez. Kimlikler Türkçedir
 * çünkü kod tanımlayıcısı değil, arayüz kimliğidir.
 *
 * `CTR-BOARD-001` (ADR-0016) bu sözleşmeyi TAM OLARAK BİR KEZ açtı: +5 TESTID
 * (boyut/K seçici + özet), +3 DATA_ATTR (boyut/kazanma/son-hamle). Aynı kart
 * protokolü de açıyor (ADR-0015); iki donmuş sözleşme TEK pencerede açılıp
 * birlikte yeniden donar.
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
  // N > 3'te etiket "Zor" olsa bile bu kanca DEĞİŞMEZ (KK-B47, ADR-0016 §4) —
  // kanca DAVRANIŞA (yenilmezlik yolu) bağlı, görünen metne değil.
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
  /**
   * Üç boyut düğmesi AYRI ayrı anahtarlardır, `boardSizeTestId(n)` fonksiyonu
   * DEĞİLDİR (ADR-0016 reddedilen alternatif): izinli boyutlar donmuş bir
   * üçlüdür (spec §0.1 "başka boyut yok"), bir fonksiyon var olmayan bir
   * boyutun kancasını üretebilir görüntüsü verirdi.
   */
  tahtaBoyut3: 'tahta-boyut-3',
  tahtaBoyut6: 'tahta-boyut-6',
  tahtaBoyut11: 'tahta-boyut-11',
  /** K seçici KAPSAYICI kancası — izinli K kümesi boyuta göre değişir (KK-B12). */
  kazanmaUzunlugu: 'kazanma-uzunlugu',
  /** Oda/bekleme/katılma ekranlarının ÜÇÜNDE de aynı kanca, aynı metin şablonu. */
  oyunAyariOzeti: 'oyun-ayari-ozeti',
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
  /** `tahta` üzerinde — değerler `"3"` | `"6"` | `"11"` (ADR-0016 §3). */
  boyut: 'data-boyut',
  /** `tahta` üzerinde — değerler `"3"` | `"4"` | `"5"` | `"6"`. */
  kazanma: 'data-kazanma',
  /**
   * Hücre üzerinde — YOKLUK-tabanlı (`data-kazanan`/`data-bekliyor` ile aynı
   * konvansiyon): `"true"` ya da nitelik HİÇ yazılmaz, `"false"` YAZILMAZ.
   */
  sonHamle: 'data-son-hamle',
} as const

/** Tahta hücresi: 0..N²−1 → `hucre-0` … `hucre-120` (11×11'de N=11). */
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
