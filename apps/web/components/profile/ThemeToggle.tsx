'use client'

import type { Theme } from '@xox/ui-tokens'
import { tr } from '@/messages/tr'

export interface ThemeToggleProps {
  readonly theme: Theme
  readonly pending: boolean
  readonly onChange: (theme: Theme) => void
}

/**
 * KK-083 tema değiştirici (kart W2-02). Yalnız `theme`/`pending`/`onChange`
 * alır — çerez yazımı, `<html data-tema>` mutasyonu ve `PATCH /api/profile`
 * çağrısı `ProfileContent`'te (tek ağ katmanı) yaşar, bu bileşen SAF
 * sunumdur.
 *
 * Erişilebilirlik: `role="group"` + iki gerçek `<button>`, seçili durum
 * `aria-pressed` ile bildirilir (kart metninin izin verdiği iki kalıptan
 * biri — `role="radio"` + roving-tabindex yerine, çünkü ikisi de eşit
 * geçerli ve bu native buton + `aria-pressed` klavye gezinimini ekstra kod
 * olmadan zaten doğru verir: Tab ile aralarında gezinilir, Enter/Boşluk
 * ile seçilir).
 */
export function ThemeToggle({ theme, pending, onChange }: ThemeToggleProps): React.ReactElement {
  return (
    <div role="group" aria-label={tr.profile.theme} className="flex gap-2">
      <button
        type="button"
        aria-pressed={theme === 'acik'}
        disabled={pending}
        onClick={() => {
          onChange('acik')
        }}
        className="border-border bg-surface text-text rounded border px-3 py-2 aria-pressed:font-bold"
      >
        {tr.profile.themeLight}
      </button>
      <button
        type="button"
        aria-pressed={theme === 'koyu'}
        disabled={pending}
        onClick={() => {
          onChange('koyu')
        }}
        className="border-border bg-surface text-text rounded border px-3 py-2 aria-pressed:font-bold"
      >
        {tr.profile.themeDark}
      </button>
    </div>
  )
}
