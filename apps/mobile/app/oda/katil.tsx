import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { roomCodeSchema, TESTID, type ErrorCode } from '@xox/shared'
import { spacing } from '@xox/ui-tokens'
import { fetchRoomState } from '../../lib/rooms/api'
import { useSession } from '../../lib/auth/session'
import { getApiBaseUrl } from '../../lib/env'
import { useTheme } from '../../lib/theme'
import { tr } from '../../messages/tr'

/**
 * `/oda/katil` — kod GİRİLİR, sunucu tarafında doğrulanır
 * (`GET /api/rooms/[code]`, KK-033/034) ve yalnız `canJoin` doğruysa
 * `/oda/[kod]`e yönlendirilir. İstemci normalleştirmesi (trim+upper) tek
 * savunma hattı DEĞİLDİR — sunucu zaten kendi kopyasını yapar.
 */
export default function OdaKatilScreen(): React.ReactElement {
  const theme = useTheme()
  const session = useSession()
  const router = useRouter()
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ErrorCode | null>(null)

  async function handleJoin(): Promise<void> {
    setPending(true)
    setError(null)
    try {
      const normalized = code.trim().toUpperCase()
      const parsed = roomCodeSchema.safeParse(normalized)
      if (!parsed.success) {
        setError('INVALID_CODE')
        return
      }
      const token = await session.ensureAccessToken()
      if (token === null) {
        setError('UNAUTHENTICATED')
        return
      }
      const result = await fetchRoomState(getApiBaseUrl(), token, parsed.data)
      if (!result.ok) {
        setError(result.code)
        return
      }
      if (!result.data.canJoin) {
        setError('ROOM_FULL')
        return
      }
      router.push(`/oda/${parsed.data}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>{tr.home.joinRoom}</Text>
      <TextInput
        testID="oda-kodu-girdi"
        accessibilityLabel={tr.home.codePlaceholder}
        placeholder={tr.home.codePlaceholder}
        placeholderTextColor={theme.textMuted}
        autoCapitalize="characters"
        maxLength={6}
        value={code}
        onChangeText={setCode}
        style={[styles.input, { borderColor: theme.border, color: theme.text }]}
      />
      <Pressable
        testID={TESTID.btnOdayaKatil}
        disabled={pending}
        onPress={() => {
          void handleJoin()
        }}
        style={[styles.button, { borderColor: theme.accent }]}
      >
        <Text style={{ color: theme.accent, fontWeight: '600' }}>{tr.home.joinRoom}</Text>
      </Pressable>
      {error !== null ? (
        <Text testID={TESTID.hataMesaji} style={{ color: theme.danger }}>
          {tr.errors[error]}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  title: { fontSize: 24, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    width: '100%',
    maxWidth: 320,
    textAlign: 'center',
  },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
  },
})
