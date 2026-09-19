import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Header } from './Header';

function renderHeader(overrides: Partial<Parameters<typeof Header>[0]> = {}) {
  const props = {
    wordLength: 5 as const,
    lengthDisabled: false,
    onLengthChange: vi.fn(),
    onOpenHelp: vi.fn(),
    onOpenStats: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<Header {...props} />) };
}

describe('Header (FR-49, FR-60)', () => {
  it('exposes a How to play control that calls onOpenHelp', async () => {
    const user = userEvent.setup();
    const { props } = renderHeader();

    await user.click(screen.getByRole('button', { name: 'How to play' }));

    expect(props.onOpenHelp).toHaveBeenCalledOnce();
  });

  it('still exposes Statistics and Settings', () => {
    renderHeader();

    expect(screen.getByRole('button', { name: 'Statistics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('puts How to play first in the tab order', () => {
    renderHeader();

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName('How to play');
  });
});
