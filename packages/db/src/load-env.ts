import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `.env.local` gitignore'da olduğu için normal ortam değişkeni yüklemesi
 * (Next.js, Vercel CLI) buraya ulaşmaz — `packages/db` düz `vitest run` ile
 * koşar. `MONGODB_URI` zaten tanımlıysa (CI ortam değişkeni) dokunulmaz.
 */
export function loadEnvLocal(): void {
  if (process.env['MONGODB_URI'] !== undefined) return
  // `import.meta.dirname` bazı @types/node sürümlerinde `string | undefined`,
  // bazılarında (bu lockfile'da OPS-003 sırasında CANLI doğrulandı — aynı
  // pnpm-lock.yaml'a karşı iki ayrı temiz `pnpm install` farklı @types/node
  // çözümü verdi) `string` daralıyor ve `no-unnecessary-condition` bu ikinci
  // durumda tetikleniyor. Savunma AMA olarak kalsın (runtime'da her ikisi de
  // güvenli) — kural burada bilerek susturuluyor.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @types/node sürüm kararsızlığı, yukarı bak
  const here = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(here, '../../../.env.local')
  if (!existsSync(envPath)) return

  const content = readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue
    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    if (key !== '' && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}
