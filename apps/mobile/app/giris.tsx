import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { errorCodeSchema, TESTID } from '@xox/shared'
import { spacing } from '@xox/ui-tokens'
import { useSession } from '../lib/auth/session'
import { useTheme } from '../lib/theme'
import { tr } from '../messages/tr'

/**
 * KK-009 mobil köprüsü (ADR-0005) — bu ekranın TEK işi
 * `WebBrowser.openAuthSessionAsync`i tetiklemektir. Web'in KENDİ `/giris`
 * formu (e-posta/parola) burada TEKRAR YAZILMAZ: kimlik doğrulama
 * tarayıcıda, `apps/web/components/auth/GirisForm.tsx` ile yapılır — mobil
 * yalnız o akışın açılışını/dönüşünü yönetir (`tr.auth.mobileOpening`/
 * `mobileReturn`).
 */
export default function GirisScreen(): React.ReactElement {
  const theme = useTheme()
  const session = useSession()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn(): Promise<void> {
    setPending(true)
    setError(null)
    try {
      const result = await session.signIn()
      if (!result.ok) {
        const parsed = errorCodeSchema.safeParse(result.code)
        setError(parsed.success ? parsed.data : result.code)
        return
      }
      router.replace('/')
    } finally {
      setPending(false)
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>{tr.auth.signIn}</Text>

      <Pressable
        testID={TESTID.btnGiris}
        disabled={pending}
        onPress={() => {
          void handleSignIn()
        }}
        style={[styles.button, { borderColor: theme.accent }]}
      >
        <Text style={{ color: theme.accent, fontWeight: '600' }}>
          {pending ? tr.auth.mobileOpening : tr.auth.signIn}
        </Text>
      </Pressable>

      {error !== null ? (
        <Text testID={TESTID.hataMesaji} style={{ color: theme.danger }}>
          {errorCodeSchema.safeParse(error).success
            ? tr.errors[errorCodeSchema.parse(error)]
            : tr.common.error}
        </Text>
      ) : null}

      <Text style={{ color: theme.textMuted }}>
        {tr.auth.noAccount} <Link href="/kayit">{tr.auth.signUp}</Link>
      </Text>
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
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
  },
})
