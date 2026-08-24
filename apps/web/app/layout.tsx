import type { Metadata } from 'next'
import { tr } from '@/messages/tr'
import './globals.css'

export const metadata: Metadata = {
  title: tr.app.name,
  description: tr.app.tagline,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <html lang="tr">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
