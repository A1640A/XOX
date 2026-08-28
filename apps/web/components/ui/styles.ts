/**
 * DESIGN-001b — "Kağıt & Mürekkep" (Yön A) bileşen katmanının ORTAK Tailwind
 * sınıf dizgileridir. `apps/web/components/board/**` HARİÇ tüm ekranlarda
 * (ADR-0017 §10) tekrarlanan buton/alan/kart kalıplarını TEK yerden verir —
 * her dosyanın kendi `"rounded border p-2"` gibi ham dizgisini yazmasındansa
 * (bu geceki taramada 12 dosyada birbirinden ufak farklarla tekrarlanıyordu).
 *
 * YENİ TOKEN TANIMLANMAZ: burada yalnız `@xox/ui-tokens`'ın ÜRETTİĞİ Tailwind
 * v4 utility sınıfları (`bg-accent`, `text-text-muted`, `border-border`, ...
 * — `packages/ui-tokens/src/colors.ts` → `apps/web/app/globals.css`'in
 * `@theme` bloğu) ve Tailwind'in KENDİ ölçeğinden `spacing`/`radius`
 * token'larıyla (`packages/ui-tokens/src/spacing.ts`: `radius.sm=6px`,
 * `radius.md=12px`) SAYISAL OLARAK ÇAKIŞAN sınıflar (`rounded-[6px]`,
 * `rounded-[12px]`) kullanılır. `spacing.ts` BİLEREK Tailwind'in `--spacing`
 * ad alanına bağlı DEĞİL (DESIGN-001a raporu) — bu yüzden standart
 * Tailwind aralık sınıfları (`p-2`, `gap-4` vb.) tercih edilir; bunların px
 * karşılıkları zaten `spacing.ts` ölçeğiyle birebir örtüşür (`p-4`=16px=
 * `spacing.md`, `p-6`=24px=`spacing.lg`).
 *
 * Hareket: `transition-colors duration-150`/`duration-200` sabitleri
 * `@xox/ui-tokens`'ın `motion.moveDurationMs`(150)/`motion.winDurationMs`(200)
 * değerleriyle SAYISAL olarak örtüşür (motion.ts'in kendisi tüketilmez —
 * o modül board/hareket CSS değişkenleri üretir, board/** bu kartın
 * kapsamı DIŞINDA). `motion-reduce:transition-none` Tailwind'in yerleşik
 * `prefers-reduced-motion` varyantıdır — rol talimatının "prefers-reduced-
 * motion saygı gör" şartını CSS düzeyinde, ekstra JS olmadan karşılar.
 */

/** Ana eylem: "Oda kur", "Katıl", "Kaydet", "Rövanş iste". */
export const buttonPrimary =
  'rounded-[6px] bg-accent px-4 py-2 text-sm font-semibold text-surface transition-colors duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none'

/** İkincil eylem: "Yeniden oyna", "Pes et", "Çıkış yap". */
export const buttonSecondary =
  'rounded-[6px] border border-text px-4 py-2 text-sm font-semibold text-text transition-colors duration-150 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none'

/** Küçük yardımcı eylem: "Kopyala", "Tekrar dene", "Sil". */
export const buttonGhostSmall =
  'rounded-[6px] border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors duration-150 hover:border-text hover:text-text disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none'

/** İki durumlu seçim düğmesi (`aria-pressed`) — boyut/K/zorluk/tema seçiciler. */
export const buttonToggle =
  'rounded-[6px] border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition-colors duration-150 aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-surface hover:border-text disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none'

/** Metin girişi: e-posta, parola, oda kodu, ad. */
export const textInput =
  'rounded-[6px] border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/** Oda kodu / süre gibi hane hizalı değerler. */
export const monoField = `${textInput} font-mono tracking-[0.15em] uppercase`

/** Yükseltilmiş yüzey — oda kartı, sonuç paneli, formların çerçevesi. */
export const card = 'rounded-[12px] border border-border bg-surface p-6'

/** Metin bağlantısı (buton olmayan, satır içi `<a>`/`<Link>`). */
export const textLink = 'text-accent underline underline-offset-4 hover:no-underline'

/** Durum rozeti (bağlantı durumu, "Bağlı"/"Kopuk" vb.) — renk çağıran tarafından eklenir. */
export const badgeBase =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold'

/** Ana başlık (hero, sayfa üstü) — Fraunces, ADR-0017'nin "ink" karakteri. */
export const headingDisplay = 'font-serif font-semibold tracking-tight text-text'

/** İkincil metin — açıklama, ipucu, meta bilgi. */
export const mutedText = 'text-text-muted'
