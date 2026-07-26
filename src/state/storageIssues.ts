/**
 * Cross-cutting flag for storage read failures (EC-12).
 *
 * A module-level value rather than React state, because the failure happens
 * inside a repository read — which runs in a `useState` initialiser, before
 * any component exists to hold state or raise a toast. `StorageNotices` picks
 * it up on mount.
 */
let corruptDataSeen = false;

/** Called by the storage layer when a slice had to be discarded. */
export function reportStorageIssue(): void {
  corruptDataSeen = true;
}

export function hasCorruptData(): boolean {
  return corruptDataSeen;
}

/** Test seam. */
export function resetStorageNotices(): void {
  corruptDataSeen = false;
}
