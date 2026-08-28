// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { errorJson } from './error-json'

describe('errorJson', () => {
  it('gövdeyi {code,message} şekline sokar ve verilen durum kodunu taşır', async () => {
    const response = errorJson('INVALID_CODE', 'Geçersiz oda kodu.', 400)

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toStrictEqual({
      code: 'INVALID_CODE',
      message: 'Geçersiz oda kodu.',
    })
  })

  it('farklı kod/durum kombinasyonlarında birebir yansıtır (sabit değer, ilişki değil)', async () => {
    const response = errorJson('SERVER_ERROR', 'Sunucu hatası.', 500)

    expect(response.status).toBe(500)
    expect(await response.json()).toStrictEqual({
      code: 'SERVER_ERROR',
      message: 'Sunucu hatası.',
    })
  })
})
