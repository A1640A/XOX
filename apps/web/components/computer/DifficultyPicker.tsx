import type { Difficulty } from '@xox/game-core'
import { TESTID } from '@xox/shared'
import { buttonToggle, mutedText } from '@/components/ui/styles'
import { tr } from '@/messages/tr'

export interface DifficultyPickerProps {
  readonly value: Difficulty
  readonly onChange: (next: Difficulty) => void
  /**
   * Aktif tahta KENAR uzunluğu (KK-B47, ADR-0013 §7 — "dürüst Zor etiketi").
   * `Difficulty` tipi ve `zorluk-unbeatable` test-id'si DEĞİŞMEZ: yalnız
   * `unbeatable` değerinin GÖRÜNÜR etiketi `size`e göre değişir.
   *
   * Gerekçe ölçülmüş: KK-B20'nin tümevarımsal yenilmezlik kanıtı (642 oyun,
   * `ai.test.ts`) YALNIZ `size === 3`ün TAM minimaks yolunu (`bestMove`)
   * kapsar. `size > 3`te `chooseMove` bütçeli/derinlik sınırlı aramaya
   * (`searchMove`, ADR-0013 §2–§4) gider — 11×11 bütçe içinde derinlik 4'e
   * ulaşır (güçlü) ama ağacın SONUNA kadar aranmaz (yenilmez değil). Aynı
   * `Difficulty` değerine `size > 3`te "Yenilmez" demek kanıtlanmamış bir
   * iddia olurdu; bu yüzden o durumda `tr.computer.hard` ("Zor") gösterilir.
   */
  readonly size: number
}

const OPTIONS: readonly { readonly value: Difficulty; readonly testId: string }[] = [
  { value: 'easy', testId: TESTID.zorlukEasy },
  { value: 'medium', testId: TESTID.zorlukMedium },
  { value: 'unbeatable', testId: TESTID.zorlukUnbeatable },
]

function difficultyLabel(difficulty: Difficulty, size: number): string {
  switch (difficulty) {
    case 'easy':
      return tr.computer.easy
    case 'medium':
      return tr.computer.medium
    case 'unbeatable':
      return size === 3 ? tr.computer.unbeatable : tr.computer.hard
  }
}

/**
 * KK-020: üç zorluk düğmesi, varsayılan `zorluk-medium`. Seçim tek kapıdan
 * (`onChange`) geçer. `size > 3`te dürüstlük notu (`tr.computer.strengthNote`)
 * görünür — bkz. `DifficultyPickerProps.size` belgesi.
 */
export function DifficultyPicker({
  value,
  onChange,
  size,
}: DifficultyPickerProps): React.ReactElement {
  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className={`${mutedText} text-sm`}>{tr.computer.difficulty}</legend>
      <div className="flex gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            data-testid={option.testId}
            aria-pressed={value === option.value}
            onClick={() => {
              onChange(option.value)
            }}
            className={buttonToggle}
          >
            {difficultyLabel(option.value, size)}
          </button>
        ))}
      </div>
      {size > 3 && <p className={`${mutedText} text-sm`}>{tr.computer.strengthNote}</p>}
    </fieldset>
  )
}
