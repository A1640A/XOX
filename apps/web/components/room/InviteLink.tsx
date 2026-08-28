'use client'

import type { RoomCode } from '@xox/shared'
import { mutedText } from '@/components/ui/styles'
import { tr } from '@/messages/tr'
import { CopyButton } from './CopyButton'

export interface InviteLinkProps {
  readonly roomCode: RoomCode
}

/**
 * KK-120 — "Linki kopyala": panoya `<origin>/davet/<KOD>` yazar,
 * `data-kopyalandi="true"` 2 sn görünür (davranış `CopyButton`da, tek yerde).
 *
 * **Neden `/davet/` ve `/oda/` değil:** `/oda/:path*` middleware korumasındadır
 * (`auth.config.ts`), yani linki açan oturumsuz kullanıcı `/giris`e düşer.
 * `/davet/*` bilerek MUAFTIR ve kendisi yönlendirir — oturumsuz kullanıcıyı
 * `?donus=/oda/<KOD>` ile `/giris`e, oturumluyu doğrudan odaya yollar. Oda kodu
 * bu sayede giriş turunda KAYBOLMAZ (`app/davet/invite-target.ts`).
 *
 * URL çalışma zamanında, YALNIZ tıklamada (`getValue`) hesaplanır — render
 * sırasında `window.location`a bakılsaydı sunucu ve istemci farklı metin
 * üretir ve hidrasyon uyuşmazlığı çıkardı.
 */
export function InviteLink({ roomCode }: InviteLinkProps): React.ReactElement {
  return (
    <section className="flex flex-col gap-1">
      <p className={`${mutedText} text-sm`}>{tr.room.shareHint}</p>
      <CopyButton
        label={tr.room.copyLink}
        getValue={() => `${window.location.origin}/davet/${roomCode}`}
      />
    </section>
  )
}
