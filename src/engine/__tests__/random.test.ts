import { describe, expect, it } from 'vitest';

import { pickRandom, seededRandom, systemRandom, type RandomSource } from '../random';

describe('seededRandom', () => {
  it('produces the same sequence for the same seed (ADR-009)', () => {
    const a = seededRandom(12345);
    const b = seededRandom(12345);

    const first = Array.from({ length: 20 }, () => a.next());
    const second = Array.from({ length: 20 }, () => b.next());

    expect(first).toEqual(second);
  });

  it('produces different sequences for different seeds', () => {
    const sourceA = seededRandom(1);
    const sourceB = seededRandom(2);
    const a = Array.from({ length: 10 }, () => sourceA.next());
    const b = Array.from({ length: 10 }, () => sourceB.next());

    expect(a).not.toEqual(b);
  });

  it('stays within [0, 1)', () => {
    const random = seededRandom(99);

    for (let i = 0; i < 1000; i += 1) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('spreads values across the range rather than clustering', () => {
    const random = seededRandom(7);
    const buckets = new Array<number>(10).fill(0);

    for (let i = 0; i < 10_000; i += 1) {
      const bucket = Math.floor(random.next() * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }

    // A uniform source gives ~1000 per bucket; allow generous slack.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(700);
      expect(count).toBeLessThan(1300);
    }
  });

  it('handles seed 0 without collapsing to a constant', () => {
    const random = seededRandom(0);
    const values = Array.from({ length: 5 }, () => random.next());

    expect(new Set(values).size).toBe(5);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('handles negative seeds, which are coerced to unsigned', () => {
    const random = seededRandom(-42);
    const values = Array.from({ length: 5 }, () => random.next());

    expect(new Set(values).size).toBe(5);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

describe('systemRandom', () => {
  it('returns values within [0, 1)', () => {
    for (let i = 0; i < 100; i += 1) {
      const value = systemRandom.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('pickRandom', () => {
  const fixed = (value: number): RandomSource => ({ next: () => value });

  it('picks the first element when the source returns 0', () => {
    expect(pickRandom(['a', 'b', 'c'], fixed(0))).toBe('a');
  });

  it('picks the last element as the source approaches 1', () => {
    expect(pickRandom(['a', 'b', 'c'], fixed(0.999))).toBe('c');
  });

  it('clamps a misbehaving source that returns exactly 1', () => {
    expect(pickRandom(['a', 'b', 'c'], fixed(1))).toBe('c');
  });

  it('throws on an empty list rather than returning undefined', () => {
    expect(() => pickRandom([], fixed(0))).toThrow(/empty list/);
  });

  it('eventually reaches every element', () => {
    const random = seededRandom(2024);
    const seen = new Set<string>();

    for (let i = 0; i < 200; i += 1) {
      seen.add(pickRandom(['a', 'b', 'c', 'd'], random));
    }

    expect(seen.size).toBe(4);
  });
});
