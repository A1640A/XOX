import { ProfileContent } from '@/components/profile/ProfileContent'

export default function ProfilPage(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6 py-12">
      <ProfileContent />
    </main>
  )
}
