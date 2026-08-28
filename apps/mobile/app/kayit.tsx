import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { TESTID, type ErrorCode } from '@xox/shared'
import { spacing } from '@xox/ui-tokens'
import { registerAccount } from '../lib/auth/api'
import { getApiBaseUrl } from '../lib/env'
import { useTheme } from '../lib/theme'
import { tr } from '../messages/tr'

/**
 * Auth.js Credentials sağlayıcısı kullanıcı OLUŞTURMAZ (ADR-0009 B) — kayıt
 * `POST /api/auth/register` REST uç noktasıdır (AUTH-001). Native'den
 * Auth.js'in kendi CSRF çerez akışını (`signIn('credentials', …)`) doğrudan
 * taklit etmek KIRILGANDIR; bu yüzden kayıt SONRASI oturum otomatik
 * AÇILMAZ — kullanıcı `/giris` köprüsüyle (tarayıcı) giriş yapar. Web'in
 * "kayıt → otomatik oturum" kısayolu burada YOKTUR, bilinçli bir sapmadır.
 */
export default function KayitScreen(): React.ReactElement {
  const theme = useTheme()
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ErrorCode | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(): Promise<void> {
    setPending(true)
    setError(null)
    const result = await registerAccount(getApiBaseUrl(), { email, password, displayName })
    setPending(false)
    if (!result.ok) {
      setError(result.code)
      return
    }
    setSuccess(true)
  }

  if (success) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.text }}>{tr.auth.mobileReturn}</Text>
        <Pressable
          testID={TESTID.btnGiris}
          onPress={() => {
            router.replace('/giris')
          }}
          style={[styles.button, { borderColor: theme.accent }]}
        >
          <Text style={{ color: theme.accent, fontWeight: '600' }}>{tr.auth.signIn}</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>{tr.auth.signUp}</Text>

      <TextInput
        accessibilityLabel={tr.auth.displayName}
        placeholder={tr.auth.displayName}
        placeholderTextColor={theme.textMuted}
        value={displayName}
        onChangeText={setDisplayName}
        style={[styles.input, { borderColor: theme.border, color: theme.text }]}
      />
      <TextInput
        testID={TESTID.girisEposta}
        accessibilityLabel={tr.auth.email}
        placeholder={tr.auth.email}
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={[styles.input, { borderColor: theme.border, color: theme.text }]}
      />
      <TextInput
        testID={TESTID.girisParola}
        accessibilityLabel={tr.auth.password}
        placeholder={tr.auth.password}
        placeholderTextColor={theme.textMuted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={[styles.input, { borderColor: theme.border, color: theme.text }]}
      />

      <Pressable
        testID={TESTID.btnKayit}
        disabled={pending}
        onPress={() => {
          void handleSubmit()
        }}
        style={[styles.button, { borderColor: theme.accent }]}
      >
        <Text style={{ color: theme.accent, fontWeight: '600' }}>{tr.auth.signUp}</Text>
      </Pressable>

      {error !== null ? (
        <Text testID={TESTID.hataMesaji} style={{ color: theme.danger }}>
          {tr.errors[error]}
        </Text>
      ) : null}

      <Text style={{ color: theme.textMuted }}>
        {tr.auth.hasAccount} <Link href="/giris">{tr.auth.signIn}</Link>
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
  input: { borderWidth: 1, borderRadius: 8, padding: spacing.sm, width: '100%', maxWidth: 320 },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
  },
})
