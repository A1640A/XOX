import { Pressable, Text, View, type DimensionValue } from 'react-native'
import { colOf, rowOf, type BoardConfig } from '@xox/game-core'
import { cellTestId, type Cell } from '@xox/shared'
import { board as boardTokens } from '@xox/ui-tokens'
import { useTheme } from '../lib/theme'
import { tr } from '../messages/tr'

/**
 * TEK tahta bileşeni (kart parite maddesi): hem oda hem bilgisayar ekranı
 * bunu kullanır. `apps/web/components/board/Board.tsx`nin PROP SÖZLEŞMESİYLE
 * bilinçli olarak AYNI ŞEKİLDİR (UI-BOARD-001) — iki platform aynı DOM/View
 * ağacını paylaşamaz ama aynı SÖZLEŞME iki ekranın (web/mobil) davranışını
 * senkron tutar. Bileşen KURAL BİLMEZ, `@xox/game-core`yu ÇAĞIRMAZ — yalnız
 * `config`ten geometriyi türetir (`rowOf`/`colOf`).
 *
 * `config` ZORUNLUDUR: kazanma uzunluğu tahta uzunluğundan TÜRETİLEMEZ
 * (ADR-0015).
 */
export interface BoardProps {
  readonly cells: readonly Cell[]
  readonly config: BoardConfig
  readonly interactive: boolean
  readonly winningLine?: readonly number[] | null
  readonly lastMoveIndex?: number | null
  readonly onCellPress?: (index: number) => void
}

function cellLabel(index: number, config: BoardConfig, cell: Cell): string {
  const satir = String(rowOf(index, config) + 1)
  const sutun = String(colOf(index, config) + 1)
  const icerik =
    cell === null ? tr.boardConfig.cellEmpty : tr.boardConfig.cellStone.replace('{tas}', cell)
  return tr.boardConfig.cellPosition
    .replace('{satir}', satir)
    .replace('{sutun}', sutun)
    .replace('{icerik}', icerik)
}

export function Board({
  cells,
  config,
  interactive,
  winningLine,
  lastMoveIndex,
  onCellPress,
}: BoardProps): React.ReactElement {
  const theme = useTheme()
  const expectedCount = config.size * config.size

  if (cells.length !== expectedCount) {
    // KK-B57 eş biçimi (bayat reducer/bozuk veri) — bozuk ızgara ÇİZİLMEZ.
    return (
      <View testID="tahta" accessibilityRole="alert">
        <Text style={{ color: theme.danger }}>{tr.errors.SERVER_ERROR}</Text>
      </View>
    )
  }

  const winningSet = new Set(winningLine ?? [])
  const hasWinner = winningSet.size > 0

  return (
    <View
      testID="tahta"
      role="grid"
      accessibilityLabel={tr.boardConfig.boardLabel
        .replace('{boyut}', `${String(config.size)}×${String(config.size)}`)
        .replace('{n}', String(config.winLength))}
      style={{
        width: '100%',
        maxWidth: boardTokens.boardMax,
        aspectRatio: 1,
        flexDirection: 'row',
        flexWrap: 'wrap',
        backgroundColor: theme.border,
        gap: boardTokens.gridLine,
      }}
    >
      {cells.map((cell, index) => {
        const isWinning = winningSet.has(index)
        const isFaded = hasWinner && !isWinning
        const isLastMove = lastMoveIndex === index
        return (
          <Pressable
            key={index}
            testID={cellTestId(index)}
            disabled={!interactive || cell !== null}
            accessibilityRole="button"
            accessibilityLabel={cellLabel(index, config, cell)}
            onPress={() => onCellPress?.(index)}
            style={{
              width: `${String(100 / config.size)}%` as DimensionValue,
              aspectRatio: 1,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.surface,
              opacity: isFaded ? 1 - boardTokens.fadedOpacity : 1,
              borderWidth: isWinning ? boardTokens.winningOutlineWidth : 0,
              borderColor: theme.win,
            }}
          >
            {cell !== null ? (
              <Text
                style={{
                  fontWeight: isLastMove ? '900' : '700',
                  fontSize: 24,
                  color: cell === 'X' ? theme.playerX : theme.playerO,
                }}
              >
                {cell}
              </Text>
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
}
