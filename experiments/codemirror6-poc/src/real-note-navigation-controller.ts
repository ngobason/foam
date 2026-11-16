import {
  prepareRealNoteNavigation,
  type NoteSwitchDecision,
} from './real-note-navigation';

/** UI orchestration: call directly from a click, before any asynchronous read. */
export async function prepareRealNoteNavigationWithAutoSave<T>(context: {
  readTarget(): Promise<T>;
  isCurrent(): boolean;
  hasUnsavedChanges(): boolean;
  needsSync(): boolean;
  isSaving(): boolean;
  preflightWriteAccess(): Promise<boolean>;
  // The adapter drains the coordinator, validates identity and checkpoints the editor.
  flush(): Promise<boolean>;
  askDecision(): Promise<NoteSwitchDecision>;
}): Promise<T | null> {
  // Invoke before the first await, preserving the original user gesture.
  const permission =
    context.hasUnsavedChanges() || context.isSaving()
      ? context.preflightWriteAccess()
      : null;
  if (permission) {
    const granted = await permission;
    if (!context.isCurrent()) return null;
    if (!granted) return prepareRealNoteNavigation(context);
  }

  let target = await context.readTarget();
  if (!context.isCurrent()) return null;
  if (
    context.hasUnsavedChanges() ||
    context.needsSync() ||
    context.isSaving()
  ) {
    const saved = await context.flush();
    if (!context.isCurrent()) return null;
    if (
      !saved ||
      context.hasUnsavedChanges() ||
      context.needsSync() ||
      context.isSaving()
    ) {
      return prepareRealNoteNavigation(context);
    }

    // Re-read after persistence; never commit the target captured before a write.
    target = await context.readTarget();
    if (
      !context.isCurrent() ||
      context.hasUnsavedChanges() ||
      context.needsSync() ||
      context.isSaving()
    ) {
      return null;
    }
  }
  return target;
}
