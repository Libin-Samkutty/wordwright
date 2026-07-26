import { describe, expect, it } from 'vitest';

import { clampDuration } from './clock';
import {
  EMPTY_VALUE,
  describeEvaluation,
  formatAverage,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
} from './format';

describe('formatDuration', () => {
  it('formats under a minute as M:SS', () => {
    expect(formatDuration(9_000)).toBe('0:09');
    expect(formatDuration(45_000)).toBe('0:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90_000)).toBe('1:30');
    expect(formatDuration(600_000)).toBe('10:00');
  });

  it('adds an hours segment past 60 minutes', () => {
    expect(formatDuration(3_661_000)).toBe('1:01:01');
  });

  it('floors sub-second remainders rather than rounding up', () => {
    expect(formatDuration(1_999)).toBe('0:01');
  });

  it('returns the em dash for absent or nonsensical values (FR-41)', () => {
    expect(formatDuration(null)).toBe(EMPTY_VALUE);
    expect(formatDuration(-1)).toBe(EMPTY_VALUE);
    expect(formatDuration(Number.NaN)).toBe(EMPTY_VALUE);
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe(EMPTY_VALUE);
  });
});

describe('formatAverage', () => {
  it('shows one decimal place (FR-38)', () => {
    expect(formatAverage(3.142)).toBe('3.1');
    expect(formatAverage(4)).toBe('4.0');
  });

  it('returns the em dash when there is nothing to average', () => {
    expect(formatAverage(null)).toBe(EMPTY_VALUE);
    expect(formatAverage(Number.NaN)).toBe(EMPTY_VALUE);
  });
});

describe('formatPercent', () => {
  it('rounds to a whole percentage', () => {
    expect(formatPercent(66.6)).toBe('67%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(100)).toBe('100%');
  });

  it('guards against non-finite input', () => {
    expect(formatPercent(Number.NaN)).toBe(EMPTY_VALUE);
  });
});

describe('formatNumber', () => {
  it('adds thousands separators so large scores stay readable', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(0)).toBe('0');
  });

  it('guards against non-finite input', () => {
    expect(formatNumber(Number.NaN)).toBe(EMPTY_VALUE);
  });
});

describe('formatDate', () => {
  it('renders a short month and day', () => {
    // Fixed timestamp: 15 March 2024, midday UTC.
    expect(formatDate(Date.UTC(2024, 2, 15, 12))).toMatch(/Mar \d{1,2}/);
  });

  it('guards against non-finite input', () => {
    expect(formatDate(Number.NaN)).toBe(EMPTY_VALUE);
  });
});

describe('describeEvaluation (A11Y-3)', () => {
  it('spells out each letter and its state for a screen reader', () => {
    expect(describeEvaluation('CAT', ['correct', 'present', 'absent'])).toBe(
      'C correct, A wrong position, T not in word',
    );
  });

  it('handles an all-correct guess', () => {
    expect(describeEvaluation('AB', ['correct', 'correct'])).toBe('A correct, B correct');
  });

  it('treats a missing state as absent rather than throwing', () => {
    expect(describeEvaluation('AB', ['correct'])).toBe('A correct, B not in word');
  });
});

describe('clampDuration (EC-19)', () => {
  it('passes through a plausible duration', () => {
    expect(clampDuration(45_000)).toBe(45_000);
  });

  it('floors a negative duration at zero, so a clock change cannot go backwards', () => {
    expect(clampDuration(-5_000)).toBe(0);
  });

  it('caps an implausible duration at 24 hours', () => {
    expect(clampDuration(99 * 60 * 60 * 1000)).toBe(24 * 60 * 60 * 1000);
  });

  it('treats non-finite input as zero rather than letting it through', () => {
    expect(clampDuration(Number.NaN)).toBe(0);
    expect(clampDuration(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
