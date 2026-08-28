#!/usr/bin/env node
/**
 * CI-006 — knip'ten BAĞIMSIZ, deterministik ölü dışa verim sondası.
 *
 * Neden bu script var (bkz. `docs/memory/gotchas.md` → 2026-08-27 girdileri):
 *
 *   1. knip.json `packages/*` iş paketleri için `entry: ["src/index.ts"]`
 *      tanımlıyor. Bir "entry" dosyasının dışa verimleri knip'e göre
 *      kendiliğinden "kamuya açık API" sayılır ve ASLA unused-export olarak
 *      raporlanmaz. Bu paketler npm'e YAYINLANMIYOR — bu varsayım yanlış.
 *      (`revokeWsTicketsForUser`, SEC-003/SEC-005 — bu kör noktadan kaçtı.)
 *   2. knip bir export'a yalnızca KENDİ `*.test.ts`'inin dokunmasını da
 *      "kullanılıyor" sayar. Bu HER DOSYA için geçerli, barrel'a özgü değil.
 *      (`useBoardModes`, ROLLOUT-BOARD-001 — bu kör noktadan kaçtı, barrel
 *      hiç karışmadı.)
 *
 * Bu sonda ikisini de knip'in "entry"/"kullanım" tanımına hiç bağımlı olmadan
 * kapatır: kaba ama deterministik bir metin taraması.
 *
 * Algoritma:
 *   1. Aşağıdaki `DEFINITION_ROOTS` altında (test/fixture/`index.ts`/`.d.ts`
 *      hariç) her dosyada `export function|const|class|interface|type|enum|let|var
 *      NAME` biçiminde TANIMLANMIŞ (yeniden dışa verilen değil) her ismi topla.
 *   2. Repodaki TÜM izlenen `.ts`/`.tsx` dosyalarını (git ls-files — node_modules/
 *      .next/coverage zaten .gitignore'da, ayrıca hariç tutmaya gerek yok) tek
 *      seferde okuyup satır satır TAM SÖZCÜK eşleşmesiyle bir kullanım dizini kur.
 *   3. Her (isim, tanım dosyası) çifti için: tanım dosyasındaki ve "kendi test
 *      dosyası"ndaki (aynı dizin, aynı taban ad + .test/.spec.ts(x)) geçişleri
 *      SAY MA. `index.ts` barrel dosyalarındaki SAF yeniden-dışa-verim satırlarını
 *      (`export { a, b } from './x'` / çok satırlı `a,` öğesi) da SAYMA — bunlar
 *      gerçek bir çağıran değil, yalnızca barrel kaydı.
 *   4. Kalan eşleşme sayısı 0 ise: şüpheli ölü dışa verim olarak raporla.
 *
 * BİLİNEN SINIRLAR (yanlış pozitif üretmemek için BİLEREK dar tutuldu):
 *   - `export default ...` taranmaz (tüketici local adı serbestçe seçer, metin
 *     taraması güvenilmez).
 *   - Tek satırda birden çok isim (`export const a = 1, b = 2`) yalnız İLK
 *     ismi yakalar.
 *   - Barrel içinde GERÇEK mantık barındıran dosyalar (ör.
 *     `apps/web/lib/realtime/handlers/index.ts`) `index.ts` olduğu için
 *     TANIM taraması dışında kalır — bu bir kapsam boşluğudur, yanlış pozitif
 *     değil (bkz. CI-006 raporu "Bilinen sınırlar").
 *   - Barrel'da `export { a as b } from './x'` biçimli YENİDEN ADLANDIRMA
 *     ele alınır ama nadir olduğu için ayrıntılı test edilmedi.
 *   - Yalnızca "kendi" test dosyası hariç tutulur (görev kartının/gotcha'nın
 *     tanımı budur) — FARKLI adlı bir test dosyası (ör. `ai-dispatch.test.ts`
 *     → `ai.ts`) hâlâ "kullanım" sayılır. Bilinçli kapsam sınırı.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Genişletilebilir: yeni bir "kütüphane gibi" alan eklenince buraya ekle. */
const DEFINITION_ROOTS = [
  'packages/game-core/src',
  'packages/shared/src',
  'packages/db/src',
  'packages/ui-tokens/src',
  'apps/web/components',
  'apps/web/lib',
  'apps/mobile/components',
  'apps/mobile/lib',
]

const TEST_SUFFIXES = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx']

const DECL_RE =
  /^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/

function isDefaultExportLine(line) {
  return /^export\s+default\b/.test(line)
}

function gitLsFiles(patterns) {
  const out = execFileSync('git', ['ls-files', ...patterns], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean)
}

function isTestFile(relPath) {
  return TEST_SUFFIXES.some((suffix) => relPath.endsWith(suffix))
}

function isFixtureOrDeclFile(relPath) {
  return relPath.endsWith('.fixture.ts') || relPath.endsWith('.d.ts')
}

function isIndexFile(relPath) {
  return path.basename(relPath) === 'index.ts'
}

function underAnyRoot(relPath, roots) {
  return roots.some((root) => relPath === root || relPath.startsWith(`${root}/`))
}

function ownTestFiles(relPath) {
  const dir = path.dirname(relPath)
  const ext = path.extname(relPath)
  const base = path.basename(relPath, ext)
  return TEST_SUFFIXES.map((suffix) => path.join(dir, `${base}${suffix}`).replace(/\\/g, '/'))
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** `/` bir regex literalinin BAŞLANGICI mı, yoksa bölme operatörü mü? Tam bir
 * tokenizer olmadan kesin bilinmez — standart sezgisel: son ANLAMLI (boşluk/
 * yorum DIŞI) karakter bir operatör/açılış parantezi/başlangıç ise regex'tir. */
function isRegexStart(lastSignificant) {
  if (lastSignificant === null) return true
  return /[=(,:;!&|?{}[+\-*%<>~^\n]/.test(lastSignificant)
}

/**
 * Yorumları (satır sonu yorumları ve blok yorumları), string/template
 * literal İÇERİKLERİNİ ve regex literallerini boşlukla değiştirir — satır
 * sayısı DEĞİŞMEZ.
 *
 * Neden gerekli (üç ayrı ölçülmüş kırılma, bu sırayla bulundu):
 *   1. Bir yorum (`ws-ticket.ts` başlığındaki `revokeWsTicketsForUser` notu)
 *      VE bir hata mesajı string'i sondayı YANILTTI — çağrı satırı silinmiş
 *      olsa bile bu metin geçişleri "gerçek kullanım" sayılıp mutasyonu
 *      YAKALAMADI.
 *   2. Naif tırnak-eşleştirme `apps/web/lib/log.ts`teki bir REGEX LİTERALİNİN
 *      (`["'`]?` — karakter sınıfı İÇİNDE tek başına üç tırnak türü de var)
 *      içindeki tırnakları gerçek string sınırı sandı; bir tırnak "açılıp"
 *      dosyanın geri kalanında bir sonraki eşleşen tırnağa kadar HER ŞEYİ
 *      (bu arada `LogContext` gibi gerçek kullanımları da) sildi — `1 metin
 *      geçişi` (yalnız tanım) raporlayıp GERÇEK 4 kullanan satırı gizledi.
 *      Çözüm: `/` bir regex başlangıcı GİBİ göründüğünde (önceki anlamlı
 *      karakter bir operatör/açılış parantezi ise) TÜM regex literalini
 *      (karakter sınıfı `[...]` içindeki kaçmamış `/` hariç) opak kabul et.
 *
 * BİLİNEN SINIR: regex-mi-bölme-mi ayrımı sezgiseldir, tam bir tokenizer
 * değildir — `a / b` gibi bir bölmeden hemen sonra `/regex/` gelirse (nadir,
 * bu repoda gözlenmedi) yanlış sınıflanabilir. Template literal içindeki
 * `${ifade}` de (basitlik için) tamamen string sayılıp siliniyor.
 */
function stripStringsAndComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  let lastSignificant = null
  while (i < n) {
    const c = src[i]
    const c2 = i + 1 < n ? src[i + 1] : ''
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') {
        out += ' '
        i++
      }
      continue
    }
    if (c === '/' && c2 === '*') {
      out += '  '
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < n) {
        out += '  '
        i += 2
      }
      continue
    }
    if (c === '/' && isRegexStart(lastSignificant)) {
      out += ' '
      i++
      let inClass = false
      while (i < n && src[i] !== '\n' && !(src[i] === '/' && !inClass)) {
        if (src[i] === '\\' && i + 1 < n) {
          out += ' '
          out += ' '
          i += 2
          continue
        }
        if (src[i] === '[') inClass = true
        else if (src[i] === ']') inClass = false
        out += ' '
        i++
      }
      if (i < n && src[i] === '/') {
        out += ' '
        i++
        while (i < n && /[a-zA-Z]/.test(src[i])) {
          out += ' '
          i++
        }
      }
      lastSignificant = '/'
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      out += ' '
      i++
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) {
          out += src[i] === '\n' ? '\n' : ' '
          out += src[i + 1] === '\n' ? '\n' : ' '
          i += 2
          continue
        }
        out += src[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < n) {
        out += ' '
        i++
      }
      lastSignificant = quote
      continue
    }
    out += c
    if (!/\s/.test(c)) lastSignificant = c
    else if (c === '\n') lastSignificant = '\n'
    i++
  }
  return out
}

function isBarrelReexportMention(lineText, symbol) {
  const trimmed = lineText.trim()
  // Tek satırlık: `export { a, b, type C } from './x'` / `export type { ... } from './x'`
  if (/^export\s+(type\s+)?\{.*\}\s*from\s*['"][^'"]+['"];?\s*$/.test(trimmed)) return true
  // Çok satırlı blok öğesi: `symbol,` / `type symbol,` / `symbol as alias,`
  const bare = trimmed.replace(/^type\s+/, '').replace(/,\s*$/, '')
  if (bare === symbol) return true
  const aliasRe = new RegExp(`^${escapeRegExp(symbol)}\\s+as\\s+[A-Za-z_$][\\w$]*$`)
  if (aliasRe.test(bare)) return true
  return false
}

function main() {
  // `apps/e2e/**` BİLEREK kullanım dizinine dahil (gerçek bir tüketicidir,
  // hariç tutulmaz) — yalnız tanım taramasına (`DEFINITION_ROOTS`) girmez.
  const allTracked = gitLsFiles(['*.ts', '*.tsx'])

  // 1) TANIM adayları
  /** @type {{symbol: string, file: string, line: number}[]} */
  const candidates = []
  for (const relPath of allTracked) {
    if (!underAnyRoot(relPath, DEFINITION_ROOTS)) continue
    if (isTestFile(relPath) || isFixtureOrDeclFile(relPath) || isIndexFile(relPath)) continue
    const abs = path.join(REPO_ROOT, relPath)
    const lines = readFileSync(abs, 'utf8').split('\n')
    lines.forEach((line, idx) => {
      if (isDefaultExportLine(line)) return
      const m = DECL_RE.exec(line)
      if (m) candidates.push({ symbol: m[1], file: relPath, line: idx + 1 })
    })
  }

  // 2) Kullanım dizini — repo genelinde, satır bazlı tam sözcük eşleşmesi.
  // Tokenizasyon YORUM/STRING'i SİLİNMİŞ içerik üzerinden yapılır (bir
  // isim yalnız bir yorumda ya da hata mesajı string'inde geçiyorsa bu
  // GERÇEK kullanım DEĞİLDİR) — `text` alanı barrel-satırı sezgisi için
  // orijinal (ham) satırı taşımaya devam eder.
  /** @type {Map<string, {file: string, line: number, text: string}[]>} */
  const usageIndex = new Map()
  const WORD_RE = /[A-Za-z_$][\w$]*/g
  for (const relPath of allTracked) {
    const abs = path.join(REPO_ROOT, relPath)
    const rawContent = readFileSync(abs, 'utf8')
    const rawLines = rawContent.split('\n')
    const strippedLines = stripStringsAndComments(rawContent).split('\n')
    strippedLines.forEach((strippedLine, idx) => {
      let match
      WORD_RE.lastIndex = 0
      const seenOnLine = new Set()
      while ((match = WORD_RE.exec(strippedLine)) !== null) {
        const word = match[0]
        if (seenOnLine.has(word)) continue
        seenOnLine.add(word)
        let bucket = usageIndex.get(word)
        if (bucket === undefined) {
          bucket = []
          usageIndex.set(word, bucket)
        }
        bucket.push({ file: relPath, line: idx + 1, text: rawLines[idx] ?? '' })
      }
    })
  }

  // 3) Her aday için gerçek kullanım ara
  const suspects = []
  for (const { symbol, file, line } of candidates) {
    const ownTests = new Set(ownTestFiles(file))
    const occurrences = usageIndex.get(symbol) ?? []
    const realUsages = occurrences.filter((occ) => {
      // Yalnız TANIM SATIRININ kendisini hariç tut — tanım dosyasının
      // GERİ KALANI meşru bir kullanım alanıdır (ör. `export interface
      // FooProps` aynı dosyada `function Foo(props: FooProps)` içinde
      // kullanılır; tüm dosyayı hariç tutmak bunu yanlış pozitif yapardı —
      // ilk denemede tam bu hatayı yaptım, 116 yanlış pozitif üretti).
      if (occ.file === file && occ.line === line) return false
      if (ownTests.has(occ.file)) return false
      if (isIndexFile(occ.file) && isBarrelReexportMention(occ.text, symbol)) return false
      return true
    })
    if (realUsages.length === 0) {
      suspects.push({ symbol, file, line, occurrenceCount: occurrences.length })
    }
  }

  console.log(
    `dead-export-probe: ${candidates.length} aday tanım tarandı, ${allTracked.length} dosya kullanım dizinine alındı.`,
  )

  // Baseline — CI-006 bu sondayı eklediği gün, halihazırda üretimde duran
  // gerçek ölü dışa verimler bulundu (bkz. `docs/board/reports/CI-006.md`
  // "Baseline"). Bunları düzeltmek `packages/*` KAYNAK dosyalarına dokunmayı
  // gerektiriyor — CI-006'nın çakışma kümesi bunu KAPSAMIYOR. Ayrı bir kart
  // konusu. Baseline'daki bulgular BİLİNEN BORÇ olarak bilgilendirici
  // yazdırılır ama exit code'u KIRMIZI yapmaz; baseline'da OLMAYAN (yeni)
  // bir bulgu çıkarsa kapı kırmızı olur.
  //
  // Baseline'ı yenilemek için: `UPDATE_BASELINE=1 node scripts/dead-export-probe.mjs`
  const baselinePath = path.join(REPO_ROOT, 'scripts/dead-export-probe.baseline.json')
  let baseline
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  } catch {
    baseline = []
  }
  const baselineSet = new Set(baseline)
  const key = (s) => `${s.file}:${s.symbol}`

  if (process.env.UPDATE_BASELINE === '1') {
    writeFileSync(baselinePath, `${JSON.stringify(suspects.map(key).sort(), null, 2)}\n`)
    console.log(
      `dead-export-probe: baseline güncellendi (${suspects.length} kayıt) — ${baselinePath}`,
    )
    return 0
  }

  const newSuspects = suspects.filter((s) => !baselineSet.has(key(s)))
  const knownDebt = suspects.filter((s) => baselineSet.has(key(s)))

  if (knownDebt.length > 0) {
    console.log(
      `dead-export-probe: ${knownDebt.length} BİLİNEN borç (baseline'da, kapıyı kırmıyor — ayrı kart gerekir):`,
    )
    for (const s of knownDebt) console.log(`  ${s.file}:${s.line}  export ${s.symbol}`)
  }

  if (newSuspects.length === 0) {
    console.log('dead-export-probe: YENİ şüpheli ölü dışa verim yok.')
    return 0
  }

  console.error(`\ndead-export-probe: ${newSuspects.length} YENİ şüpheli ölü dışa verim bulundu:\n`)
  for (const s of newSuspects) {
    console.error(`  ${s.file}:${s.line}  export ${s.symbol}`)
    console.error(
      `    (repo genelinde ${s.occurrenceCount} metin geçişi var ama tanım + kendi testi/barrel kaydı dışında GERÇEK kullanan YOK)`,
    )
  }
  console.error(
    '\nBir çağıran ekle, ya da bilinçli olarak dondurulmuş/hazırlık aşamasındaki bir yüzeyse ' +
      'bu script başlığındaki "Bilinen sınırlar" bölümüne örnek olarak ekleyip journal/rapora gerekçe yaz, ' +
      "sonra `UPDATE_BASELINE=1 node scripts/dead-export-probe.mjs` ile baseline'a bilerek ekle.",
  )
  return 1
}

process.exit(main())
