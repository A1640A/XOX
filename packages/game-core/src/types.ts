export type Player = 'X' | 'O'

export type Cell = Player | null

/** Tahta her zaman tam 9 hücredir. Sıra: sol üstten sağ alta. */
export type Board = readonly [Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell]

export type WinLine = readonly [number, number, number]

export type GameStatus =
  | { readonly kind: 'playing'; readonly turn: Player }
  | { readonly kind: 'won'; readonly winner: Player; readonly line: WinLine }
  | { readonly kind: 'draw' }

export type Difficulty = 'easy' | 'medium' | 'unbeatable'
