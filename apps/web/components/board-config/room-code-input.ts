import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@xox/shared'

/**
 * `JoinCodeField.tsx`'in ham girdi normalleştirmesiyle AYNI kural (KK-030/033/
 * 034, W1-05 düzeltmesi): alfabe dışı her karakter (boşluk dâhil) anında
 * yutulur, `ROOM_CODE_LENGTH`'ten fazlası kabul edilmez — SÜZ, SONRA KIRP
 * sırası. `JoinCodeField`in kendi fonksiyonu dışa AKTARILMADIĞI (ve o dosya
 * bu kartın çakışma kümesi DIŞINDA olduğu, Home'un hızlı-katıl alanı hâlâ onu
 * kullandığı) için `JoinRoomPreview` (katılma ekranının ÖNİZLEMELİ akışı)
 * kendi kopyasını burada SAF bir fonksiyon olarak taşır — davranış BİREBİR
 * aynıdır ve W1-05'in regresyon testleri burada da tekrarlanır
 * (`room-code-input.test.ts`).
 *
 * native `maxLength` BİLEREK KULLANILMAZ (aynı gerekçe, `JoinCodeField.tsx`
 * başlık yorumu): tarayıcı onu React'in `onChange`'i görmeden ÖNCE ham metne
 * uygular ve yapıştırılan metinde karakter kaybına yol açar.
 */
export function normalizeRoomCodeInput(raw: string): string {
  let normalized = ''
  for (const char of raw.toUpperCase()) {
    if (ROOM_CODE_ALPHABET.includes(char)) normalized += char
  }
  return normalized.slice(0, ROOM_CODE_LENGTH)
}
