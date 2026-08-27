import type { BoardConfig } from '@xox/game-core'
import { TESTID } from '@xox/shared'
import { boardConfigSummaryText } from './summary-text'

export interface GameConfigSummaryProps {
  readonly config: BoardConfig
}

/**
 * `oyun-ayari-ozeti` kancasının TEK render noktası (ADR-0016). Sunucu
 * bileşeni olarak da render edilebilir — hook'suz, saf prop→JSX. Oda ekranı
 * (`RoomScreen`, oynanırken/beklenirken) ve katılma ekranı (`JoinRoomPreview`)
 * bunu çağırır; ikisi de aynı testid ve aynı metin şablonunu paylaşır.
 */
export function GameConfigSummary({ config }: GameConfigSummaryProps): React.ReactElement {
  return <p data-testid={TESTID.oyunAyariOzeti}>{boardConfigSummaryText(config)}</p>
}
