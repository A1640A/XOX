'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { TESTID, type ErrorCode } from '@xox/shared'
import { ErrorBanner } from '@/components/ErrorBanner'
import { tr } from '@/messages/tr'

/**
 * `?donus=` sözleşmesi (docs/memory/conventions.md — AUTH-001 güvenlik
 * denetimi): kullanılmadan önce doğrulanır. `startsWith('/')` göreli bir yol
 * ister, `startsWith('//')` protokol-göreli URL'leri (`//evil.com`, tarayıcıda
 * MUTLAK URL'e çözülür) reddeder. Doğrulama başarısızsa güvenli varsayılan `/`.
 */
function safeRedirectTarget(raw: string | null): string {
  if (raw === null) return '/'
  if (!raw.startsWith('/')) return '/'
  if (raw.startsWith('//')) return '/'
  return raw
}

export function GirisForm(): React.ReactElement {
  const router = useRouter()
  const searchParams = useSearchParams()
  const donus = safeRedirectTarget(searchParams.get('donus'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<ErrorCode | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await signIn('credentials', { email, password, redirect: false })
    setPending(false)
    if (result.error !== undefined) {
      setError('INVALID_CREDENTIALS')
      return
    }
    router.push(donus)
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1" htmlFor="giris-eposta">
        {tr.auth.email}
        <input
          id="giris-eposta"
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
      <label className="flex flex-col gap-1" htmlFor="giris-parola">
        {tr.auth.password}
        <input
          id="giris-parola"
          data-testid={TESTID.girisParola}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
          }}
          className="border-border border p-2"
        />
      </label>
      <button type="submit" data-testid={TESTID.btnGiris} disabled={pending}>
        {pending ? tr.auth.signingIn : tr.auth.signIn}
      </button>
      <ErrorBanner code={error} />
      <p>
        {tr.auth.noAccount} <Link href="/kayit">{tr.auth.signUp}</Link>
      </p>
    </form>
  )
}
