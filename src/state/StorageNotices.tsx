import { useEffect, useRef } from 'react';

import { safeStorage } from '@/storage';

import { useToast } from './contexts';
import { hasCorruptData } from './storageIssues';

/**
 * Surfaces storage problems to the player exactly once per session
 * (SPEC §11, EC-11, EC-12).
 *
 * Both conditions are recoverable and the game stays fully playable, so these
 * are polite notices rather than errors — but staying silent would let someone
 * finish a long streak believing it had been saved when it had not.
 */
export function StorageNotices(): null {
  const { show } = useToast();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;

    if (!safeStorage.isPersistent) {
      show("Progress can't be saved in this browser mode");
      return;
    }

    if (hasCorruptData()) {
      show("Saved data was reset because it couldn't be read");
    }
  }, [show]);

  return null;
}
