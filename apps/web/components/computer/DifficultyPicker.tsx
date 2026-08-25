import type { Difficulty } from '@xox/game-core'
import { TESTID } from '@xox/shared'
import { tr } from '@/messages/tr'

export interface DifficultyPickerProps {
  readonly value: Difficulty
  readonly onChange: (next: Difficulty) => void
}

const OPTIONS: readonly { readonly value: Difficulty; readonly testId: string }[] = [
  { value: 'easy', testId: TESTID.zorlukEasy },
  { value: 'medium', testId: TESTID.zorlukMedium },
  { value: 'unbeatable', testId: TESTID.zorlukUnbeatable },
]

function difficultyLabel(difficulty: Difficulty): string {
  switch (difficulty) {
    case 'easy':
      return tr.computer.easy
    case 'medium':
      return tr.computer.medium
    case 'unbeatable':
      return tr.computer.unbeatable
  }
}

/** KK-020: üç zorluk düğmesi, varsayılan `zorluk-medium`. Seçim tek kapıdan (`onChange`) geçer. */
export function DifficultyPicker({ value, onChange }: DifficultyPickerProps): React.ReactElement {
  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="text-text-muted text-sm">{tr.computer.difficulty}</legend>
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
            className="border-border aria-pressed:bg-accent aria-pressed:text-surface rounded border-2 px-3 py-1"
          >
            {difficultyLabel(option.value)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
