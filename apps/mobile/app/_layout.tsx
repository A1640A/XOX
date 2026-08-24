import { Stack } from 'expo-router'

export default function RootLayout(): React.ReactElement {
  return <Stack screenOptions={{ headerShown: false }} />
}
