'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { roomCodeSchema, TESTID, type ErrorCode } from '@xox/shared'
import { tr } from '@/messages/tr'
import { ErrorBanner } from './ErrorBanner'

/**
 * Ana sayfadaki 6 haneli oda kodu girişi (KK-030/033/034). Normalleştirme
 * (boşluk kırpma + büyük harf) burada BAŞLANGIÇ hâliyle var; sertleştirme
 * (yapıştırma olayı, karışan karakter düzeltmesi vb.) W1-04'te derinleştirilir
 * — bu görevin işi yalnız alanı var etmek ve `@xox/shared`'ın
 * `roomCodeSchema`'sına delege etmektir.
 */
export function JoinCodeField(): React.ReactElement {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState<ErrorCode | null>(null)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const normalized = value.trim().toUpperCase()
    const parsed = roomCodeSchema.safeParse(normalized)
    if (!parsed.success) {
      setError('INVALID_CODE')
      return
    }
    setError(null)
    router.push(`/oda/${parsed.data}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="join-code" className="text-sm font-medium">
        {tr.home.codePlaceholder}
      </label>
      <div className="flex gap-2">
        <input
          id="join-code"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
          }}
          placeholder={tr.home.codePlaceholder}
          className="border-border flex-1 border p-2"
          maxLength={12}
        />
        <button type="submit" data-testid={TESTID.btnOdayaKatil}>
          {tr.home.joinRoom}
        </button>
      </div>
      <ErrorBanner code={error} />
    </form>
  )
}
