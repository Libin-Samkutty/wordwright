import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { GameRecord } from '@/engine/types';
import {
  createStatsRepository,
  recordGame as applyRecord,
  resetHistory as applyResetHistory,
  resetStatistics as applyResetStats,
  type StatsState,
} from '@/storage';

import { reportStorageIssue } from './storageIssues';

import { StatsContext } from './gameContexts';

export interface StatsContextValue {
  readonly stats: StatsState;
  /** Idempotent by game id (FR-20). */
  readonly recordGame: (record: GameRecord) => void;
  readonly resetStatistics: () => void;
  readonly resetHistory: () => void;
}

/** Stateless view over the stats key; see the note in SettingsProvider. */
const repository = createStatsRepository(reportStorageIssue);

export function StatsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [stats, setStats] = useState<StatsState>(() => repository.read());

  // Another tab finished a game (EC-16).
  useEffect(() => repository.subscribe(setStats), []);

  const commit = useCallback((transform: (current: StatsState) => StatsState): void => {
    setStats((current) => {
      const next = transform(current);
      // Nothing changed (a duplicate record); skip the write and the re-render.
      if (next === current) return current;

      repository.write(next);
      return next;
    });
  }, []);

  const value = useMemo<StatsContextValue>(
    () => ({
      stats,
      recordGame: (record) => {
        commit((current) => applyRecord(current, record));
      },
      resetStatistics: () => {
        commit(applyResetStats);
      },
      resetHistory: () => {
        commit(applyResetHistory);
      },
    }),
    [stats, commit],
  );

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}
