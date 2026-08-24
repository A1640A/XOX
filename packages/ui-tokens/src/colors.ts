/** Web (Tailwind CSS değişkenleri) ve mobil (StyleSheet) aynı değerleri buradan alır. */
export const colors = {
  light: {
    bg: '#faf9f7',
    surface: '#ffffff',
    border: '#e5e2dd',
    text: '#1c1917',
    textMuted: '#78716c',
    accent: '#2563eb',
    playerX: '#2563eb',
    playerO: '#e11d48',
    win: '#16a34a',
    danger: '#dc2626',
  },
  dark: {
    bg: '#17161a',
    surface: '#211f26',
    border: '#35323c',
    text: '#f5f4f2',
    textMuted: '#a8a29e',
    accent: '#60a5fa',
    playerX: '#60a5fa',
    playerO: '#fb7185',
    win: '#4ade80',
    danger: '#f87171',
  },
} as const

export type ColorScheme = keyof typeof colors
export type ColorToken = keyof (typeof colors)['light']
