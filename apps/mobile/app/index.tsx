import { StyleSheet, Text, View } from 'react-native'
import { colors, fontSize, spacing } from '@xox/ui-tokens'

export default function HomeScreen(): React.ReactElement {
  return (
    <View style={styles.container} testID="mobile-home">
      <Text style={styles.title}>XOX</Text>
      <Text style={styles.tagline}>Arkadaşınla ya da bilgisayara karşı oyna</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.light.bg,
  },
  title: { fontSize: fontSize.display, fontWeight: '700', color: colors.light.text },
  tagline: { fontSize: fontSize.base, color: colors.light.textMuted },
})
