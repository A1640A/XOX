import { describe, expect, it } from 'vitest'
import { MIDDLEWARE_MATCHER, PROTECTED_ROUTE_PREFIXES } from '@/auth.config'
import { inviteRedirect, normalizeInviteCode } from './invite-target'

describe('/davet middleware korumasının DIŞINDA — KK-121`in ön koşulu', () => {
  it('korunan önek listesinde ve matcher`da /davet YOKTUR', () => {
    expect(PROTECTED_ROUTE_PREFIXES).not.toContain('/davet')
    expect(MIDDLEWARE_MATCHER.some((yol) => yol.startsWith('/davet'))).toBe(false)
    // "Yokluk" iddiasının pozitif eşi: listeler BOŞ değil ve `/oda` GERÇEKTEN
    // korunuyor — davet linkinin `/oda/<KOD>`e işaret edememesinin sebebi bu.
    expect(PROTECTED_ROUTE_PREFIXES).toContain('/oda')
    expect(MIDDLEWARE_MATCHER).toContain('/oda/:path*')
  })
})

describe('normalizeInviteCode — KK-121', () => {
  it('küçük harfli ve boşluklu kodu normalleştirir', () => {
    expect(normalizeInviteCode('abc234')).toBe('ABC234')
    expect(normalizeInviteCode('  abc234  ')).toBe('ABC234')
    expect(normalizeInviteCode('ABC234')).toBe('ABC234')
  })

  it('şemaya uymayan kodu null döner', () => {
    // Kısa · uzun · alfabe dışı harf (I/O/0/1 karışmasın diye alfabede yok) ·
    // noktalama · boş. Beklentiler ELLE yazılı, şemadan türetilmiş değil.
    expect(normalizeInviteCode('abc')).toBeNull()
    expect(normalizeInviteCode('ABC2345')).toBeNull()
    expect(normalizeInviteCode('ABC23I')).toBeNull()
    expect(normalizeInviteCode('ABC23!')).toBeNull()
    expect(normalizeInviteCode('')).toBeNull()
  })

  it('yol ayracı içeren bir kod ASLA geçmez (yol enjeksiyonu kapalı)', () => {
    expect(normalizeInviteCode('../../x')).toBeNull()
    expect(normalizeInviteCode('AB/234')).toBeNull()
    // Pozitif eş: aynı uzunlukta geçerli bir kod GEÇİYOR — yani kontrol
    // "her şeyi reddet" değil.
    expect(normalizeInviteCode('AB2345')).toBe('AB2345')
  })
})

describe('inviteRedirect — KK-121', () => {
  it('girişliyse doğrudan odaya yollar', () => {
    expect(inviteRedirect('ABC234', true)).toBe('/oda/ABC234')
  })

  it('girişsizse /giris`e yollar ve oda yolunu donus`ta TAŞIR', () => {
    expect(inviteRedirect('ABC234', false)).toBe('/giris?donus=%2Foda%2FABC234')
  })

  it('donus`taki değer çözüldüğünde tam olarak oda yoludur (kod kaybolmaz)', () => {
    const hedef = inviteRedirect('ABC234', false)
    const donus = new URL(hedef, 'https://xox.example').searchParams.get('donus')

    expect(donus).toBe('/oda/ABC234')
    // `GirisForm`un `safeRedirectTarget` sözleşmesi (conventions.md): göreli
    // olmalı ve protokol-göreli OLMAMALI. Üretilen değer ikisini de sağlıyor.
    expect(donus?.startsWith('/')).toBe(true)
    expect(donus?.startsWith('//')).toBe(false)
  })
})
