import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Kriter 7 (kart §oyna/bilgisayar): "Sayfa hiçbir ağ isteği yapmaz." Bu testin
 * amacı `apps/web/lib/client/use-room.ts` gibi gerçek bir bağlantı kuran bir
 * hook'un DOLAYLI olarak sayfaya sızmadığını mekanik olarak doğrulamaktır —
 * "fetch çağırmıyoruz" demek yetmez, `/oyna/bilgisayar` sayfasından başlayan
 * import GRAFİĞİ (yalnız birinci taraf `apps/web` dosyaları, `@/` ve göreli
 * importlar) yürünür ve şunlar aranır:
 *   1. `@xox/db` (kalıcı katman) bare specifier'ı hiçbir dosyada geçmez.
 *   2. Grafikteki hiçbir dosya `apps/web/lib/realtime/**` ya da
 *      `apps/web/lib/client/use-room.ts` (gerçek zamanlı oda hook'u) DEĞİLDİR.
 *   3. Grafikteki hiçbir dosyanın kaynağında `fetch(` çağrısı YOKTUR.
 *
 * `@xox/game-core`/`@xox/shared`/`@xox/ui-tokens`/`react`/`next` gibi
 * workspace-dışı ya da paylaşılan paket sınırları kasıtlı olarak İZLENMEZ —
 * onlar zaten donmuş, incelenen alan bu görevin YAZDIĞI `apps/web` katmanıdır.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = resolve(HERE, '..', '..')
const ENTRY = resolve(WEB_ROOT, 'app/oyna/bilgisayar/page.tsx')

const IMPORT_SPECIFIER_RE = /(?:from\s+|import\()\s*['"]([^'"]+)['"]/g

function resolveWithExtensions(base: string): string | null {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** `.`/`@/` ile başlayan (yani `apps/web` içi) bir specifier'ı dosya yoluna çevirir; başka her şey `null`. */
function resolveFirstParty(specifier: string, fromFile: string): string | null {
  if (specifier.startsWith('.')) {
    return resolveWithExtensions(resolve(dirname(fromFile), specifier))
  }
  if (specifier.startsWith('@/')) {
    return resolveWithExtensions(resolve(WEB_ROOT, specifier.slice('@/'.length)))
  }
  return null
}

interface Graph {
  readonly files: ReadonlySet<string>
  readonly bareSpecifiers: ReadonlySet<string>
}

function collectGraph(entry: string): Graph {
  const files = new Set<string>()
  const bareSpecifiers = new Set<string>()

  function visit(file: string): void {
    if (files.has(file)) return
    files.add(file)
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(IMPORT_SPECIFIER_RE)) {
      const specifier = match[1]
      if (specifier === undefined) continue
      const resolved = resolveFirstParty(specifier, file)
      if (resolved !== null) {
        visit(resolved)
      } else {
        bareSpecifiers.add(specifier)
      }
    }
  }

  visit(entry)
  return { files, bareSpecifiers }
}

describe('/oyna/bilgisayar modül grafiği — KK-027 ağ bağımsızlığı', () => {
  const graph = collectGraph(ENTRY)

  it('grafik gerçekten yürünmüş (sayfa + en az bir bileşen dosyası)', () => {
    // Bu iddia olmadan aşağıdaki "yok" testleri, regex hiç eşleşmese de
    // (örn. içe aktarma biçimi değişse) sessizce yeşil kalabilirdi.
    expect(graph.files.size).toBeGreaterThanOrEqual(4)
    expect([...graph.files]).toContain(ENTRY)
    expect([...graph.files].some((f) => f.includes('/components/computer/'))).toBe(true)
  })

  it('hiçbir dosya @xox/db bare specifier ile içe aktarmaz', () => {
    expect(graph.bareSpecifiers.has('@xox/db')).toBe(false)
  })

  it('grafik apps/web/lib/realtime/** ya da lib/client/use-room.ts katmanına HİÇ ulaşmaz', () => {
    const forbidden = [...graph.files].filter(
      (f) =>
        f.includes(`${join('lib', 'realtime')}/`) ||
        f.endsWith(join('lib', 'client', 'use-room.ts')),
    )
    expect(forbidden).toEqual([])
  })

  it('grafikteki hiçbir dosyanın kaynağında fetch( çağrısı yoktur', () => {
    const withFetch = [...graph.files].filter((f) => /\bfetch\s*\(/.test(readFileSync(f, 'utf8')))
    expect(withFetch).toEqual([])
  })
})

/**
 * İkinci savunma katmanı: statik import-grafiği taramasının kendisi bir
 * biçim değişikliğiyle (ör. dinamik `require`, yeni bir dosya) atlanırsa
 * diye, görevin YAZMA ALANI (`app/oyna/**`, `components/computer/**`) baştan
 * sona metinsel olarak da taranır.
 */
describe('görev çakışma kümesi kaynak taraması — savunma-derinliği', () => {
  function listFiles(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true })
    return entries.flatMap((entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) return listFiles(full)
      return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : []
    })
  }

  const SELF = fileURLToPath(import.meta.url)
  const scopeDirs = [resolve(WEB_ROOT, 'app/oyna'), resolve(WEB_ROOT, 'components/computer')]
  // Test dosyaları hariç: bu testin KENDİSİ (ve kardeş testler) belgeleme
  // amacıyla "fetch(", "@xox/db", "use-room" gibi metinleri örnek/açıklama
  // olarak taşıyabilir — taranan şey ÜRETİM kodu, meta-anlatım değil.
  const allFiles = scopeDirs
    .flatMap((dir) => listFiles(dir))
    .filter((f) => f !== SELF && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))

  it('taranan alan boş değil (sondanın kendisi anlamlı)', () => {
    expect(allFiles.length).toBeGreaterThan(0)
  })

  // Gerçek `import`/`from` sözdizimi aranır — yorum satırlarındaki "bu paket
  // KULLANILMIYOR" türü açıklayıcı metinler (ör. `ComputerGameScreen.tsx`'in
  // kendi KK-027 belgelemesi) yanlış pozitif üretmesin diye ham alt dize
  // arama (`includes`) YERİNE gerçek içe aktarma kalıbı eşleştirilir.
  const DB_IMPORT_RE = /from\s+['"]@xox\/db['"]/
  const USE_ROOM_IMPORT_RE = /from\s+['"][^'"]*use-room[^'"]*['"]/
  const FETCH_CALL_RE = /\bfetch\s*\(/

  it('hiçbir dosya @xox/db, use-room içe aktarmaz ve fetch( çağırmaz', () => {
    const offenders = allFiles.filter((f) => {
      const source = readFileSync(f, 'utf8')
      return (
        DB_IMPORT_RE.test(source) || USE_ROOM_IMPORT_RE.test(source) || FETCH_CALL_RE.test(source)
      )
    })
    expect(offenders).toEqual([])
  })
})
