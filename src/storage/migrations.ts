import { CURRENT_SCHEMA_VERSION } from './keys';

/**
 * Schema migrations (EC-13).
 *
 * V1 ships with an empty chain — there is no earlier release to migrate from.
 * The machinery exists so V2 can add fields without discarding a player's
 * streak history, which is the one piece of data we genuinely cannot recreate.
 *
 * A migration keyed `n` upgrades data from version `n - 1` to version `n`.
 */
export type Migration = (data: unknown) => unknown;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 2: (data) => ({ ...(data as object), newField: default }),
};

export interface MigrationResult {
  readonly data: unknown;
  /** False when the stored data must be discarded in favour of defaults. */
  readonly ok: boolean;
}

/**
 * Runs the chain from `fromVersion` up to the current version.
 *
 * Data written by a *newer* build than this one cannot be safely downgraded —
 * we do not know what the future schema means. Rather than crash or silently
 * corrupt it, we reset to defaults and tell the player (EC-13).
 */
export function migrate(data: unknown, fromVersion: number): MigrationResult {
  if (fromVersion > CURRENT_SCHEMA_VERSION) {
    return { data: null, ok: false };
  }

  let current = data;

  for (let version = fromVersion + 1; version <= CURRENT_SCHEMA_VERSION; version += 1) {
    const migration = MIGRATIONS[version];
    if (!migration) continue;

    try {
      current = migration(current);
    } catch {
      // A migration that throws means the stored shape was not what it
      // claimed. Defaults are safer than half-migrated data.
      return { data: null, ok: false };
    }
  }

  return { data: current, ok: true };
}
