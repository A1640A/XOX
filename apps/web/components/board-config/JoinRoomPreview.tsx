'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  errorResponseSchema,
  roomCodeSchema,
  roomStateResponseSchema,
  TESTID,
  type ErrorCode,
  type RoomStateResponse,
} from '@xox/shared'
import { ErrorBanner } from '@/components/ErrorBanner'
import { tr } from '@/messages/tr'
import { GameConfigSummary } from './GameConfigSummary'
import { normalizeRoomCodeInput } from './room-code-input'

/**
 * `/oda/katil`'in TEK sahibi (kart §Sert şart 4, SB-09/US-B03): "katılan
 * oyuncu odaya girmeden önce ne oynayacağını görür". `JoinCodeField.tsx`
 * (Home'un hızlı-katıl alanı) BİLEREK burada YENİDEN KULLANILMAZ — o bileşen
 * kod doğrulanır doğrulanmaz TEK adımda yönlendirir, önizleme için bir ara
 * durumu yoktur ve bu kartın çakışma kümesi dışındadır (W1-05'in kırılgan
 * paste/normalize testleri riske atılmaz). Bunun yerine kod tam biçime
 * ulaştığı anda `GET /api/rooms/[code]` ile bir ÖNİZLEME çekilir; `oyun-ayari-
 * ozeti` (oda/bekleme ekranlarıyla AYNI kanca, AYNI metin şablonu) burada da
 * gösterilir ve yönlendirme yalnız kullanıcı "Katıl"a bastığında olur.
 */
export function JoinRoomPreview(): React.ReactElement {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<RoomStateResponse | null>(null)
  const [error, setError] = useState<ErrorCode | null>(null)

  // React'in "render sırasında state ayarlama" deseni (react-hooks/set-state-
  // in-effect'in önerdiği düzeltme #2 — "derived event": bir prop/state
  // değiştiğinde başka bir state'i sıfırlamak bir EFEKT değil, RENDER'ın
  // kendisidir). `code` değiştiği anda eski önizleme/hata artık GEÇERSİZDİR;
  // bunu bir `useEffect` içinde koşulsuzca `setState` ile yapmak yerine,
  // render'ın kendisinde "önceki kod" ile karşılaştırıp senkronize ediyoruz.
  const [previewedFor, setPreviewedFor] = useState(code)
  if (code !== previewedFor) {
    setPreviewedFor(code)
    setPreview(null)
    setError(null)
  }

  useEffect(() => {
    const parsed = roomCodeSchema.safeParse(code)
    if (!parsed.success) return

    let cancelled = false

    // `FriendsContent.tsx`'teki AYNI iptal deseni (adlandırılmış async
    // fonksiyon + `void`, IIFE değil).
    async function loadPreview(roomCode: string): Promise<void> {
      setLoading(true)
      try {
        const response = await fetch(`/api/rooms/${roomCode}`)
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null)
          const parsedError = errorResponseSchema.safeParse(body)
          if (!cancelled) setError(parsedError.success ? parsedError.data.code : 'SERVER_ERROR')
          return
        }
        const body: unknown = await response.json()
        const parsedRoom = roomStateResponseSchema.safeParse(body)
        if (cancelled) return
        if (!parsedRoom.success) {
          setError('SERVER_ERROR')
          return
        }
        // Aynı ayrım `JoinCodeField.tsx`'teki gibi (KK-033): `canJoin:false`
        // bitmiş bir odada "dolu" değil "bitmiş" anlamına gelir.
        if (parsedRoom.data.state === 'finished') {
          setError('GAME_OVER')
          return
        }
        if (!parsedRoom.data.canJoin) {
          setError('ROOM_FULL')
          return
        }
        setPreview(parsedRoom.data)
      } catch {
        if (!cancelled) setError('NETWORK')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPreview(parsed.data)

    return () => {
      cancelled = true
    }
  }, [code])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (preview === null) return
    router.push(`/oda/${preview.code}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="join-code" className="text-sm font-medium">
          {tr.home.codePlaceholder}
        </label>
        <input
          id="join-code"
          value={code}
          onChange={(event) => {
            setCode(normalizeRoomCodeInput(event.target.value))
          }}
          placeholder={tr.home.codePlaceholder}
          className="border-border border p-2"
        />
      </div>

      {loading && <p>{tr.common.loading}</p>}
      {preview !== null && (
        <GameConfigSummary config={{ size: preview.size, winLength: preview.winLength }} />
      )}

      <button type="submit" data-testid={TESTID.btnOdayaKatil} disabled={preview === null}>
        {tr.home.joinRoom}
      </button>

      <ErrorBanner code={error} />
    </form>
  )
}
