'use client'

import { useState } from 'react'
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, type ErrorCode } from '@xox/shared'
import { ErrorBanner } from '@/components/ErrorBanner'
import { buttonSecondary, textInput } from '@/components/ui/styles'
import { tr } from '@/messages/tr'

export interface EditNameFormProps {
  readonly currentName: string
  readonly pending: boolean
  readonly error: ErrorCode | null
  readonly savedMessage: string | null
  readonly onSave: (name: string) => void
}

/**
 * KK-082 görünen ad düzenleme. Ağ çağrısı `ProfileContent`'te — bu bileşen
 * yalnız yerel giriş durumunu tutar ve `onSave` ile isteği devreder. İstemci
 * `minLength`/`maxLength` yardımcıdır, kapı SUNUCUDADIR (KK-003) — sunucu
 * 400 `INVALID_NAME` dönerse `error` prop'u ile aynı `ErrorBanner` gösterilir.
 */
export function EditNameForm({
  currentName,
  pending,
  error,
  savedMessage,
  onSave,
}: EditNameFormProps): React.ReactElement {
  const [name, setName] = useState(currentName)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSave(name)
      }}
      className="flex flex-col gap-2"
    >
      <label className="flex flex-col gap-1 text-sm font-medium text-text" htmlFor="profil-ad">
        {tr.auth.displayName}
        <input
          id="profil-ad"
          required
          minLength={DISPLAY_NAME_MIN}
          maxLength={DISPLAY_NAME_MAX}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
          }}
          className={textInput}
        />
      </label>
      <button type="submit" disabled={pending} className={`${buttonSecondary} self-start`}>
        {tr.common.save}
      </button>
      <ErrorBanner code={error} />
      {savedMessage !== null ? (
        <p role="status" aria-live="polite" className="text-win text-sm font-medium">
          {savedMessage}
        </p>
      ) : null}
    </form>
  )
}
