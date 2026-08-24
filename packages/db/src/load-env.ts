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
  // `import.meta.dirname` tipte `string | undefined` (Node 20.11+ runtime-inda hep dolu,
  // ama @types/node surumune gore daraltilmiyor). fileURLToPath geri donusu her surumde calisir.
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
