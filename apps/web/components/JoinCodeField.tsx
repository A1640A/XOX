'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  roomCodeSchema,
  roomStateResponseSchema,
  errorResponseSchema,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  TESTID,
  type ErrorCode,
} from '@xox/shared'
import { tr } from '@/messages/tr'
import { ErrorBanner } from './ErrorBanner'

/**
 * Oda kodu girişi (KK-030/033/034). Ana sayfada (`HomeActions`) ve
 * `/oda/katil`'de BİREBİR aynı bileşen kullanılır — "derin bağlanabilir eş"
 * gereksinimi (W1-04 kriter 1) bu paylaşım sayesinde otomatik sağlanır.
 *
 * Normalleştirme her tuş vuruşunda olur (`onChange`), gönderimde DEĞİL:
 * `ROOM_CODE_ALPHABET` dışı her karakter (boşluk dâhil, çünkü boşluk da
 * alfabede yok) anında yutulur, `ROOM_CODE_LENGTH`'ten fazlası kabul
 * edilmez. Bu yüzden gönderim anında `value` zaten ya boş/eksik ya da tam
 * geçerli bir kod hâlindedir; `roomCodeSchema.safeParse` yalnızca uzunluğu
 * doğrular ve set DIŞI karakter sunucuya asla İSTEK OLARAK gitmez (kriter 3).
 *
 * Format geçerliyse oda var mı / dolu mu diye `GET /api/rooms/[code]`'a
 * sorulur (KK-033) — yalnızca istemci tarafı biçim kontrolü YETERLİ DEĞİLDİR,
 * çünkü `ROOM_NOT_FOUND`/`ROOM_FULL` sunucu durumuna bağlıdır.
 */
function normalizeInput(raw: string): string {
  let normalized = ''
  for (const char of raw.toUpperCase()) {
    if (ROOM_CODE_ALPHABET.includes(char)) normalized += char
  }
  return normalized.slice(0, ROOM_CODE_LENGTH)
}

export function JoinCodeField(): React.ReactElement {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState<ErrorCode | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const parsed = roomCodeSchema.safeParse(value)
    if (!parsed.success) {
      setError('INVALID_CODE')
      return
    }
    setError(null)
    setPending(true)
    try {
      const response = await fetch(`/api/rooms/${parsed.data}`)
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null)
        const parsedError = errorResponseSchema.safeParse(body)
        setError(parsedError.success ? parsedError.data.code : 'SERVER_ERROR')
        return
      }
      const body: unknown = await response.json()
      const parsedRoom = roomStateResponseSchema.safeParse(body)
      if (!parsedRoom.success) {
        setError('SERVER_ERROR')
        return
      }
      if (!parsedRoom.data.canJoin) {
        setError('ROOM_FULL')
        return
      }
      router.push(`/oda/${parsedRoom.data.code}`)
    } catch {
      setError('NETWORK')
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor="join-code" className="text-sm font-medium">
        {tr.home.codePlaceholder}
      </label>
      <div className="flex gap-2">
        <input
          id="join-code"
          value={value}
          onChange={(event) => {
            setValue(normalizeInput(event.target.value))
          }}
          placeholder={tr.home.codePlaceholder}
          className="border-border flex-1 border p-2"
          maxLength={ROOM_CODE_LENGTH}
        />
        <button type="submit" data-testid={TESTID.btnOdayaKatil} disabled={pending}>
          {tr.home.joinRoom}
        </button>
      </div>
      <ErrorBanner code={error} />
    </form>
  )
}
