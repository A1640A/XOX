import { KayitForm } from '@/components/auth/KayitForm'
import { headingDisplay } from '@/components/ui/styles'
import { tr } from '@/messages/tr'

export default function KayitPage(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className={`${headingDisplay} text-2xl`}>{tr.auth.signUp}</h1>
      <KayitForm />
    </main>
  )
}
