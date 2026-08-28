'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { DEFAULT_BOARD_CONFIG, type BoardConfig } from '@xox/game-core'
import { errorResponseSchema, roomCreateResponseSchema, TESTID, type ErrorCode } from '@xox/shared'
import { BoardConfigPicker } from '@/components/board-config/BoardConfigPicker'
import { ErrorBanner } from '@/components/ErrorBanner'
import { JoinCodeField } from '@/components/JoinCodeField'
import { tr } from '@/messages/tr'

export interface HomeActionsProps {
  /**
   * Bugün SUNULAN tahta boyutları (ADR-0018 §3 kill switch) — bir Server
   * Component'te (`app/page.tsx`) `getEnabledBoardSizes()` ile ÇÖZÜLÜP prop
   * olarak buraya geçirilir. Bu bileşen `apps/web/lib/game/enabled-sizes.ts`'i
   * KENDİSİ import ETMEZ: o dosya operasyonel bir ortam değişkenine bakar ve
   * yalnız sunucuda anlamlıdır, istemci paketine sızdırılmaz (RSC varsayılanı).
   */
  readonly enabledSizes: readonly number[]
}

/**
 * `useSession()` gerektirdiği için 'use client' — `@/auth` server modülü
 * BİLEREK import edilmez (kart §10, AUTH-001 ile paralellik sözleşmesi).
 * Girişsiz kullanıcı zaten middleware'de `/oyna`, `/oda` gibi korunan
 * rotalardan `/giris`e yönlendirilir (KK-007); burada girişsizken yalnızca
 * "giriş yap/kayıt ol" bağlantıları gösterilir.
 */
export function HomeActions({ enabledSizes }: HomeActionsProps): React.ReactElement {
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

  return (
    <SignedInActions
      displayName={session.user.name ?? session.user.email ?? ''}
      enabledSizes={enabledSizes}
    />
  )
}

function SignedInActions({
  displayName,
  enabledSizes,
}: {
  displayName: string
  enabledSizes: readonly number[]
}): React.ReactElement {
  const router = useRouter()
  const [error, setError] = useState<ErrorCode | null>(null)
  const [creating, setCreating] = useState(false)
  const [config, setConfig] = useState<BoardConfig>(DEFAULT_BOARD_CONFIG)

  async function handleCreateRoom(): Promise<void> {
    setCreating(true)
    setError(null)
    try {
      // `config` DAİMA `BoardConfigPicker`ın SUNDUĞU (yani `enabledSizes`
      // içindeki) bir kombinasyondur — kapalı bir boyut istemci tarafında
      // seçilebilir hâle bile gelmez (kart §Sert şart 2). Sunucu
      // (`isBoardSizeEnabled`, API-BOARD-001) yine de BAĞIMSIZ olarak
      // doğrular; istemci doğrulaması tek savunma hattı değildir.
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(config),
      })
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
        {/* `prefetch={false}` — AUTH-004. `/oyna/:path*` `middleware.ts`in matcher'ında,
            yani bu KORUMALI bir rota. Otomatik prefetch arka planda bir oturum isteği
            başlatır; "Çıkış yap"tan SONRA tamamlanırsa kendi `Set-Cookie`'siyle silmeyi
            geri alır ve oturum canlı kalır. `prefetch-guard.test.ts` bu kuralı tüm
            bileşenlerde dayatıyor — kaldırırsan o test kırmızıya döner. */}
        <Link href="/oyna/bilgisayar" prefetch={false} data-testid={TESTID.btnBilgisayaraKarsi}>
          {tr.home.playVsComputer}
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{tr.boardConfig.title}</h2>
        <BoardConfigPicker value={config} onChange={setConfig} enabledSizes={enabledSizes} />
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
