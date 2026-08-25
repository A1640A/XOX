import { describe, expect, it } from 'vitest'

/**
 * CI-002 SONDASI — GEÇİCİ. Kasıtlı olarak kırık bir iddia: gates işinin
 * gerçekten ateşlendiğini kanıtlamak için var, bir sonraki commit'te
 * kaldırılacak. Kalıcı değil — main'e asla gitmeyecek.
 */
describe('CI-002 sonda — kasıtlı kırık', () => {
  it('bu iddia BİLEREK yanlış, CI kırmızı dönmeli', () => {
    expect(1 + 1).toBe(3)
  })
})
