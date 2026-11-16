export type NoteSaveSnapshot = Readonly<{
  revision: number;
  content: string;
}>;

type SaveCallbacks = {
  // Bind to this session's existing repository and file. Resolve only after
  // disk persistence succeeds; reject on failure. Never request permissions here.
  persist(snapshot: NoteSaveSnapshot, expectedContent: string): Promise<void>;
  // Publish only the persisted snapshot through the existing Core adapter.
  synchronize(snapshot: NoteSaveSnapshot): void;
  onError(error: unknown): void;
  onStateChange?(): void;
};

/**
 * One coordinator per real-note session. All saves, including manual Save,
 * must use this instance once integrated, so they share the same disk baseline.
 * Callbacks must capture the original session, never look up the active note.
 */
export class RealNoteAutosave {
  private current: NoteSaveSnapshot;
  private persisted: NoteSaveSnapshot;
  private syncPending = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | null = null;
  private flushing: Promise<void> | null = null;
  private paused = false;
  private suspended = false;
  private disposed = false;
  private readonly callbacks: SaveCallbacks;

  constructor(initialContent: string, callbacks: SaveCallbacks) {
    this.current = Object.freeze({ revision: 0, content: initialContent });
    this.persisted = this.current;
    this.callbacks = callbacks;
  }

  get persistedSnapshot(): NoteSaveSnapshot {
    return this.persisted;
  }

  get dirty(): boolean {
    return this.current.content !== this.persisted.content;
  }

  get needsSync(): boolean {
    return this.syncPending;
  }

  get saving(): boolean {
    return this.inFlight !== null || this.flushing !== null;
  }

  /** Suspend background saves while deciding whether to leave this session. */
  suspend(): void {
    this.suspended = true;
    this.clearTimer();
  }

  resume(): void {
    this.suspended = false;
    this.schedule();
  }

  request(content: string): void {
    if (this.disposed || content === this.current.content) return;
    this.current = Object.freeze({
      revision: this.current.revision + 1,
      content,
    });
    this.schedule();
  }

  /** Drain pending edits and Core synchronization, or reject. Explicit retry
   * after a failure is allowed here; background retries stay paused meanwhile.
   * Navigation must await this before replacing/discarding the session.
   */
  flush(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Auto-save disposed'));
    if (this.flushing) return this.flushing;
    this.clearTimer();
    this.paused = false;
    this.flushing = Promise.resolve()
      .then(async () => {
        do {
          await this.savePending();
          this.assertActive();
        } while (this.dirty || this.syncPending);
      })
      .finally(() => {
        this.flushing = null;
        this.schedule();
        if (!this.disposed) this.callbacks.onStateChange?.();
      });
    return this.flushing;
  }

  /** Cannot cancel an already-started disk write. Its result updates only this
   * instance's disk baseline; no further Core publication or save is started.
   * Await flush before normal navigation, rather than disposing during a write.
   */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    this.clearTimer();
    if (
      this.disposed ||
      this.paused ||
      this.suspended ||
      this.inFlight ||
      this.flushing ||
      (!this.dirty && !this.syncPending)
    ) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      // savePending reports failures through onError; consume the background
      // rejection. flush callers receive the rejection directly.
      void this.savePending().catch(() => {});
    }, 750);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Auto-save disposed');
  }

  private savePending(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = Promise.resolve()
      .then(async () => {
        this.assertActive();
        // Recover failed publication before writing a newer draft.
        if (this.syncPending) {
          this.callbacks.synchronize(this.persisted);
          this.syncPending = false;
        }
        if (!this.dirty) return;

        const snapshot = this.current;
        await this.callbacks.persist(snapshot, this.persisted.content);
        // Acknowledge exactly what reached disk, even if current is now newer
        // or this session was disposed while the write was in flight.
        this.persisted = snapshot;
        this.syncPending = true;
        this.assertActive();
        this.callbacks.synchronize(snapshot);
        this.syncPending = false;
      })
      .catch(error => {
        if (!this.disposed) {
          this.paused = true;
          this.callbacks.onError(error);
        }
        throw error;
      })
      .finally(() => {
        this.inFlight = null;
        this.schedule();
        if (!this.disposed) this.callbacks.onStateChange?.();
      });
    return this.inFlight;
  }
}
