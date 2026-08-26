import { describe, expect, it } from 'vitest'
import {
  DATA_ATTR,
  TESTID,
  cellTestId,
  emojiTestId,
  historyRowTestId,
  leaderboardRowTestId,
} from './testids'

describe('TESTID (spec §2.0 kanca sözleşmesi + ADR-0016 CTR-BOARD-001 eki)', () => {
  it('tablonun tamamını birebir dışa verir (26 -> 31, ADR-0016)', () => {
    expect(TESTID).toEqual({
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
      tahtaBoyut3: 'tahta-boyut-3',
      tahtaBoyut6: 'tahta-boyut-6',
      tahtaBoyut11: 'tahta-boyut-11',
      kazanmaUzunlugu: 'kazanma-uzunlugu',
      oyunAyariOzeti: 'oyun-ayari-ozeti',
    })
  })

  it('tam 31 anahtar taşır (çıplak sayı — gotcha örüntü 2)', () => {
    expect(Object.keys(TESTID)).toHaveLength(31)
  })

  it('kimlikler benzersizdir', () => {
    const values = Object.values(TESTID)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('cellTestId', () => {
  it('0..8 için hucre-<i> döner', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(cellTestId)).toEqual([
      'hucre-0',
      'hucre-1',
      'hucre-2',
      'hucre-3',
      'hucre-4',
      'hucre-5',
      'hucre-6',
      'hucre-7',
      'hucre-8',
    ])
  })

  it('11×11 üst sınırı da çalışır (CTR-BOARD-001: kod DEĞİŞMEDİ, yalnız yorum)', () => {
    expect(cellTestId(120)).toBe('hucre-120')
  })
})

describe('numaralı kancalar', () => {
  it('emojiTestId 0..7 için emoji-<n> döner', () => {
    expect(emojiTestId(0)).toBe('emoji-0')
    expect(emojiTestId(7)).toBe('emoji-7')
  })

  it('leaderboardRowTestId siralama-satir-<n> döner', () => {
    expect(leaderboardRowTestId(1)).toBe('siralama-satir-1')
  })

  it('historyRowTestId gecmis-satir-<n> döner', () => {
    expect(historyRowTestId(20)).toBe('gecmis-satir-20')
  })
})

describe('DATA_ATTR (spec §2.0 + ADR-0016 CTR-BOARD-001 eki)', () => {
  it('spec §2.0 veri niteliklerini tek kaynakta tutar (8 -> 11, ADR-0016)', () => {
    expect(DATA_ATTR).toEqual({
      tas: 'data-tas',
      kazanan: 'data-kazanan',
      bekliyor: 'data-bekliyor',
      sira: 'data-sira',
      durum: 'data-durum',
      kod: 'data-kod',
      tema: 'data-tema',
      kopyalandi: 'data-kopyalandi',
      boyut: 'data-boyut',
      kazanma: 'data-kazanma',
      sonHamle: 'data-son-hamle',
    })
  })

  it('tam 11 anahtar taşır (çıplak sayı)', () => {
    expect(Object.keys(DATA_ATTR)).toHaveLength(11)
  })
})
