import { HomeActions } from '@/components/home/HomeActions'
import { tr } from '@/messages/tr'

export default function HomePage(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-4xl font-bold tracking-tight">{tr.app.name}</h1>
      <p className="text-center opacity-70">{tr.app.tagline}</p>
      <HomeActions />
    </main>
  )
}
