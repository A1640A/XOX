import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GirisForm } from '@/components/auth/GirisForm'
import { inviteRedirect, normalizeInviteCode } from './invite-target'

/**
 * **Oturumsuz davet akışının UÇTAN UCA sondası.**
 *
 * `/davet/<KOD>` → (oturum yok) → `/giris?donus=…` → giriş → `/oda/<KOD>`.
 *
 * Üç parça ayrı ayrı test edilmiş olsa bile aralarındaki KODLAMA sözleşmesi
 * hiçbirinin tek başına göremeyeceği yerde: davet sayfası `donus`u
 * `encodeURIComponent` ile yazıyor, `GirisForm` `useSearchParams` ile
 * ÇÖZÜLMÜŞ hâlini okuyor. Biri kodlamayı bıraksa ya da iki kez kodlasa iki
 * dosyanın kendi testleri de yeşil kalırdı — kullanıcı ise oda kodunu
 * kaybederdi. Burada zincirin tamamı gerçek `GirisForm` ile koşuyor.
 */
const push = vi.fn()
const signIn = vi.fn<(...args: unknown[]) => Promise<{ error?: string } | undefined>>()
let searchParamsValue = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}))

vi.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}))

/** Tarayıcının yaptığını yapar: URL'yi ayrıştırıp sorgu dizesini çıkarır. */
function sorguDizesi(hedef: string): string {
  return new URL(hedef, 'https://xox.example').search.replace(/^\?/, '')
}

describe('davet linki → giriş → oda (oturumsuz akış)', () => {
  it('oda kodu giriş turunda KAYBOLMAZ', async () => {
    const code = normalizeInviteCode('abc234')
    expect(code).not.toBeNull()
    if (code === null) return

    // 1) Davet sayfası oturumsuz kullanıcıyı buraya yolluyor.
    const girisHedefi = inviteRedirect(code, false)
    expect(girisHedefi).toBe('/giris?donus=%2Foda%2FABC234')

    // 2) Tarayıcı `/giris`i o sorgu dizesiyle açıyor.
    searchParamsValue = sorguDizesi(girisHedefi)
    signIn.mockResolvedValue({})
    const user = userEvent.setup()
    render(<GirisForm />)

    await user.type(screen.getByTestId('giris-eposta'), 'ayse@example.com')
    await user.type(screen.getByTestId('giris-parola'), 'gecerli-sifre1')
    await user.click(screen.getByTestId('btn-giris'))

    // 3) Giriş başarılı → kullanıcı DAVET EDİLDİĞİ odaya düşüyor.
    expect(push).toHaveBeenCalledExactlyOnceWith('/oda/ABC234')
  })

  it('başarısız girişte odaya YÖNLENDİRİLMEZ ama hata GÖRÜNÜR', async () => {
    searchParamsValue = sorguDizesi(inviteRedirect('ABC234', false))
    signIn.mockResolvedValue({ error: 'CredentialsSignin' })
    const user = userEvent.setup()
    render(<GirisForm />)

    await user.type(screen.getByTestId('giris-eposta'), 'ayse@example.com')
    await user.type(screen.getByTestId('giris-parola'), 'yanlis-sifre1')
    await user.click(screen.getByTestId('btn-giris'))

    // "Yokluk" iddiasının yanında DOLU kanıt: yönlendirme yok AMA hata var,
    // yani akış gerçekten koştu (form sessizce ölmedi).
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByTestId('hata-mesaji')).toHaveAttribute('data-kod', 'INVALID_CREDENTIALS')
  })

  it('davet zinciri açık yönlendirmeye dönüşemez — donus DAİMA göreli', () => {
    // Kod şemadan geçmeden `inviteRedirect`e giremez, yani `donus` her zaman
    // `/oda/<6 KARAKTER>` biçimindedir; `//evil.com` gibi bir değer üretmenin
    // yolu yok.
    expect(normalizeInviteCode('//evil.com')).toBeNull()
    expect(normalizeInviteCode('https:')).toBeNull()

    const donus = new URL(inviteRedirect('ABC234', false), 'https://xox.example').searchParams.get(
      'donus',
    )
    expect(donus).toMatch(/^\/oda\/[A-Z2-9]{6}$/)
  })
})
