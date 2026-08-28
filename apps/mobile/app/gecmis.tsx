import { StyleSheet, Text, View } from 'react-native'
import { spacing } from '@xox/ui-tokens'
import { useTheme } from '../lib/theme'
import { tr } from '../messages/tr'

/**
 * KK-092 rota iskeleti — `GET /api/matches` henüz UYGULANMADI (yalnız
 * planlanan yüzeyde, bkz. `docs/memory/api-contract.md`). Bkz. `siralama.tsx`
 * başlığı — aynı gerekçe.
 */
export default function GecmisScreen(): React.ReactElement {
  const theme = useTheme()
  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>{tr.history.title}</Text>
      <Text style={{ color: theme.textMuted }}>{tr.history.empty}</Text>
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
})
