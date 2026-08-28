import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Difficulty } from '@xox/game-core'
import { TESTID } from '@xox/shared'
import { spacing } from '@xox/ui-tokens'
import { Board } from '../../components/Board'
import { turnAttr } from '../../lib/computer/game-engine'
import { useComputerGame } from '../../lib/computer/use-computer-game'
import { useTheme } from '../../lib/theme'
import { tr } from '../../messages/tr'

const DIFFICULTIES: readonly {
  readonly value: Difficulty
  readonly testID: string
  readonly label: string
}[] = [
  { value: 'easy', testID: TESTID.zorlukEasy, label: tr.computer.easy },
  { value: 'medium', testID: TESTID.zorlukMedium, label: tr.computer.medium },
  { value: 'unbeatable', testID: TESTID.zorlukUnbeatable, label: tr.computer.unbeatable },
]

/**
 * `/oyna/bilgisayar` — tamamen istemci tarafı (KK-027): `@xox/db`, WS
 * istemcisi ya da `fetch` çağrısı YOK. Kural mantığı `lib/computer/
 * game-engine.ts` üzerinden `@xox/game-core`'a delege edilir (KK-022).
 */
export default function BilgisayaraKarsiScreen(): React.ReactElement {
  const theme = useTheme()
  const { state, difficulty, setDifficulty, playMove, reset } = useComputerGame()

  const statusText =
    state.status.kind === 'playing'
      ? turnAttr(state.status) === 'X'
        ? tr.game.yourTurn
        : tr.computer.thinking
      : state.status.kind === 'draw'
        ? tr.game.draw
        : state.status.winner === 'X'
          ? tr.game.youWon
          : tr.game.youLost

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>{tr.computer.title}</Text>

      <View style={styles.difficultyRow}>
        {DIFFICULTIES.map((option) => (
          <Pressable
            key={option.value}
            testID={option.testID}
            onPress={() => {
              setDifficulty(option.value)
            }}
            style={[
              styles.difficultyButton,
              {
                borderColor: difficulty === option.value ? theme.accent : theme.border,
                borderWidth: difficulty === option.value ? 2 : 1,
              },
            ]}
          >
            <Text style={{ color: difficulty === option.value ? theme.accent : theme.text }}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text testID={TESTID.durumMetni} accessibilityRole="alert" style={{ color: theme.text }}>
        {statusText}
      </Text>
      <Text testID={TESTID.siraGostergesi} style={{ display: 'none' }}>
        {turnAttr(state.status)}
      </Text>

      <Board
        cells={[...state.board]}
        config={state.config}
        interactive={state.status.kind === 'playing' && turnAttr(state.status) === 'X'}
        winningLine={state.status.kind === 'won' ? state.status.line : null}
        onCellPress={playMove}
      />

      <Pressable onPress={reset} style={[styles.button, { borderColor: theme.accent }]}>
        <Text style={{ color: theme.accent, fontWeight: '600' }}>{tr.computer.playAgain}</Text>
      </Pressable>

      <Text style={{ color: theme.textMuted, textAlign: 'center' }}>{tr.computer.notCounted}</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  title: { fontSize: 24, fontWeight: '700' },
  difficultyRow: { flexDirection: 'row', gap: spacing.sm },
  difficultyButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: 8 },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
  },
})
