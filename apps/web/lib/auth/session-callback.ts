import type { Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'

/**
 * `auth.ts`'in `session` callback'inin SAF mantığı — ayrı dosyada, çünkü
 * `next-auth`'un ÇALIŞMA ZAMANI Vitest'te yüklenemiyor (`next-auth`/
 * `next-auth/providers/credentials` gibi RUNTIME import'lar `next/server`'ı
 * uzantısız çektiği için — bkz. authorize.ts'teki not, gotchas.md).
 *
 * Bu dosya YALNIZ TİP import ediyor (`import type`); `verbatimModuleSyntax`
 * altında bu satırlar derlemede TAMAMEN silinir — çalışma zamanında
 * `next-auth`'a hiçbir bağımlılığı YOK, dolayısıyla gerçek bir davranış
 * testiyle kilitlenebiliyor (güvenlik denetimi: önceki sürümde bu mantık
 * yalnız `auth.static.test.ts`'in `readFileSync` + regex sondasıyla
 * "doğrulanıyordu" — `token.sub`'ı sabit bir değere bağlayan bir mutasyon
 * hiçbir testi kırmıyordu).
 */
export function applySessionUser(session: Session, token: JWT): Session {
  if (token.sub !== undefined) {
    session.user.id = token.sub
  }
  return session
}
