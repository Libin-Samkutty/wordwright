import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

import { resetSafeStorage } from '@/storage/safeStorage';

/**
 * Shared jsdom setup for the `ui` test project (T-04).
 *
 * jsdom implements neither `matchMedia` nor a usable `localStorage` quota
 * model, and both are load-bearing for us (theme resolution, reduced motion,
 * persistence). Mocking them here keeps every component test deterministic.
 */

/** Mutable media-query state so tests can simulate OS preference changes (EC-17). */
const mediaState = new Map<string, boolean>();
const mediaListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

function invokeListener(listener: EventListenerOrEventListenerObject, event: Event): void {
  if (typeof listener === 'function') {
    listener(event);
  } else {
    listener.handleEvent(event);
  }
}

/**
 * Flips a media query and notifies subscribers, mirroring how a real browser
 * reports an OS preference change (EC-17, A11Y-9).
 */
export function setMediaQuery(query: string, matches: boolean): void {
  mediaState.set(query, matches);

  const event = Object.assign(new Event('change'), { matches, media: query });
  mediaListeners.get(query)?.forEach((listener) => {
    invokeListener(listener, event);
  });
}

function installMatchMedia(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string): MediaQueryList => {
      const matches = mediaState.get(query) ?? false;

      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
          const set = mediaListeners.get(query) ?? new Set();
          set.add(listener);
          mediaListeners.set(query, set);
        },
        removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
          mediaListeners.get(query)?.delete(listener);
        },
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      } satisfies MediaQueryList;
    }),
  );
}

/** In-memory localStorage stand-in; `window.localStorage` in jsdom is shared across tests. */
function installStorage(): void {
  const store = new Map<string, string>();

  const mock: Storage = {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };

  vi.stubGlobal('localStorage', mock);
}

beforeEach(() => {
  mediaState.clear();
  mediaListeners.clear();
  installMatchMedia();
  installStorage();
  // safeStorage memoises its backend; drop it so it re-probes the fresh mock.
  resetSafeStorage();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('data-palette');
  document.documentElement.removeAttribute('data-motion');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
