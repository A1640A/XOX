import { roomCodeSchema } from '@xox/shared'
import { ErrorBanner } from '@/components/ErrorBanner'
import { RoomScreen } from '@/components/room/RoomScreen'

interface RoomPageProps {
  readonly params: Promise<{ kod: string }>
}

export default async function OdaPage({ params }: RoomPageProps): Promise<React.ReactElement> {
  const { kod } = await params
  const parsed = roomCodeSchema.safeParse(kod.trim().toUpperCase())

  if (!parsed.success) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6">
        <ErrorBanner code="INVALID_CODE" />
      </main>
    )
  }

  return <RoomScreen roomCode={parsed.data} />
}
