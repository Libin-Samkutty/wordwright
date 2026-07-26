import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';

import { GameProvider, SettingsProvider, StatsProvider, ToastProvider } from '@/state';

/**
 * Wraps a subject in the real provider stack, in the same order as `App`.
 *
 * Integration tests drive the app the way a player does — through the DOM —
 * rather than reaching into state, so they catch wiring bugs that unit tests
 * cannot.
 */
export function Providers({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <SettingsProvider>
      <ToastProvider>
        <StatsProvider>
          <GameProvider>{children}</GameProvider>
        </StatsProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}

/*
 * The return type is inferred rather than annotated: RTL's RenderResult is
 * structurally identical but nominally distinct across the two
 * @testing-library/dom copies in the tree, and spelling it out picks a fight
 * with the resolver for no benefit.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- see above
export function renderWithProviders(ui: ReactElement) {
  const user = userEvent.setup();
  return { user, ...render(ui, { wrapper: Providers }) };
}
