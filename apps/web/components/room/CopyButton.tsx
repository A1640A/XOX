'use client'

import { useEffect, useRef, useState } from 'react'
import { buttonGhostSmall } from '@/components/ui/styles'
import { tr } from '@/messages/tr'

export interface CopyButtonProps {
  readonly label: string
  readonly getValue: () => string
  readonly testId?: string
}

const COPIED_DISPLAY_MS = 2_000

/**
 * P0 "Kodu kopyala" (`oda-kodu` yanı) VE P2 "Linki kopyala" (KK-120,
 * `InviteLink.tsx`) AYNI kopyalama davranışını paylaşır — `data-kopyalandi`
 * 2 sn görünür kalır. Tek bileşende tutulur ki ikisi de aynı UX'i versin.
 */
export function CopyButton({ label, getValue, testId }: CopyButtonProps): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  function handleClick(): void {
    void navigator.clipboard.writeText(getValue()).then(() => {
      setCopied(true)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setCopied(false)
      }, COPIED_DISPLAY_MS)
    })
  }

  return (
    <button
      type="button"
      data-testid={testId}
      data-kopyalandi={copied ? 'true' : undefined}
      onClick={handleClick}
      className={buttonGhostSmall}
    >
      {copied ? tr.common.copied : label}
    </button>
  )
}
