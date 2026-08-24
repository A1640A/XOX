'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { errorResponseSchema, roomCreateResponseSchema, TESTID, type ErrorCode } from '@xox/shared'
import { ErrorBanner } from '@/components/ErrorBanner'
import { JoinCodeField } from '@/components/JoinCodeField'
import { tr } from '@/messages/tr'

/**
 * `useSession()` gerektirdiği için 'use client' — `@/auth` server modülü
 * BİLEREK import edilmez (kart §10, AUTH-001 ile paralellik sözleşmesi).
 * Girişsiz kullanıcı zaten middleware'de `/oyna`, `/oda` gibi korunan
 * rotalardan `/giris`e yönlendirilir (KK-007); burada girişsizken yalnızca
 * "giriş yap/kayıt ol" bağlantıları gösterilir.
 */
export function HomeActions(): React.ReactElement {
  const { data: session, status } = useSession()

  if (status === 'loading') return <p>{tr.common.loading}</p>

  if (session === null) {
    return (
      <nav className="flex gap-4">
        <Link href="/giris">{tr.auth.signIn}</Link>
        <Link href="/kayit">{tr.auth.signUp}</Link>
      </nav>
    )
  }

  return <SignedInActions displayName={session.user.name ?? session.user.email ?? ''} />
}

function SignedInActions({ displayName }: { displayName: string }): React.ReactElement {
  const router = useRouter()
  const [error, setError] = useState<ErrorCode | null>(null)
  const [creating, setCreating] = useState(false)

  async function handleCreateRoom(): Promise<void> {
    setCreating(true)
    setError(null)
    try {
      const response = await fetch('/api/rooms', { method: 'POST' })
      if (!response.ok) {
        // İnceleme MAJOR #6: gövde ham `as` ile CAST edilmiyor — sunucu enum
        // dışı bir kod ya da Vercel'in kendi 504 gövdesini dönerse (ROOM-API-001
        // henüz paralel yazılıyor) `errorResponseSchema` bunu YAKALAR;
        // `KayitForm.tsx` zaten aynı deseni kullanıyordu, burası atlamıştı.
        const body: unknown = await response.json().catch(() => null)
        const parsedError = errorResponseSchema.safeParse(body)
        setError(parsedError.success ? parsedError.data.code : 'SERVER_ERROR')
        return
      }
      const body: unknown = await response.json()
      const parsed = roomCreateResponseSchema.safeParse(body)
      if (!parsed.success) {
        setError('SERVER_ERROR')
        return
      }
      router.push(`/oda/${parsed.data.code}`)
    } catch {
      setError('NETWORK')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p>{tr.home.welcome.replace('{ad}', displayName)}</p>
      <div className="flex gap-2">
        {/* /oyna/bilgisayar Dalga 1'de (W1-01) gelir — bağlantı şimdiden kurulur. */}
        <Link href="/oyna/bilgisayar" data-testid={TESTID.btnBilgisayaraKarsi}>
          {tr.home.playVsComputer}
        </Link>
        <button
          type="button"
          data-testid={TESTID.btnOdaKur}
          onClick={() => {
            void handleCreateRoom()
          }}
          disabled={creating}
        >
          {tr.home.createRoom}
        </button>
      </div>
      <JoinCodeField />
      <ErrorBanner code={error} />
    </div>
  )
}
