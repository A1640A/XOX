'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { errorCodeSchema, TESTID, type ErrorCode } from '@xox/shared'
import { ErrorBanner } from '@/components/ErrorBanner'
import { tr } from '@/messages/tr'

/**
 * Auth.js Credentials sağlayıcısı kullanıcı OLUŞTURMAZ (ADR-0009 B) — kayıt
 * `/api/auth/register` REST uç noktasıdır (AUTH-001, bu görevden ÖNCE bitti).
 * KK-001: başarılı kayıttan sonra oturum otomatik açılır (`signIn`) ve `/`e
 * yönlendirilir.
 *
 * E-posta/parola alanları spec §2.0'daki `giris-eposta`/`giris-parola`
 * testid'lerini PAYLAŞIR — tablo bunları tekil değil "auth ekranları" (çoğul)
 * için tanımlar; `btn-giris`/`btn-kayit` ekrana özgü kalan tek çift.
 */
export function KayitForm(): React.ReactElement {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<ErrorCode | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setPending(true)
    setError(null)

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    })

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      const bodyRecord = body as { code?: unknown } | null
      const parsedCode = errorCodeSchema.safeParse(bodyRecord?.code)
      setError(parsedCode.success ? parsedCode.data : 'SERVER_ERROR')
      setPending(false)
      return
    }

    const signInResult = await signIn('credentials', { email, password, redirect: false })
    setPending(false)
    if (signInResult.error !== undefined) {
      setError('SERVER_ERROR')
      return
    }
    router.push('/')
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1" htmlFor="kayit-ad">
        {tr.auth.displayName}
        <input
          id="kayit-ad"
          required
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value)
          }}
          className="border-border border p-2"
        />
      </label>
      <label className="flex flex-col gap-1" htmlFor="kayit-eposta">
        {tr.auth.email}
        <input
          id="kayit-eposta"
          data-testid={TESTID.girisEposta}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
          }}
          className="border-border border p-2"
        />
      </label>
      <label className="flex flex-col gap-1" htmlFor="kayit-parola">
        {tr.auth.password}
        <input
          id="kayit-parola"
          data-testid={TESTID.girisParola}
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
          }}
          className="border-border border p-2"
        />
      </label>
      <button type="submit" data-testid={TESTID.btnKayit} disabled={pending}>
        {tr.auth.signUp}
      </button>
      <ErrorBanner code={error} />
      <p>
        {tr.auth.hasAccount} <Link href="/giris">{tr.auth.signIn}</Link>
      </p>
    </form>
  )
}
