import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { ErrorBanner } from '@/components/ErrorBanner'
import { inviteRedirect, normalizeInviteCode } from '../invite-target'

interface DavetPageProps {
  readonly params: Promise<{ kod: string }>
}

/**
 * Davet linkinin iniş sayfası — KK-121. Kendisi hiçbir şey GÖSTERMEZ, yalnız
 * yönlendirir; tek görünür çıktısı geçersiz koddaki hata şeridi.
 *
 * **Bu rota middleware korumasında DEĞİLDİR** (`auth.config.ts`'in matcher'ı
 * `/oda`, `/oyna`, `/profil`, `/siralama`, `/gecmis`, `/arkadaslar`). Bilerek:
 * oturumsuz bir kullanıcı önce `/davet/<KOD>`u AÇABİLMELİ ki bu sayfa oda
 * kodunu `donus`a koyarak `/giris`e yollasın. Middleware korusaydı yönlendirme
 * `/giris?donus=/davet/<KOD>` olurdu ve kullanıcı giriş sonrası buraya geri
 * gelip ikinci bir tur atardı.
 *
 * **Sıra önemli:** kod ÖNCE doğrulanır, oturum SONRA okunur. Ters sırada,
 * bozuk kodlu her istek gereksiz bir oturum çözümlemesi yapardı.
 *
 * **Tek hata bölgesi** (UI-002'nin bulduğu tuzak): sayfada `hata-mesaji`
 * kancasını taşıyan TEK bir düğüm var. İkincisi eklenirse E2E'nin
 * `getByTestId('hata-mesaji')` çağrısı "found multiple elements" ile patlar.
 */
export default async function DavetPage({ params }: DavetPageProps): Promise<React.ReactElement> {
  const { kod } = await params
  const code = normalizeInviteCode(kod)

  if (code === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6">
        <ErrorBanner code="INVALID_CODE" />
      </main>
    )
  }

  const session = await auth()
  redirect(inviteRedirect(code, session?.user !== undefined))
}
