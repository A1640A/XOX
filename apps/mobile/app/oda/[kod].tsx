import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { roomCodeSchema, TESTID, type RoomCode } from '@xox/shared'
import { spacing } from '@xox/ui-tokens'
import { Board } from '../../components/Board'
import { remainingSeconds } from '../../lib/rooms/countdown'
import { useRoom } from '../../lib/ws/use-room'
import { useTheme } from '../../lib/theme'
import { tr } from '../../messages/tr'

export default function OdaScreen(): React.ReactElement {
  const params = useLocalSearchParams<{ kod: string }>()
  const theme = useTheme()
  const raw = typeof params.kod === 'string' ? params.kod : ''
  const parsed = roomCodeSchema.safeParse(raw.trim().toUpperCase())

  if (!parsed.success) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <Text testID={TESTID.hataMesaji} style={{ color: theme.danger }}>
          {tr.errors.INVALID_CODE}
        </Text>
      </View>
    )
  }

  return <RoomInner roomCode={parsed.data} />
}

const CONNECTION_LABEL: Record<string, string> = {
  bagli: tr.connection.connected,
  baglaniyor: tr.connection.connecting,
  kopuk: tr.connection.disconnected,
  devredildi: tr.connection.takenOver,
}

function RoomInner({ roomCode }: { readonly roomCode: RoomCode }): React.ReactElement {
  const theme = useTheme()
  const { state, actions } = useRoom(roomCode)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1_000)
    return () => {
      clearInterval(interval)
    }
  }, [])

  const secondsLeft = remainingSeconds(state.turnDeadline, state.serverOffsetMs, now)

  const opponentSeat = state.you === 'X' ? 'O' : 'X'
  const opponent = state.players[opponentSeat]
  const turn = state.status.kind === 'playing' ? state.status.turn : 'yok'

  const statusText =
    state.status.kind === 'playing'
      ? state.status.turn === state.you
        ? tr.game.yourTurn
        : tr.game.opponentTurn
      : state.status.kind === 'draw'
        ? tr.game.draw
        : state.status.winner === state.you
          ? tr.game.youWon
          : tr.game.youLost

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.bg }]}>
      <Text testID={TESTID.odaKodu} style={[styles.code, { color: theme.text }]}>
        {roomCode}
      </Text>
      <Text testID={TESTID.baglantiDurumu} style={{ color: theme.textMuted }}>
        {CONNECTION_LABEL[state.connection] ?? state.connection}
      </Text>
      <Text testID={TESTID.rakipAdi} style={{ color: theme.text }}>
        {opponent?.name ?? tr.room.waitingOpponent}
      </Text>
      <Text testID={TESTID.durumMetni} accessibilityRole="alert" style={{ color: theme.text }}>
        {statusText}
      </Text>
      <Text testID={TESTID.siraGostergesi} style={styles.hidden}>
        {turn}
      </Text>
      {secondsLeft !== null ? (
        <Text testID={TESTID.sureSayaci} style={{ color: theme.textMuted }}>
          {tr.game.timeLeft.replace('{saniye}', String(secondsLeft))}
        </Text>
      ) : null}

      <Board
        cells={state.board}
        config={{ size: state.size, winLength: state.winLength }}
        interactive={
          state.connection === 'bagli' &&
          state.status.kind === 'playing' &&
          state.status.turn === state.you
        }
        winningLine={state.status.kind === 'won' ? state.status.line : null}
        lastMoveIndex={state.lastMove?.index ?? null}
        onCellPress={actions.move}
      />

      <View style={styles.actionsRow}>
        <Pressable
          testID={TESTID.btnPesEt}
          disabled={state.status.kind !== 'playing'}
          onPress={actions.resign}
          style={[styles.button, { borderColor: theme.danger }]}
        >
          <Text style={{ color: theme.danger }}>{tr.room.resign}</Text>
        </Pressable>

        {state.status.kind !== 'playing' && state.rematch === null ? (
          <Pressable
            testID={TESTID.btnRovansTeklif}
            onPress={actions.offerRematch}
            style={[styles.button, { borderColor: theme.accent }]}
          >
            <Text style={{ color: theme.accent }}>{tr.rematch.offer}</Text>
          </Pressable>
        ) : null}

        {state.rematch !== null && state.rematch.by !== state.you ? (
          <Pressable
            testID={TESTID.btnRovansKabul}
            onPress={actions.acceptRematch}
            style={[styles.button, { borderColor: theme.accent }]}
          >
            <Text style={{ color: theme.accent }}>{tr.rematch.accept}</Text>
          </Pressable>
        ) : null}
      </View>

      {state.connection === 'kopuk' ? (
        <Pressable
          onPress={actions.reconnect}
          style={[styles.button, { borderColor: theme.accent }]}
        >
          <Text style={{ color: theme.accent }}>{tr.common.retry}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  code: { fontSize: 20, fontWeight: '700', letterSpacing: 2 },
  hidden: { position: 'absolute', opacity: 0, height: 0, width: 0 },
  actionsRow: { flexDirection: 'row', gap: spacing.md },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
  },
})
