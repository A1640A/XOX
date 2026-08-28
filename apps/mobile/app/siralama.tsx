import { StyleSheet, Text, View } from 'react-native'
import { spacing } from '@xox/ui-tokens'
import { useTheme } from '../lib/theme'
import { tr } from '../messages/tr'

/**
 * KK-092 rota iskeleti — `GET /api/leaderboard` henüz UYGULANMADI (yalnız
 * planlanan yüzeyde, bkz. `docs/memory/api-contract.md`). Rota var-olma
 * gerekliliği (kart §route snapshot testi) burada karşılanır; canlı veri
 * bağlama backend uç noktası geldiğinde AYRI bir kartla yapılır.
 */
export default function SiralamaScreen(): React.ReactElement {
  const theme = useTheme()
  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>{tr.leaderboard.title}</Text>
      <Text style={{ color: theme.textMuted }}>{tr.leaderboard.empty}</Text>
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
