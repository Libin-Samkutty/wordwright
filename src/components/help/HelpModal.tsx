import { MAX_GUESSES, type TileState, type WordLength } from '@/engine';
import { cn } from '@/lib/cn';

import { TILE_STATE_CLASS, TILE_STATE_MARKER } from '../board/tileAppearance';
import { Modal } from '../ui/Modal';

type ExampleState = Extract<TileState, 'correct' | 'present' | 'absent'>;

interface HelpExample {
  readonly word: string;
  /** Index of the letter this example is about. */
  readonly index: number;
  readonly state: ExampleState;
}

/**
 * Illustration words, one set per supported length (FR-60).
 *
 * Purely decorative — never looked up in the dictionary, so the dialog works
 * even while a dictionary chunk is still loading. Typed as
 * `Record<WordLength, …>` so widening `WordLength` for a future length (FR-29)
 * fails the build until an entry is added here, rather than silently
 * rendering nothing.
 */
const HELP_EXAMPLES: Record<WordLength, readonly [HelpExample, HelpExample, HelpExample]> = {
  4: [
    { word: 'WORD', index: 0, state: 'correct' },
    { word: 'PLAY', index: 1, state: 'present' },
    { word: 'MINT', index: 2, state: 'absent' },
  ],
  5: [
    { word: 'WEARY', index: 0, state: 'correct' },
    { word: 'PILLS', index: 1, state: 'present' },
    { word: 'VAGUE', index: 3, state: 'absent' },
  ],
  6: [
    { word: 'WEAPON', index: 0, state: 'correct' },
    { word: 'PILLAR', index: 1, state: 'present' },
    { word: 'GADGET', index: 3, state: 'absent' },
  ],
};

const EXAMPLE_SUFFIX: Record<ExampleState, string> = {
  correct: 'is in the word and in the right spot.',
  present: 'is in the word but in the wrong spot.',
  absent: 'is not in the word in any spot.',
};

/**
 * A static illustration of one tile state (FR-60).
 *
 * Deliberately not `Tile`: that component renders `role="gridcell"`, valid
 * only inside a grid/row ancestry. Dropped into a dialog it would be an orphan
 * gridcell — a critical axe `aria-required-parent` violation — and wrapping it
 * in a fake `role="grid"` would hand screen readers a navigable data table
 * that does not exist. Colour comes from the board's own maps so the two can
 * never disagree.
 */
function ExampleTile({ letter, state }: { letter: string; state: TileState }): React.JSX.Element {
  const marker = TILE_STATE_MARKER[state];

  return (
    <span
      className={cn(
        'relative flex size-8 items-center justify-center border-2 text-base font-bold uppercase sm:size-10 sm:text-lg',
        TILE_STATE_CLASS[state],
      )}
    >
      {letter}
      {marker ? (
        <span className="absolute top-0 right-0.5 text-[0.6rem] leading-none opacity-0 in-data-[palette=cb]:opacity-100">
          {marker}
        </span>
      ) : null}
    </span>
  );
}

export interface HelpModalProps {
  readonly isOpen: boolean;
  readonly wordLength: WordLength;
  readonly onClose: () => void;
}

/**
 * Explains the rules to a player who has never seen Wordle before (FR-60,
 * US-19). Opened only from the header control — never by the app itself
 * (ADR-020) — so it needs no persisted state and cannot interfere with a
 * restored session or any test that boots with empty storage.
 */
export function HelpModal({ isOpen, wordLength, onClose }: HelpModalProps): React.JSX.Element {
  return (
    <Modal isOpen={isOpen} title="How to play" onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        <p>Guess the hidden word in {MAX_GUESSES} tries.</p>
        <p>Each guess must be a valid {wordLength} letter word.</p>
        <p>After each guess, the colour of the tiles changes to show how close you were.</p>

        <section>
          <h3 className="mb-2 text-xs font-bold tracking-wide uppercase">Examples</h3>
          <ul className="flex flex-col gap-3">
            {HELP_EXAMPLES[wordLength].map((example) => (
              <li key={example.state}>
                {/* Decorative: the sentence below carries the meaning (A11Y-13). */}
                <div aria-hidden="true" className="flex gap-1">
                  {[...example.word].map((letter, index) => (
                    <ExampleTile
                      key={index}
                      letter={letter}
                      state={index === example.index ? example.state : 'filled'}
                    />
                  ))}
                </div>
                <p className="mt-1.5">
                  <strong className="font-bold">{example.word[example.index]}</strong>{' '}
                  {EXAMPLE_SUFFIX[example.state]}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}

/** Exported only so a test can assert no example word has drifted from its declared length. */
export { HELP_EXAMPLES };
