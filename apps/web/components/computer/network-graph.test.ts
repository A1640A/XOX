import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Kriter 7 (kart §oyna/bilgisayar): "Sayfa hiçbir ağ isteği yapmaz." + kural 4
 * (CLAUDE.md): kural mantığı yalnız `@xox/game-core`'da.
 *
 * İNCELEME MAJOR DÜZELTMESİ: önceki sürüm bir DENYLIST'ti (`bareSpecifiers.has
 * ('@xox/db')` + tek `fetch(` deseni). Reviewer ampirik olarak deldi:
 * `game-engine.ts`'e `import { MongoClient } from 'mongodb'` +
 * `use-computer-game.ts`'e `new WebSocket(...)`/`navigator.sendBeacon(...)`
 * enjekte edip 6/6 testi VE eslint'i yeşil geçirdi — `mongodb`/`ws` zaten
 * `apps/web/package.json`'da DOĞRUDAN bağımlılık, denylist bunları hiç
 * görmüyordu. Şimdi mekanizma bir ALLOWLIST: grafikteki her "bare" (birinci
 * taraf OLMAYAN) specifier şu kümenin alt kümesi OLMAK ZORUNDADIR, aksi hâlde
 * kırmızı. `mongodb`, `ws`, `next-auth` vb. hiçbiri bu kümede DEĞİL.
 *
 * İkinci delik: birinci taraf (`.`/`@/`) bir specifier ÇÖZÜLEMEZSE eskiden
 * sessizce `bareSpecifiers`e düşüp o alt ağaç hiç yürünmüyordu (grafik
 * KÜÇÜLÜR, testler yine yeşil kalır). Artık ayrı bir `unresolvedFirstParty`
 * kümesinde toplanır ve BOŞ olması ayrıca iddia edilir.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = resolve(HERE, '..', '..')
const ENTRY = resolve(WEB_ROOT, 'app/oyna/bilgisayar/page.tsx')

// `from '...'` / `import type ... from '...'` / dinamik `import('...')` /
// yan etki `import '...'` / `require('...')` — dördü de yakalanır. Tam olarak
// biri eşleşir (bkz. dosya başındaki yorum: "from" içeren ifadeler yan etki
// dalıyla ÇAKIŞMAZ, çünkü o dal "import" hemen ardından tırnak ister).
const IMPORT_SPECIFIER_RE =
  /from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g

function extractSpecifier(match: RegExpMatchArray): string | null {
  return match[1] ?? match[2] ?? match[3] ?? match[4] ?? null
}

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

function isFirstPartySpecifier(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('@/')
}

function resolveFirstParty(specifier: string, fromFile: string): string | null {
  if (specifier.startsWith('.')) {
    return resolveWithExtensions(resolve(dirname(fromFile), specifier))
  }
  return resolveWithExtensions(resolve(WEB_ROOT, specifier.slice('@/'.length)))
}

interface Graph {
  readonly files: ReadonlySet<string>
  readonly bareSpecifiers: ReadonlySet<string>
  /** Birinci taraf GÖRÜNEN ama diske çözülemeyen specifier'lar — BOŞ olmalı. */
  readonly unresolvedFirstParty: readonly string[]
}

function collectGraph(entry: string): Graph {
  const files = new Set<string>()
  const bareSpecifiers = new Set<string>()
  const unresolvedFirstParty: string[] = []

  function visit(file: string): void {
    if (files.has(file)) return
    files.add(file)
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(IMPORT_SPECIFIER_RE)) {
      const specifier = extractSpecifier(match)
      if (specifier === null) continue

      if (isFirstPartySpecifier(specifier)) {
        const resolved = resolveFirstParty(specifier, file)
        if (resolved === null) {
          unresolvedFirstParty.push(`${file} -> ${specifier}`)
          continue
        }
        visit(resolved)
      } else {
        bareSpecifiers.add(specifier)
      }
    }
  }

  visit(entry)
  return { files, bareSpecifiers, unresolvedFirstParty }
}

/**
 * ALLOWLIST — bunun DIŞINDAKİ her şey (özellikle `mongodb`, `ws`, `@xox/db`,
 * `next-auth`, ham `next/navigation` vb.) kırmızı üretir. Bilerek dar
 * tutulur: bu sayfanın gerçekten ihtiyaç duyduğu şey React ve üç donmuş,
 * ağsız birinci-parti paket.
 */
const ALLOWED_BARE_SPECIFIER_PATTERNS: readonly RegExp[] = [
  /^react$/,
  /^react\/.*$/,
  /^next\/.*$/,
  /^@xox\/game-core$/,
  /^@xox\/shared$/,
  /^@xox\/shared\/.*$/,
  /^@xox\/ui-tokens$/,
]

function isAllowedBareSpecifier(specifier: string): boolean {
  return ALLOWED_BARE_SPECIFIER_PATTERNS.some((pattern) => pattern.test(specifier))
}

/** `fetch(` yanında telemetri/soket/XHR ile ağa çıkan diğer tarayıcı API'leri. */
const NETWORK_CALL_PATTERNS: readonly RegExp[] = [
  /\bfetch\s*\(/,
  /\bnew\s+WebSocket\s*\(/,
  /\bnew\s+EventSource\s*\(/,
  /\bnew\s+XMLHttpRequest\s*\(/,
  /\.sendBeacon\s*\(/,
  /\bnew\s+Request\s*\(/,
]

function hasNetworkCall(source: string): boolean {
  return NETWORK_CALL_PATTERNS.some((pattern) => pattern.test(source))
}

describe('/oyna/bilgisayar modül grafiği — KK-027 ağ bağımsızlığı (allowlist)', () => {
  const graph = collectGraph(ENTRY)

  it('grafik gerçekten yürünmüş (sayfa + en az bir bileşen dosyası)', () => {
    // Bu iddia olmadan aşağıdaki iddialar, regex hiç eşleşmese de (örn. içe
    // aktarma biçimi değişse) sessizce yeşil kalabilirdi.
    expect(graph.files.size).toBeGreaterThanOrEqual(4)
    expect([...graph.files]).toContain(ENTRY)
    expect([...graph.files].some((f) => f.includes('/components/computer/'))).toBe(true)
  })

  it('birinci-taraf (./ veya @/) HİÇBİR specifier çözülemeden düşmez (grafik sessizce küçülmez)', () => {
    expect(graph.unresolvedFirstParty).toEqual([])
  })

  it('graph.bareSpecifiers YALNIZ izinli paketlerin ALT KÜMESİDİR — denylist DEĞİL allowlist', () => {
    const disallowed = [...graph.bareSpecifiers].filter((s) => !isAllowedBareSpecifier(s))
    expect(disallowed).toEqual([])
  })

  it('@xox/db özellikle DIŞARIDA kalır (allowlist zaten kapsıyor, açık örnek olarak da iddia edilir)', () => {
    expect(graph.bareSpecifiers.has('@xox/db')).toBe(false)
    expect(isAllowedBareSpecifier('@xox/db')).toBe(false)
  })

  it('grafik apps/web/lib/realtime/** ya da lib/client/use-room.ts katmanına HİÇ ulaşmaz', () => {
    const forbidden = [...graph.files].filter(
      (f) =>
        f.includes(`${join('lib', 'realtime')}/`) ||
        f.endsWith(join('lib', 'client', 'use-room.ts')),
    )
    expect(forbidden).toEqual([])
  })

  it('grafikteki hiçbir dosyanın kaynağında ağa çıkan bir çağrı (fetch/WebSocket/EventSource/XHR/sendBeacon/Request) yoktur', () => {
    const withNetworkCall = [...graph.files].filter((f) => hasNetworkCall(readFileSync(f, 'utf8')))
    expect(withNetworkCall).toEqual([])
  })
})

/**
 * İkinci savunma katmanı: statik import-grafiği taramasının kendisi bir
 * biçim değişikliğiyle atlanırsa diye, görevin YAZMA ALANI (`app/oyna/**`,
 * `components/computer/**`) baştan sona metinsel olarak da taranır.
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

  // Gerçek `import`/`from`/`require` sözdizimi aranır — yorum satırlarındaki
  // "bu paket KULLANILMIYOR" türü açıklayıcı metinler yanlış pozitif
  // üretmesin diye ham alt dize arama (`includes`) YERİNE gerçek içe aktarma
  // kalıbı eşleştirilir.
  const DB_IMPORT_RE = /(?:from\s+|require\(\s*|import\s+)['"]@xox\/db['"]/
  const USE_ROOM_IMPORT_RE = /(?:from\s+|require\(\s*|import\s+)['"][^'"]*use-room[^'"]*['"]/

  it('hiçbir dosya @xox/db, use-room içe aktarmaz (import/require/yan etki) ve ağa çıkan bir çağrı yapmaz', () => {
    const offenders = allFiles.filter((f) => {
      const source = readFileSync(f, 'utf8')
      return DB_IMPORT_RE.test(source) || USE_ROOM_IMPORT_RE.test(source) || hasNetworkCall(source)
    })
    expect(offenders).toEqual([])
  })

  /**
   * Kural 4 (CLAUDE.md) mekanik guard'ı: `chooseMove` testi yalnız SONUÇ
   * tahtasını doğruluyordu — elle yazılmış bir minimax de aynı sonucu
   * üretip testi geçebilirdi (inceleme bulgusu). Burada iki iddia BİRLİKTE
   * kural 4'ü bu dizin için mekanikleştirir: (a) kaynakta kazanan/arama
   * mantığının izi YOK, (b) grafikte `@xox/game-core` GERÇEKTEN var — yani
   * guard (a) boş bir kontrol değil, delege GERÇEKTEN oluyor.
   */
  it('kaynakta minimax/WIN_LINES/el-yazımı availableMoves çağrısı yoktur (kural 4 guard a)', () => {
    const offenders = allFiles.filter((f) =>
      /minimax|WIN_LINES|availableMoves\s*\(/.test(readFileSync(f, 'utf8')),
    )
    expect(offenders).toEqual([])
  })

  it('grafikte @xox/game-core GERÇEKTEN vardır — guard (a) boş kontrol değil (kural 4 guard b)', () => {
    const graph = collectGraph(ENTRY)
    expect(graph.bareSpecifiers.has('@xox/game-core')).toBe(true)
  })
})
