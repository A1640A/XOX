'use client'

import { signOut, useSession } from 'next-auth/react'
import { tr } from '@/messages/tr'

/**
 * Minimum profil (kart §1): görünen ad + e-posta + "Çıkış yap". İstatistik
 * sayaçları, tema değiştirici ve ELO W2-02'de `GET /api/profile` ile eklenir
 * — bu görev yalnız `/profil`'in KENDİSİNİ (KK-007 korumalı rota hedefi) var
 * eder. `@/auth` import EDİLMEZ; ad/e-posta `next-auth/react`'in istemci
 * `useSession()`'ından okunur (Credentials `authorize()`'ın döndürdüğü
 * `{id, name, email}` Auth.js'in varsayılan `jwt`/`session` callback'leriyle
 * zaten `session.user`e taşınıyor — bkz. `auth.ts`, `authorize.ts`).
 */
export function ProfileContent(): React.ReactElement | null {
  const { data: session, status } = useSession()

  if (status === 'loading') return <p>{tr.common.loading}</p>
  // Middleware zaten girişsizi `/giris`e yönlendirir; bu yalnız bir güvenlik ağıdır.
  if (session === null) return null

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{tr.profile.title}</h1>
      <p>{session.user.name}</p>
      <p className="opacity-70">{session.user.email}</p>
      <button
        type="button"
        onClick={() => {
          void signOut({ callbackUrl: '/' })
        }}
      >
        {tr.auth.signOut}
      </button>
    </div>
  )
}
