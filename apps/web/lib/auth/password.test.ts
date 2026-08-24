import { describe, expect, it } from 'vitest'
import { hashPassword, verifyFakePassword, verifyPassword } from './password'

describe('hashPassword', () => {
  it('argon2id ile özetler ($argon2id$ önekiyle) — ADR-0009 C', async () => {
    const hashed = await hashPassword('dogru-at-nal-agac-2026')
    expect(hashed.startsWith('$argon2id$')).toBe(true)
    // Düz metin hiçbir biçimde özetin içinde yer almaz — KK-004.
    expect(hashed).not.toContain('dogru-at-nal-agac-2026')
  })

  it('aynı parola her seferinde FARKLI bir özet üretir (rastgele tuz)', async () => {
    const a = await hashPassword('ayni-parola-2026')
    const b = await hashPassword('ayni-parola-2026')
    expect(a).not.toBe(b)
  })
})

describe('verifyPassword', () => {
  it('doğru parola için true döner', async () => {
    const hashed = await hashPassword('gizli-parola-9000')
    await expect(verifyPassword(hashed, 'gizli-parola-9000')).resolves.toBe(true)
  })

  it('yanlış parola için false döner', async () => {
    const hashed = await hashPassword('gizli-parola-9000')
    await expect(verifyPassword(hashed, 'baska-bir-parola')).resolves.toBe(false)
  })
})

describe('verifyFakePassword', () => {
  it('her zaman false döner — hiçbir gerçek parola sahte özetle eşleşmez', async () => {
    await expect(verifyFakePassword('rastgele-bir-deneme')).resolves.toBe(false)
    await expect(verifyFakePassword('')).resolves.toBe(false)
  })
})
