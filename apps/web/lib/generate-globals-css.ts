import {
  boardCssVariables,
  cssVariables,
  fontFamily,
  lineHeight,
  motionCssVariables,
  themeCss,
} from '@xox/ui-tokens'

/**
 * `apps/web/app/globals.css`'in ÜRETİCİSİ (gotchas.md: "ESLint .css dosyalarını
 * hiç ayrıştırmaz" — lint burada korumaz, bu yüzden dosya elle yazılmaz).
 *
 * Tek kaynak `@xox/ui-tokens`: `@theme` bloğu Tailwind v4'ün utility üretimi
 * için `acik` temasının değerlerini öntanımlı taşır (Tailwind bir CSS custom
 * property üretmesi için `@theme` içinde literal bir değer görmesi gerekir —
 * bkz. tasarım notu, css.ts). `themeCss()`'in ürettiği `[data-tema='...']`
 * kuralları `@theme` bloğunun YANINA, kardeş kural olarak eklenir: `@theme`
 * seçici içeremez, içine gömülürse build kırılır (UI-001 notu).
 *
 * DESIGN-001a: `--font-sans`/`--font-serif`/`--font-mono` de `@theme` İÇİNDE —
 * bunlar da Tailwind'in KENDİ tema namespace'i (`--font-*` -> `font-sans` vb.
 * utility sınıfı üretir), tema/renk gibi. `--xox-*` tahta/hareket sabitleri
 * (`boardCssVariables`/`motionCssVariables`) İSE Tailwind'in bir namespace'i
 * DEĞİL — sıradan bir `:root` bloğuna, `@theme`'in YANINA yazılır (aynı sebep:
 * `@theme` yalnızca Tailwind'in tanıdığı adları kabul eder, keyfi `--xox-*`
 * adı ORADA fark edilmez, `@theme` dışına yazmak zararsızdır ama içine
 * yazmak yalnızca gereksizdir; yine de netlik için ayrı tutulur).
 *
 * `globals.css.test.ts` bu fonksiyonun çıktısıyla diskteki dosyanın BİREBİR
 * aynı olduğunu doğrular — kaynak metni okuyup desen arayan bir sonda değil,
 * üretilen ARTEFAKTLA birebir karşılaştırma (gotchas.md'nin uyardığı fark).
 */
export function generateGlobalsCss(): string {
  const defaults = cssVariables('acik')
  const themeBlockLines = Object.entries(defaults).map(([name, value]) => `  ${name}: ${value};`)
  const fontBlockLines = [
    `  --font-sans: ${fontFamily.sans};`,
    `  --font-serif: ${fontFamily.serif};`,
    `  --font-mono: ${fontFamily.mono};`,
  ]

  const auxVars = { ...boardCssVariables(), ...motionCssVariables() }
  const auxBlockLines = Object.entries(auxVars).map(([name, value]) => `  ${name}: ${value};`)

  return `/* apps/web/app/globals.css — ÜRETİLİR, ELLE DÜZENLENMEZ.
 * Kaynak: @xox/ui-tokens themeCss()/cssVariables()/boardCssVariables()/motionCssVariables().
 * Yeniden üretmek için generate-globals-css.ts'teki generateGlobalsCss() çıktısını buraya
 * yapıştır (globals.css.test.ts ikisinin eşitliğini kilitler). Tailwind v4 CSS-first;
 * tailwind.config.js YOK. */
@import 'tailwindcss';

@theme {
${themeBlockLines.join('\n')}
${fontBlockLines.join('\n')}
}

:root {
${auxBlockLines.join('\n')}
}

${themeCss()}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  line-height: ${String(lineHeight.base)};
}
`
}
