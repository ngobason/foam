import { URI } from '@foam/core';

const STORAGE_PREFIX = 'foam-editor-poc-note:';

const LEGACY_STORAGE_KEY = 'foam-editor-poc-content';

export const WELCOME_URI = URI.file('/notes/Welcome.md');

/**
 * Generate a separate LocalStorage key for each note.
 */
export function getNoteStorageKey(uri: URI): string {
  return `${STORAGE_PREFIX}${uri.toString()}`;
}

/**
 * Restore a note from LocalStorage.
 *
 * Supports migration from the original Welcome.md key.
 */
export function readStoredNote(uri: URI): string | null {
  const key = getNoteStorageKey(uri);

  const saved = localStorage.getItem(key);

  if (saved !== null) {
    return saved;
  }

  // Backward compatibility for Welcome.md.
  if (uri.toString() === WELCOME_URI.toString()) {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);

    if (legacy !== null) {
      localStorage.setItem(key, legacy);
      return legacy;
    }
  }

  return null;
}

/**
 * Save Markdown under the corresponding note URI.
 */
export function writeStoredNote(uri: URI, markdown: string): void {
  localStorage.setItem(getNoteStorageKey(uri), markdown);
}
