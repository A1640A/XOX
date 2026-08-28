import { Stack } from 'expo-router'
import { SessionProvider } from '../lib/auth/session'

export default function RootLayout(): React.ReactElement {
  return (
    <SessionProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SessionProvider>
  )
}
