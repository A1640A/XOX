import { Suspense } from 'react'
import { GirisForm } from '@/components/auth/GirisForm'
import { headingDisplay, mutedText } from '@/components/ui/styles'
import { tr } from '@/messages/tr'

export default function GirisPage(): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className={`${headingDisplay} text-2xl`}>{tr.auth.signIn}</h1>
      {/* useSearchParams (`?donus=`) statik render'da Suspense sınırı ister. */}
      <Suspense fallback={<p className={mutedText}>{tr.common.loading}</p>}>
        <GirisForm />
      </Suspense>
    </main>
  )
}
