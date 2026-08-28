'use client'

import { BOARD_MODES, type BoardConfig, type BoardMode } from '@xox/game-core'
import { TESTID } from '@xox/shared'
import { buttonToggle, mutedText } from '@/components/ui/styles'
import { tr } from '@/messages/tr'
import { sizeLabel } from './size-label'
import { useBoardModes } from './use-board-modes'

export interface BoardConfigPickerProps {
  readonly value: BoardConfig
  readonly onChange: (config: BoardConfig) => void
  /**
   * Bugün SUNULAN boyutlar (ADR-0018 §3 kill switch, `getEnabledBoardSizes()`).
   * Belirtilmezse `BOARD_MODES`'un TAMAMI gösterilir: yerel bilgisayara karşı
   * oyun (oda kurmayan) hiçbir operasyonel kısıtlamaya tabi DEĞİLDİR
   * (`UI-COMP-001` bu bileşeni varsayılanla kullanacak).
   *
   * **Kapalı bir boyut burada hiç RENDER EDİLMEZ** — sessizce seçilip sonra
   * başka bir boyuta düşürülmez; kart §Sert şart 2'nin gereği budur.
   */
  readonly enabledSizes?: readonly number[]
  readonly disabled?: boolean
}

const ALL_SIZES: readonly number[] = BOARD_MODES.map((mode) => mode.size)

/**
 * `testids.ts` BİLEREK bir `boardSizeTestId(n)` fonksiyonu dışa vermiyor
 * (ADR-0016: "izinli boyutlar donmuş bir üçlüdür, bir fonksiyon var olmayan
 * bir boyutun kancasını üretebilir görüntüsü verirdi"). Bu, o kısıtla
 * ÇELİŞMEZ: kapalı bir `if` zinciri, `BOARD_MODES`'un DIŞINA asla çıkamaz —
 * yeni bir boyut eklense bile burada YENİ bir dal elle eklenmedikçe hiçbir
 * kanca üretilmez. `noUncheckedIndexedAccess` altında bir `Record<number,
 * string>` indekslemesi `string | undefined` döner; bu, tip güvenli kalır.
 */
function sizeTestId(size: number): string {
  if (size === 3) return TESTID.tahtaBoyut3
  if (size === 6) return TESTID.tahtaBoyut6
  return TESTID.tahtaBoyut11
}

function hintFor(size: number): string | null {
  if (size === 6) return tr.boardConfig.hint6
  if (size === 11) return tr.boardConfig.hint11
  return null
}

/**
 * Tahta boyutu + K (kazanma uzunluğu) seçici — uygulamanın TEK seçici
 * bileşeni (kart §Sert şart 1). Oda kurma ekranı (`HomeActions`) ve
 * bilgisayara karşı ekran (`UI-COMP-001`) bunu AYNI bileşeni kullanarak
 * çağırır; ikinci bir seçici YAZILMAZ.
 *
 * Kural mantığı YOKTUR: hangi K değerlerinin bir boyutla geçerli olduğu
 * `@xox/game-core`'un donmuş `BOARD_MODES` tablosundan okunur (ADR-0010),
 * burada yeniden yazılmaz/türetilmez.
 */
export function BoardConfigPicker({
  value,
  onChange,
  enabledSizes = ALL_SIZES,
  disabled = false,
}: BoardConfigPickerProps): React.ReactElement {
  // Tek türetme noktası `useBoardModes` (ROLLOUT-BOARD-001). Buradaki satır içi
  // `BOARD_MODES.filter(...)` ile hook bit bit AYNI mantığı taşıyordu; lead
  // birleştirdi. İkinci bir kopya açma — kapalı boyut listesi tek yerden gelmeli,
  // yoksa biri güncellenip diğeri unutulur (bu repoda bu örüntü bu hafta altı kez
  // hataya dönüştü).
  const modes = useBoardModes(enabledSizes)
  const activeMode: BoardMode | undefined =
    modes.find((mode) => mode.size === value.size) ?? modes[0]

  function selectSize(mode: BoardMode): void {
    const winLength = mode.winLengths.includes(value.winLength)
      ? value.winLength
      : mode.defaultWinLength
    onChange({ size: mode.size, winLength })
  }

  function selectWinLength(winLength: number): void {
    onChange({ size: value.size, winLength })
  }

  return (
    <fieldset className="flex flex-col gap-4 border-0 p-0" disabled={disabled}>
      <legend className="sr-only">{tr.boardConfig.title}</legend>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text">{tr.boardConfig.size}</span>
        <div role="group" aria-label={tr.boardConfig.size} className="flex gap-2">
          {modes.map((mode) => (
            <button
              key={mode.size}
              type="button"
              data-testid={sizeTestId(mode.size)}
              aria-pressed={mode.size === activeMode?.size}
              onClick={() => {
                selectSize(mode)
              }}
              className={buttonToggle}
            >
              {sizeLabel(mode.size)}
            </button>
          ))}
        </div>
      </div>

      {activeMode !== undefined && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text">{tr.boardConfig.winLength}</span>
          <div
            data-testid={TESTID.kazanmaUzunlugu}
            role="group"
            aria-label={tr.boardConfig.winLength}
            className="flex flex-col gap-2"
          >
            {activeMode.winLengths.length === 1 ? (
              <p className={`${mutedText} text-sm`}>{tr.boardConfig.winLengthFixed}</p>
            ) : (
              <div className="flex gap-2">
                {activeMode.winLengths.map((winLength) => (
                  <button
                    key={winLength}
                    type="button"
                    aria-pressed={winLength === value.winLength}
                    onClick={() => {
                      selectWinLength(winLength)
                    }}
                    className={buttonToggle}
                  >
                    {tr.boardConfig.winLengthOption.replace('{n}', String(winLength))}
                  </button>
                ))}
              </div>
            )}
          </div>
          {hintFor(activeMode.size) !== null && (
            <p className={`${mutedText} text-sm`}>{hintFor(activeMode.size)}</p>
          )}
        </div>
      )}
    </fieldset>
  )
}
