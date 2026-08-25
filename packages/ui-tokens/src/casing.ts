/**
 * camelCase -> kebab-case. CSS custom property adları kebab-case ister
 * (`textMuted` -> `text-muted`, `gridLine` -> `grid-line`). `css.ts` (renk değişkenleri) ve
 * `board.ts`/`motion.ts` (tahta/hareket değişkenleri) ortak kullanır — tek dönüşüm kuralı.
 */
export function toKebabCase(token: string): string {
  return token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}
