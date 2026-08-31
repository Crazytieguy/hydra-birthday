import { useRef } from 'react'

// The one heart shape everywhere: vote buttons and the header logo.
export const HEART =
  'M12 20.5C7.5 16.5 4 13.6 4 9.9 4 7.4 6 5.5 8.4 5.5c1.4 0 2.7.7 3.6 1.8.9-1.1 2.2-1.8 3.6-1.8C18 5.5 20 7.4 20 9.9c0 3.7-3.5 6.6-8 10.6z'

export type Vote = 'regular' | 'strong' | null

const LABELS: Record<'regular' | 'strong' | 'none', string> = {
  none: 'No vote. Tap to vote',
  regular: 'Voted. Tap to strong vote',
  strong: 'Strong vote. Tap to remove your vote',
}

// One button, three states: tap fills the small heart (vote), tap again fills
// the big one too (strong vote), a third tap clears. Mouse and pen fire on
// press for snappiness; touch stays on release so starting a scroll on the
// button doesn't cast votes; keyboard comes through as a detail-0 click.
export function HeartVote({
  vote,
  disabled,
  onCycle,
}: {
  vote: Vote
  disabled?: boolean
  onCycle: () => void
}) {
  const firedOnPress = useRef(false)
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={vote !== null}
      aria-label={LABELS[vote ?? 'none']}
      onPointerDown={(e) => {
        if (e.pointerType !== 'touch' && e.button === 0) {
          firedOnPress.current = true
          onCycle()
        }
      }}
      onClick={() => {
        if (firedOnPress.current) {
          firedOnPress.current = false
          return
        }
        onCycle()
      }}
      className={`flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
        vote !== null
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/50'
      }`}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d={HEART}
          fill={vote === 'strong' ? 'var(--primary)' : 'none'}
          stroke={vote === null ? 'var(--muted-foreground)' : 'var(--primary)'}
          strokeWidth="1.6"
        />
        <g transform="translate(12 12.4) scale(0.48) translate(-12 -12)">
          <path
            d={HEART}
            fill={vote !== null ? 'var(--primary)' : 'none'}
            stroke={
              vote === 'strong'
                ? 'var(--background)'
                : vote === 'regular'
                  ? 'var(--primary)'
                  : 'var(--muted-foreground)'
            }
            strokeWidth="2.4"
          />
        </g>
      </svg>
    </button>
  )
}

export const nextVote = (vote: Vote): Vote =>
  vote === null ? 'regular' : vote === 'regular' ? 'strong' : null
