export type Player = 'X' | 'O'

export type Cell = Player | null

declare const boardBrand: unique symbol

/**
 * DOĞRULANMIŞ tahta. Sıra: sol üstten sağ alta, satır satır.
 *
 * Marka (ADR-0011) bir süs değil, bir KAPIDIR: eski tuple tipi iki iş yapıyordu
 * — (i) indeks totalliği, (ii) "`Board`'a giden tek yol `boardFromCells`'tir"
 * kanıtı. Değişken boyutla (i) tuple ile taşınamaz; markasız düz
 * `readonly Cell[]`'e geçmek ise (ii)'yi SESSİZCE yok ederdi: doğrulanmamış bir
 * `Cell[]` doğrudan `evaluateStatus`'a girebilir ve E-18 ("size 11 ama tahta 9
 * hücre") hiçbir kapıyı ateşlemezdi. Marka kapıyı tip düzeyinde korur.
 *
 * Okuma serbesttir (`length`, `for..of`, `.map`, `[...board]`); yayma sonucu
 * marka TAŞIMAZ — istenen davranış budur: DB'ye ve protokole yazılan şey düz
 * `Cell[]`'dir.
 */
export type Board = readonly Cell[] & { readonly [boardBrand]: true }

/** Kazanan hat: K indeks (K = `config.winLength`, 3..6). */
export type WinLine = readonly number[]

export type GameStatus =
  | { readonly kind: 'playing'; readonly turn: Player }
  | { readonly kind: 'won'; readonly winner: Player; readonly line: WinLine }
  | { readonly kind: 'draw' }

export type Difficulty = 'easy' | 'medium' | 'unbeatable'
