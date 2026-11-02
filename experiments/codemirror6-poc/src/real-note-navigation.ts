import type { MarkdownNoteFile } from './browser-note-repository';

export type NoteSwitchDecision = 'save' | 'discard' | 'cancel';

/** Prepare a target without replacing or publishing the source editor state. */
export async function prepareRealNoteNavigation(context: {
  readTarget(): Promise<MarkdownNoteFile>;
  isCurrent(): boolean;
  hasUnsavedChanges(): boolean;
  needsSync(): boolean;
  // The shared dialog performs Save and only resolves 'save' on success.
  askDecision(): Promise<NoteSwitchDecision>;
}): Promise<MarkdownNoteFile | null> {
  let target = await context.readTarget();
  if (!context.isCurrent()) return null;

  if (context.hasUnsavedChanges() || context.needsSync()) {
    const decision = await context.askDecision();
    if (decision === 'cancel' || !context.isCurrent()) return null;
    if (decision !== 'discard' && context.hasUnsavedChanges()) return null;
    if (context.needsSync()) return null;

    // The target may have changed or disappeared while the dialog was open.
    // Discard is applied only by the final successful editor replacement.
    target = await context.readTarget();
    if (!context.isCurrent()) return null;
    if (decision !== 'discard' && context.hasUnsavedChanges()) return null;
  }

  return target;
}
