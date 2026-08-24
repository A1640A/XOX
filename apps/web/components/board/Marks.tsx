/**
 * X ve O YALNIZ renkle ayrılmaz (kart §13). Ölçülen parlaklık kontrastı
 * `playerX`/`playerO` arasında açık temada 1.22:1, koyu temada 1.06:1 —
 * renk körlüğünde tahta okunamaz hâle gelir. Bu yüzden şekil ve çizgi
 * kalınlığı da ayırt edici: X iki kalın (`strokeWidth=5`) çapraz çizgi, O ince
 * (`strokeWidth=2.5`) bir çemberdir. `data-symbol` bu farkı testte doğrulamak
 * için vardır (`Board.test.tsx`) — DOM yapısı da (line×2 vs circle) farklıdır,
 * yani ayrım yalnız `stroke-width` sayısına değil, elemana da dayanır.
 */
export function XMark(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-symbol="x" className="h-full w-full">
      <line
        x1="4"
        y1="4"
        x2="20"
        y2="20"
        stroke="currentColor"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <line
        x1="20"
        y1="4"
        x2="4"
        y2="20"
        stroke="currentColor"
        strokeWidth={5}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function OMark(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-symbol="o" className="h-full w-full">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={2.5} />
    </svg>
  )
}
