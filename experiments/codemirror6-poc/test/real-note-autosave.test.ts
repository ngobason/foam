import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RealNoteAutosave,
  type NoteSaveSnapshot,
} from '../src/real-note-autosave';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup(initialContent = 'A') {
  vi.useFakeTimers();
  let disk = initialContent;
  const persist = vi.fn(
    async (snapshot: NoteSaveSnapshot, expectedContent: string) => {
      if (disk !== expectedContent) throw new Error('External conflict');
      disk = snapshot.content;
    }
  );
  const synchronize = vi.fn((_snapshot: NoteSaveSnapshot) => {});
  const onError = vi.fn();
  const autosave = new RealNoteAutosave(initialContent, {
    persist,
    synchronize,
    onError,
  });
  return { autosave, persist, synchronize, onError, disk: () => disk };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('real-note auto-save coordination', () => {
  it('suspends pending timers for a navigation decision and resumes after Cancel', async () => {
    const { autosave, persist } = setup();
    autosave.request('B');
    autosave.suspend();
    autosave.request('C');
    await vi.advanceTimersByTimeAsync(2000);
    expect(persist).not.toHaveBeenCalled();
    autosave.resume();
    await vi.advanceTimersByTimeAsync(750);
    expect(persist).toHaveBeenCalledExactlyOnceWith(
      { revision: 2, content: 'C' },
      'A'
    );
  });

  it('flush works during suspension without re-enabling background saves', async () => {
    const { autosave, persist } = setup();
    autosave.suspend();
    autosave.request('B');
    const flushed = autosave.flush();
    expect(autosave.saving).toBe(true);
    await flushed;
    expect(autosave.saving).toBe(false);
    autosave.request('C');
    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('resuming after navigation does not retry a failed save automatically', async () => {
    const { autosave, persist } = setup();
    persist.mockRejectedValueOnce(new Error('Save failed'));
    autosave.request('B');
    await vi.advanceTimersByTimeAsync(750);
    autosave.suspend();
    autosave.resume();
    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('saves a single edit only after 750 ms idle', async () => {
    const { autosave, persist, synchronize, disk } = setup();
    autosave.request('B');
    expect(autosave.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(749);
    expect(persist).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledExactlyOnceWith(
      { revision: 1, content: 'B' },
      'A'
    );
    expect(synchronize).toHaveBeenCalledExactlyOnceWith({
      revision: 1,
      content: 'B',
    });
    expect(disk()).toBe('B');
    expect(autosave.dirty).toBe(false);
  });

  it('resets the debounce and coalesces rapid edits into the latest snapshot', async () => {
    const { autosave, persist } = setup();
    autosave.request('B');
    await vi.advanceTimersByTimeAsync(500);
    autosave.request('C');
    await vi.advanceTimersByTimeAsync(749);
    expect(persist).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledExactlyOnceWith(
      { revision: 2, content: 'C' },
      'A'
    );
  });

  it('acknowledges immutable B while C stays dirty, then saves C against B', async () => {
    const { autosave, persist, synchronize } = setup();
    const writingB = deferred();
    persist.mockImplementationOnce(() => writingB.promise);
    autosave.request('B');
    await vi.advanceTimersByTimeAsync(750);
    const snapshotB = persist.mock.calls[0][0];
    expect(Object.isFrozen(snapshotB)).toBe(true);
    autosave.request('C');
    // Even a slow write cannot overlap another timer-triggered save.
    await vi.advanceTimersByTimeAsync(2000);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(autosave.persistedSnapshot.content).toBe('A');
    writingB.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshotB).toEqual({ revision: 1, content: 'B' });
    expect(autosave.persistedSnapshot).toBe(snapshotB);
    expect(autosave.dirty).toBe(true);
    expect(synchronize).toHaveBeenCalledExactlyOnceWith(snapshotB);
    // Represent the successfully completed first write in the fake disk.
    persist.mockImplementationOnce(async (snapshot, expectedContent) => {
      expect(expectedContent).toBe('B');
      expect(snapshot).toEqual({ revision: 2, content: 'C' });
    });
    await vi.advanceTimersByTimeAsync(750);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(autosave.persistedSnapshot).toEqual({ revision: 2, content: 'C' });
    expect(autosave.dirty).toBe(false);
  });

  it('progresses the real expected-content baseline A -> B -> C without false conflicts', async () => {
    const { autosave, persist, disk, onError } = setup();
    autosave.request('B');
    await autosave.flush();
    autosave.request('C');
    await autosave.flush();
    expect(persist.mock.calls.map(([, baseline]) => baseline)).toEqual([
      'A',
      'B',
    ]);
    expect(disk()).toBe('C');
    expect(onError).not.toHaveBeenCalled();
  });

  it('retains edits and reports timer failure once without automatic retries', async () => {
    const { autosave, persist, synchronize, onError } = setup();
    const failure = new Error('Write denied');
    persist.mockRejectedValueOnce(failure);
    autosave.request('B');
    await vi.advanceTimersByTimeAsync(750);
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(autosave.persistedSnapshot.content).toBe('A');
    expect(autosave.dirty).toBe(true);
    expect(synchronize).not.toHaveBeenCalled();
    autosave.request('C');
    await vi.advanceTimersByTimeAsync(10000);
    expect(persist).toHaveBeenCalledTimes(1);
    await autosave.flush();
    expect(persist).toHaveBeenLastCalledWith(
      { revision: 2, content: 'C' },
      'A'
    );
    expect(autosave.dirty).toBe(false);
  });

  it('rejects flush on save failure and allows explicit retry', async () => {
    const { autosave, persist, onError } = setup();
    const failure = new Error('Disk failure');
    persist.mockRejectedValueOnce(failure);
    autosave.request('B');
    await expect(autosave.flush()).rejects.toBe(failure);
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(autosave.dirty).toBe(true);
    await autosave.flush();
    expect(autosave.persistedSnapshot.content).toBe('B');
  });

  it('retains newer C when an in-flight B fails without retrying from its timer', async () => {
    const { autosave, persist, onError } = setup();
    const writingB = deferred();
    persist.mockImplementationOnce(() => writingB.promise);
    autosave.request('B');
    await vi.advanceTimersByTimeAsync(750);
    autosave.request('C');
    const failure = new Error('Write B failed');
    writingB.reject(failure);
    await vi.advanceTimersByTimeAsync(10000);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(autosave.persistedSnapshot.content).toBe('A');
    expect(autosave.dirty).toBe(true);
    await autosave.flush();
    expect(persist).toHaveBeenLastCalledWith(
      { revision: 2, content: 'C' },
      'A'
    );
  });

  it('flushes pending work immediately and removes its debounce timer', async () => {
    const { autosave, persist } = setup();
    autosave.request('B');
    await autosave.flush();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('shares repeated flushes and drains newer edits without competing writes', async () => {
    const { autosave, persist } = setup();
    const writingB = deferred();
    persist.mockImplementationOnce(() => writingB.promise);
    autosave.request('B');
    const firstFlush = autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(persist).toHaveBeenCalledWith({ revision: 1, content: 'B' }, 'A');
    autosave.request('C');
    const secondFlush = autosave.flush();
    expect(secondFlush).toBe(firstFlush);
    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).toHaveBeenCalledTimes(1);
    persist.mockImplementationOnce(async (_snapshot, baseline) => {
      expect(baseline).toBe('B');
    });
    writingB.resolve();
    await Promise.all([firstFlush, secondFlush]);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(autosave.persistedSnapshot.content).toBe('C');
    expect(autosave.dirty).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('flush waits for a timer-started write before saving a newer revision', async () => {
    const { autosave, persist } = setup();
    const writingB = deferred();
    persist.mockImplementationOnce(() => writingB.promise);
    autosave.request('B');
    await vi.advanceTimersByTimeAsync(750);
    autosave.request('C');
    const flushed = autosave.flush();
    expect(persist).toHaveBeenCalledTimes(1);
    persist.mockResolvedValueOnce();
    writingB.resolve();
    await flushed;
    expect(persist).toHaveBeenCalledTimes(2);
    expect(autosave.persistedSnapshot.content).toBe('C');
  });

  it('keeps disk-saved/Core-sync-failed distinct and retries sync without rewriting disk', async () => {
    const { autosave, persist, synchronize, onError } = setup();
    const failure = new Error('Core sync failed');
    synchronize.mockImplementationOnce(() => {
      throw failure;
    });
    autosave.request('B');
    await expect(autosave.flush()).rejects.toBe(failure);
    expect(autosave.persistedSnapshot).toEqual({ revision: 1, content: 'B' });
    expect(autosave.dirty).toBe(false);
    expect(autosave.needsSync).toBe(true);
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    await vi.advanceTimersByTimeAsync(10000);
    expect(synchronize).toHaveBeenCalledTimes(1);
    await autosave.flush();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(synchronize).toHaveBeenLastCalledWith({ revision: 1, content: 'B' });
    expect(autosave.needsSync).toBe(false);
  });

  it('publishes persisted B before saving draft C after a Core failure', async () => {
    const { autosave, synchronize } = setup();
    synchronize.mockImplementationOnce(() => {
      throw new Error('Core sync failed');
    });
    autosave.request('B');
    await expect(autosave.flush()).rejects.toThrow('Core sync failed');
    autosave.request('C');
    await autosave.flush();
    expect(
      synchronize.mock.calls.map(([snapshot]) => snapshot.content)
    ).toEqual(['B', 'B', 'C']);
  });

  it('cancels old timers and refuses work after disposal', async () => {
    const { autosave, persist } = setup();
    autosave.request('B');
    autosave.dispose();
    autosave.request('C');
    await vi.advanceTimersByTimeAsync(1000);
    expect(persist).not.toHaveBeenCalled();
    await expect(autosave.flush()).rejects.toThrow('disposed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not publish stale completion or save queued edits into another session', async () => {
    const old = setup();
    const writingB = deferred();
    old.persist.mockImplementationOnce(() => writingB.promise);
    old.autosave.request('B');
    const oldFlush = old.autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(old.persist).toHaveBeenCalledWith(
      { revision: 1, content: 'B' },
      'A'
    );
    // Attach rejection handling before resolving the disposed session.
    const stopped = expect(oldFlush).rejects.toThrow('disposed');
    old.autosave.request('C');
    old.autosave.dispose();
    const current = setup('Other note');
    current.autosave.request('Other edit');
    writingB.resolve();
    await stopped;
    expect(old.synchronize).not.toHaveBeenCalled();
    expect(old.persist).toHaveBeenCalledTimes(1);
    expect(current.autosave.persistedSnapshot.content).toBe('Other note');
    expect(current.autosave.dirty).toBe(true);
    await current.autosave.flush();
    expect(current.disk()).toBe('Other edit');
    expect(current.synchronize).toHaveBeenCalledExactlyOnceWith({
      revision: 1,
      content: 'Other edit',
    });
  });

  it('does not write unchanged content or an edit undone before saving', async () => {
    const { autosave, persist } = setup();
    autosave.request('A');
    await autosave.flush();
    autosave.request('B');
    autosave.request('A');
    await vi.advanceTimersByTimeAsync(750);
    expect(persist).not.toHaveBeenCalled();
    expect(autosave.dirty).toBe(false);
  });

  it('persists an undo back to A when an in-flight B reaches disk', async () => {
    const { autosave, persist, disk } = setup();
    const writingB = deferred();
    const write = persist.getMockImplementation()!;
    persist.mockImplementationOnce(async (snapshot, baseline) => {
      await writingB.promise;
      await write(snapshot, baseline);
    });
    autosave.request('B');
    await vi.advanceTimersByTimeAsync(750);
    autosave.request('A');
    writingB.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(disk()).toBe('B');
    expect(autosave.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(750);
    expect(persist).toHaveBeenLastCalledWith(
      { revision: 2, content: 'A' },
      'B'
    );
    expect(disk()).toBe('A');
    expect(autosave.dirty).toBe(false);
  });
});
