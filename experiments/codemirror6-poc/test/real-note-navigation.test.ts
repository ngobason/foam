import { describe, expect, it, vi } from 'vitest';
import { prepareRealNoteNavigation } from '../src/real-note-navigation';

function setup() {
  let dirty = true;
  let current = true;
  const note = { name: 'B.md', content: '# B from disk' };
  const context = {
    readTarget: vi.fn(async () => note),
    isCurrent: () => current,
    hasUnsavedChanges: () => dirty,
    needsSync: () => false,
    askDecision: vi.fn(async (): Promise<'save' | 'discard' | 'cancel'> => {
      dirty = false;
      return 'save';
    }),
  };
  return {
    context,
    note,
    setDirty: (value: boolean) => {
      dirty = value;
    },
    invalidate: () => {
      current = false;
    },
  };
}

describe('real Wikilink navigation preparation', () => {
  it('opens a clean target without asking', async () => {
    const { context, note, setDirty } = setup();
    setDirty(false);
    expect(await prepareRealNoteNavigation(context)).toEqual(note);
    expect(context.askDecision).not.toHaveBeenCalled();
  });

  it('waits for successful Save before returning the latest target', async () => {
    const { context, note } = setup();
    expect(await prepareRealNoteNavigation(context)).toEqual(note);
    expect(context.askDecision).toHaveBeenCalledOnce();
    expect(context.readTarget).toHaveBeenCalledTimes(2);
  });

  it('allows Discard without changing the source document or saving it', async () => {
    const { context, note } = setup();
    context.askDecision.mockResolvedValue('discard');
    expect(await prepareRealNoteNavigation(context)).toEqual(note);
    expect(context.hasUnsavedChanges()).toBe(true);
  });

  it('preserves the source on Cancel', async () => {
    const { context } = setup();
    context.askDecision.mockResolvedValue('cancel');
    expect(await prepareRealNoteNavigation(context)).toBeNull();
    expect(context.hasUnsavedChanges()).toBe(true);
    expect(context.readTarget).toHaveBeenCalledOnce();
  });

  it('does not proceed if Save leaves unsaved changes', async () => {
    const { context } = setup();
    // The existing dialog resolves Save only on success. Even a stale
    // Save decision must never allow unsaved content to be replaced.
    context.askDecision.mockResolvedValue('save');
    expect(await prepareRealNoteNavigation(context)).toBeNull();
    expect(context.hasUnsavedChanges()).toBe(true);
  });

  it('checks missing disk targets before asking about unsaved data', async () => {
    const { context } = setup();
    context.readTarget.mockRejectedValue(new Error('File not found'));
    await expect(prepareRealNoteNavigation(context)).rejects.toThrow(
      'File not found'
    );
    expect(context.askDecision).not.toHaveBeenCalled();
    expect(context.hasUnsavedChanges()).toBe(true);
  });

  it('preserves changes if the target disappears after Discard is chosen', async () => {
    const { context } = setup();
    context.askDecision.mockResolvedValue('discard');
    context.readTarget
      .mockResolvedValueOnce({ name: 'B.md', content: '# B' })
      .mockRejectedValueOnce(new Error('File not found'));
    await expect(prepareRealNoteNavigation(context)).rejects.toThrow();
    expect(context.hasUnsavedChanges()).toBe(true);
  });

  it('rejects a stale source after reading or deciding', async () => {
    const { context, invalidate } = setup();
    context.askDecision.mockImplementation(async () => {
      invalidate();
      return 'discard';
    });
    expect(await prepareRealNoteNavigation(context)).toBeNull();
    expect(context.hasUnsavedChanges()).toBe(true);
  });
});
