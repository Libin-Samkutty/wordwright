import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('joins truthy class names with a single space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy values so conditional classes stay inline', () => {
    expect(cn('base', false, null, undefined, 'active')).toBe('base active');
  });

  it('returns an empty string when nothing is truthy', () => {
    expect(cn(false, undefined)).toBe('');
  });
});
