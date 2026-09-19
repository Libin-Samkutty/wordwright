import type { TileState } from '@/engine';

/**
 * Border/background/text classes per tile state.
 *
 * Split out from `Tile.tsx` so it can be imported by non-component code (the
 * help dialog's example tiles, FR-60) without tripping
 * `react-refresh/only-export-components` — that rule only treats primitive
 * literals as "constant enough" to co-exist with a component export, not
 * object literals like this `Record`.
 */
export const TILE_STATE_CLASS: Record<TileState, string> = {
  empty: 'border-tile-empty-border bg-transparent text-tile-text',
  filled: 'border-tile-filled-border bg-transparent text-tile-text',
  correct: 'border-tile-correct bg-tile-correct text-tile-text-revealed',
  present: 'border-tile-present bg-tile-present text-tile-text-revealed',
  absent: 'border-tile-absent bg-tile-absent text-tile-text-revealed',
};

/**
 * Non-colour markers for colourblind mode (A11Y-8).
 *
 * Colour alone never conveys state. The board shows these in a corner of the
 * tile, hidden from assistive tech, which reads the aria-label instead. The
 * help dialog's example tiles reuse the same glyphs (FR-60) so the two can
 * never disagree.
 */
export const TILE_STATE_MARKER: Partial<Record<TileState, string>> = {
  correct: '✓',
  present: '◐',
};
