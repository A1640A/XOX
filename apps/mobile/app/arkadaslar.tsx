import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { spacing } from '@xox/ui-tokens'
import { useSession } from '../lib/auth/session'
import { getApiBaseUrl } from '../lib/env'
import { fetchFriends, type FriendsView } from '../lib/friends/api'
import { useTheme } from '../lib/theme'
import { tr } from '../messages/tr'

export default function ArkadaslarScreen(): React.ReactElement {
  const theme = useTheme()
  const session = useSession()
  const [view, setView] = useState<FriendsView | null>(null)

  useEffect(() => {
    // `isCancelled()` bir FONKSİYON ÇAĞRISIDIR — `@typescript-eslint/
    // no-unnecessary-condition` bir `let`/nesne özelliğini bir `await`
    // sonrası İKİNCİ kez kontrol edince (ilk kontrolün ZATEN daralttığını
    // varsayıp) "her zaman doğru/yanlış" YANLIŞ POZİTİFİ üretiyor — oysa
    // aradaki `await` sırasında temizleyici GERÇEKTEN çalışabilir. Fonksiyon
    // çağrısının dönüş değeri TS tarafından zaman içinde DARALTILMAZ (her
    // çağrı bağımsız değerlendirilir), bu yüzden yanlış pozitifi önler.
    let cancelled = false
    const isCancelled = (): boolean => cancelled

    async function load(): Promise<void> {
      const token = await session.ensureAccessToken()
      if (token === null || isCancelled()) return
      const result = await fetchFriends(getApiBaseUrl(), token)
      if (!isCancelled() && result.ok) setView(result.data)
    }

    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız gerçek giriş/çıkış geçişinde yeniden çek
  }, [session.status])

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>{tr.friends.title}</Text>

      {view === null ? (
        <Text style={{ color: theme.textMuted }}>{tr.common.loading}</Text>
      ) : view.friends.length === 0 && view.incoming.length === 0 ? (
        <Text style={{ color: theme.textMuted }}>{tr.friends.empty}</Text>
      ) : (
        <>
          {view.incoming.length > 0 ? (
            <View style={styles.section}>
              <Text style={{ color: theme.text, fontWeight: '600' }}>{tr.friends.pending}</Text>
              {view.incoming.map((entry) => (
                <Text key={entry.userId} style={{ color: theme.text }}>
                  {entry.name}
                </Text>
              ))}
            </View>
          ) : null}
          <View style={styles.section}>
            {view.friends.map((entry) => (
              <Text key={entry.userId} style={{ color: theme.text }}>
                {entry.name} · {entry.elo}
              </Text>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  title: { fontSize: 24, fontWeight: '700' },
  section: { gap: spacing.xs, alignItems: 'center' },
})
