'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  roomCodeSchema,
  roomStateResponseSchema,
  errorResponseSchema,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  TESTID,
  type ErrorCode,
} from '@xox/shared'
import { tr } from '@/messages/tr'
import { ErrorBanner } from './ErrorBanner'

/**
 * Oda kodu girişi (KK-030/033/034). Ana sayfada (`HomeActions`) ve
 * `/oda/katil`'de BİREBİR aynı bileşen kullanılır — "derin bağlanabilir eş"
 * gereksinimi (W1-04 kriter 1) bu paylaşım sayesinde otomatik sağlanır.
 *
 * Normalleştirme her tuş vuruşunda olur (`onChange`), gönderimde DEĞİL:
 * `ROOM_CODE_ALPHABET` dışı her karakter (boşluk dâhil, çünkü boşluk da
 * alfabede yok) anında yutulur, `ROOM_CODE_LENGTH`'ten fazlası kabul
 * edilmez. Bu yüzden gönderim anında `value` zaten ya boş/eksik ya da tam
 * geçerli bir kod hâlindedir; `roomCodeSchema.safeParse` yalnızca uzunluğu
 * doğrular ve set DIŞI karakter sunucuya asla İSTEK OLARAK gitmez (kriter 3).
 *
 * Format geçerliyse oda var mı / dolu mu diye `GET /api/rooms/[code]`'a
 * sorulur (KK-033) — yalnızca istemci tarafı biçim kontrolü YETERLİ DEĞİLDİR,
 * çünkü `ROOM_NOT_FOUND`/`ROOM_FULL` sunucu durumuna bağlıdır.
 */
function normalizeInput(raw: string): string {
  let normalized = ''
  for (const char of raw.toUpperCase()) {
    if (ROOM_CODE_ALPHABET.includes(char)) normalized += char
  }
  return normalized.slice(0, ROOM_CODE_LENGTH)
}

export function JoinCodeField(): React.ReactElement {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState<ErrorCode | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const parsed = roomCodeSchema.safeParse(value)
    if (!parsed.success) {
      setError('INVALID_CODE')
      return
    }
    setError(null)
    setPending(true)
    try {
      const response = await fetch(`/api/rooms/${parsed.data}`)
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null)
        const parsedError = errorResponseSchema.safeParse(body)
        setError(parsedError.success ? parsedError.data.code : 'SERVER_ERROR')
        return
      }
      const body: unknown = await response.json()
      const parsedRoom = roomStateResponseSchema.safeParse(body)
      if (!parsedRoom.success) {
        setError('SERVER_ERROR')
        return
      }
      // İnceleme: `canJoin === false` KÖRLEMESİNE ROOM_FULL'e eşlenemez —
      // `waiting` durumunda koltuklar dolu OLABİLİR ama oda `finished` iken
      // de `canJoin` false döner ve o oda dolu değil, oyun BİTMİŞTİR (KK-033).
      // `playing` durumunda ise `join.ts`'in tek yazımlı geçişi (`state:
      // 'playing'` yalnız ikinci koltuk dolarken YAZILIR) iki koltuğun da
      // dolu olduğunu garanti eder — bu yüzden `ROOM_FULL` orada da doğrudur.
      if (parsedRoom.data.state === 'finished') {
        setError('GAME_OVER')
        return
      }
      if (!parsedRoom.data.canJoin) {
        setError('ROOM_FULL')
        return
      }
      router.push(`/oda/${parsedRoom.data.code}`)
    } catch {
      setError('NETWORK')
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor="join-code" className="text-sm font-medium">
        {tr.home.codePlaceholder}
      </label>
      <div className="flex gap-2">
        <input
          id="join-code"
          value={value}
          onChange={(event) => {
            setValue(normalizeInput(event.target.value))
          }}
          placeholder={tr.home.codePlaceholder}
          className="border-border flex-1 border p-2"
          // DÜZELTME (W1-05, E2E-002'nin bulduğu gerçek hata): native `maxLength`
          // BURADA KASITLI OLARAK KULLANILMIYOR. Tarayıcı `maxLength`'i React'in
          // `onChange`'i devreye girmeden ÖNCE, ham (normalize edilmemiş) metin
          // üzerinde uygular — yapıştırılan " abc234 " (baştaki boşlukla) önce
          // 6 ham karaktere (" abc23") kırpılır, SONRA `normalizeInput` boşluğu
          // atınca sondaki '4' hiç görülmeden "ABC23" kalır: bir karakter kaybı.
          // Uzunluk sınırı artık YALNIZ `normalizeInput`'un sonundaki
          // `.slice(0, ROOM_CODE_LENGTH)` tarafından, SÜZÜLMÜŞ (alfabe dışı
          // karakterler atılmış) metin üzerinde uygulanıyor — bu sıra farkı
          // hatayı ortadan kaldırıyor.
          //
          // Erişilebilirlik notu: `maxLength` kaldırılınca ekran okuyucuya
          // alan uzunluğu native nitelik üzerinden bildirilmiyor olabilir, ama
          // bu bilgi zaten KAYBOLMUYOR — görünür `<label>` metni ("Oda kodu (6
          // hane)", `tr.home.codePlaceholder`) `htmlFor`/`id` ile input'a
          // bağlı ve uzunluğu açıkça söylüyor; ekran okuyucu her odaklanmada
          // bunu okur. Ayrıca sunucu tarafı `roomCodeSchema` zaten tam 6
          // karakter dışını reddediyor, yani biçim doğrulaması native
          // niteliğe hiçbir zaman tek başına dayanmıyordu.
        />
        <button type="submit" data-testid={TESTID.btnOdayaKatil} disabled={pending}>
          {tr.home.joinRoom}
        </button>
      </div>
      <ErrorBanner code={error} />
    </form>
  )
}
