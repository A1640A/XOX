import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { TESTID, type BoardConfigShape, type ErrorCode } from '@xox/shared'
import { fontSize, spacing } from '@xox/ui-tokens'
import { useSession } from '../lib/auth/session'
import { getApiBaseUrl } from '../lib/env'
import { createRoom } from '../lib/rooms/api'
import { useTheme } from '../lib/theme'
import { tr } from '../messages/tr'

export default function HomeScreen(): React.ReactElement {
  const theme = useTheme()
  const session = useSession()

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { backgroundColor: theme.bg }]}
      testID="mobile-home"
    >
      <Text style={[styles.title, { color: theme.text }]}>{tr.app.name}</Text>
      <Text style={[styles.tagline, { color: theme.textMuted }]}>{tr.app.tagline}</Text>

      {session.status === 'yukleniyor' ? (
        <Text style={{ color: theme.textMuted }}>{tr.common.loading}</Text>
      ) : session.status === 'girmedi' ? (
        <View style={styles.actions}>
          <Link href="/giris">{tr.auth.signIn}</Link>
          <Link href="/kayit">{tr.auth.signUp}</Link>
        </View>
      ) : (
        <SignedInHome displayName={session.name ?? ''} />
      )}
    </ScrollView>
  )
}

function SignedInHome({ displayName }: { readonly displayName: string }): React.ReactElement {
  const theme = useTheme()
  const session = useSession()
  const router = useRouter()
  const [config, setConfig] = useState<BoardConfigShape>({ size: 3, winLength: 3 })
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<ErrorCode | null>(null)

  async function handleCreateRoom(): Promise<void> {
    setCreating(true)
    setError(null)
    try {
      const token = await session.ensureAccessToken()
      if (token === null) {
        setError('UNAUTHENTICATED')
        return
      }
      const result = await createRoom(getApiBaseUrl(), token, config)
      if (!result.ok) {
        setError(result.code)
        return
      }
      router.push(`/oda/${result.data.code}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <View style={styles.actions}>
      <Text style={{ color: theme.text }}>{tr.home.welcome.replace('{ad}', displayName)}</Text>

      <Pressable
        testID={TESTID.btnBilgisayaraKarsi}
        onPress={() => {
          router.push('/oyna/bilgisayar')
        }}
        style={[styles.button, { borderColor: theme.accent, backgroundColor: theme.surface }]}
      >
        <Text style={[styles.buttonText, { color: theme.accent }]}>{tr.home.playVsComputer}</Text>
      </Pressable>

      <View style={styles.sizeRow}>
        {(
          [
            { size: 3, testID: TESTID.tahtaBoyut3, label: tr.boardConfig.size3, winLength: 3 },
            { size: 6, testID: TESTID.tahtaBoyut6, label: tr.boardConfig.size6, winLength: 4 },
            { size: 11, testID: TESTID.tahtaBoyut11, label: tr.boardConfig.size11, winLength: 5 },
          ] as const
        ).map((option) => (
          <Pressable
            key={option.size}
            testID={option.testID}
            onPress={() => {
              setConfig({ size: option.size, winLength: option.winLength })
            }}
            style={[
              styles.sizeButton,
              {
                borderColor: config.size === option.size ? theme.accent : theme.border,
                backgroundColor: theme.surface,
                borderWidth: config.size === option.size ? 2 : 1,
              },
            ]}
          >
            <Text style={{ color: config.size === option.size ? theme.accent : theme.text }}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text testID={TESTID.oyunAyariOzeti} style={{ color: theme.textMuted }}>
        {tr.boardConfig.summary
          .replace('{boyut}', `${String(config.size)}×${String(config.size)}`)
          .replace('{n}', String(config.winLength))}
      </Text>

      <Pressable
        testID={TESTID.btnOdaKur}
        disabled={creating}
        onPress={() => {
          void handleCreateRoom()
        }}
        style={[styles.button, { borderColor: theme.accent, backgroundColor: theme.surface }]}
      >
        <Text style={[styles.buttonText, { color: theme.accent }]}>{tr.home.createRoom}</Text>
      </Pressable>

      <Pressable
        testID={TESTID.btnOdayaKatil}
        onPress={() => {
          router.push('/oda/katil')
        }}
        style={[styles.button, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <Text style={{ color: theme.text }}>{tr.home.joinRoom}</Text>
      </Pressable>

      {error !== null ? (
        <Text testID={TESTID.hataMesaji} style={{ color: theme.danger }}>
          {tr.errors[error]}
        </Text>
      ) : null}

      <View style={styles.linkRow}>
        <Link href="/profil">{tr.profile.title}</Link>
        <Link href="/siralama">{tr.leaderboard.title}</Link>
        <Link href="/gecmis">{tr.history.title}</Link>
        <Link href="/arkadaslar">{tr.friends.title}</Link>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  title: { fontSize: fontSize.display, fontWeight: '700' },
  tagline: { fontSize: fontSize.base },
  actions: { gap: spacing.md, alignItems: 'center', width: '100%' },
  sizeRow: { flexDirection: 'row', gap: spacing.sm },
  sizeButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: 8,
  },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 220,
    alignItems: 'center',
  },
  buttonText: { fontWeight: '600' },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
})
