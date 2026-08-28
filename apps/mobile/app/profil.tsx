import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { TESTID, type ProfileResponse } from '@xox/shared'
import { spacing } from '@xox/ui-tokens'
import { useSession } from '../lib/auth/session'
import { getApiBaseUrl } from '../lib/env'
import { fetchProfile } from '../lib/profile/api'
import { useTheme } from '../lib/theme'
import { tr } from '../messages/tr'

export default function ProfilScreen(): React.ReactElement {
  const theme = useTheme()
  const session = useSession()
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileResponse | null>(null)

  useEffect(() => {
    // Bkz. `app/arkadaslar.tsx` başlığı: `isCancelled()` fonksiyon çağrısı,
    // `let`in yanlış pozitif ürettiği @typescript-eslint/no-unnecessary-condition
    // daralmasını önler (dönüş değeri zaman içinde daraltılmaz).
    let cancelled = false
    const isCancelled = (): boolean => cancelled

    async function load(): Promise<void> {
      const token = await session.ensureAccessToken()
      if (token === null || isCancelled()) return
      const result = await fetchProfile(getApiBaseUrl(), token)
      if (!isCancelled() && result.ok) setProfile(result.data)
    }

    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız gerçek giriş/çıkış geçişinde yeniden çek
  }, [session.status])

  async function handleSignOut(): Promise<void> {
    await session.signOut()
    router.replace('/')
  }

  if (session.status !== 'girdi') {
    return (
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.text }}>{tr.errors.UNAUTHENTICATED}</Text>
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>{tr.profile.title}</Text>
      <Text style={{ color: theme.text }}>{profile?.name ?? session.name ?? ''}</Text>

      {profile !== null ? (
        <>
          <Text testID={TESTID.eloPuani} style={{ color: theme.text }}>
            {tr.profile.elo}: {profile.elo}
          </Text>
          <Text testID={TESTID.istatistikGalibiyet} style={{ color: theme.text }}>
            {tr.profile.wins}: {profile.stats.wins}
          </Text>
          <Text testID={TESTID.istatistikMaglubiyet} style={{ color: theme.text }}>
            {tr.profile.losses}: {profile.stats.losses}
          </Text>
          <Text testID={TESTID.istatistikBeraberlik} style={{ color: theme.text }}>
            {tr.profile.draws}: {profile.stats.draws}
          </Text>
        </>
      ) : (
        <Text style={{ color: theme.textMuted }}>{tr.common.loading}</Text>
      )}

      <Pressable
        onPress={() => {
          void handleSignOut()
        }}
        style={[styles.button, { borderColor: theme.danger }]}
      >
        <Text style={{ color: theme.danger }}>{tr.auth.signOut}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  title: { fontSize: 24, fontWeight: '700' },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
  },
})
