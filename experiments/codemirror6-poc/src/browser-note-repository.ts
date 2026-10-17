export interface MarkdownNoteFile {
  name: string;
  content: string;
}

type FilePickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<FileSystemDirectoryHandle>;
};

type DirectoryWithEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
};

/**
 * Browser-based repository for real Markdown files.
 *
 * Current scope:
 * - Select a folder
 * - List Markdown files
 * - Read Markdown content
 *
 * No write operations yet.
 */
export class BrowserNoteRepository {
  private readonly directory: FileSystemDirectoryHandle;

  private constructor(directory: FileSystemDirectoryHandle) {
    this.directory = directory;
  }

  get folderName(): string {
    return this.directory.name;
  }

  static async pick(
    mode: 'read' | 'readwrite' = 'read'
  ): Promise<BrowserNoteRepository | null> {
    const browser = window as FilePickerWindow;

    if (!browser.showDirectoryPicker) {
      throw new Error('File System Access API is not supported');
    }

    try {
      const directory = await browser.showDirectoryPicker({
        mode,
      });

      return new BrowserNoteRepository(directory);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return null;
      }

      throw error;
    }
  }

  async listMarkdownNotes(): Promise<MarkdownNoteFile[]> {
    const notes: MarkdownNoteFile[] = [];

    const directory = this.directory as DirectoryWithEntries;

    for await (const [name, handle] of directory.entries()) {
      // Only Markdown files in the selected folder.
      if (handle.kind !== 'file' || !name.toLowerCase().endsWith('.md')) {
        continue;
      }

      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();

      notes.push({
        name,
        content: await file.text(),
      });
    }

    notes.sort((a, b) => a.name.localeCompare(b.name));

    return notes;
  }

  /**
   * Request write permission when the user clicks Save.
   */
  async requestWriteAccess(): Promise<boolean> {
    const directory = this.directory as FileSystemDirectoryHandle & {
      requestPermission?: (options: {
        mode: 'readwrite';
      }) => Promise<PermissionState>;
    };

    if (!directory.requestPermission) {
      throw new Error('This browser does not support requesting write access');
    }

    const permission = await directory.requestPermission({
      mode: 'readwrite',
    });

    return permission === 'granted';
  }

  /**
   * Save an existing Markdown file.
   *
   * Only writes when explicitly called.
   * Prevents overwriting changes made outside the editor.
   */
  async saveMarkdownNote(
    name: string,
    newContent: string,
    expectedContent: string
  ): Promise<void> {
    // This MVP only supports files in the selected folder.
    if (
      !name.toLowerCase().endsWith('.md') ||
      name.includes('/') ||
      name.includes('\\') ||
      name === '.' ||
      name === '..'
    ) {
      throw new Error(`Invalid Markdown filename: ${name}`);
    }

    // Do not create a new file implicitly.
    const handle = await this.directory.getFileHandle(name);

    // Read the latest content from disk before saving.
    const file = await handle.getFile();
    const currentContent = await file.text();

    // Prevent accidentally overwriting external changes.
    if (currentContent !== expectedContent) {
      throw new Error(
        `The file "${name}" was modified outside the editor. ` +
          'Please reload it before saving.'
      );
    }

    // Request a writable stream for this file.
    const writable = await handle.createWritable();

    try {
      await writable.write(newContent);
      await writable.close();
    } catch (error) {
      try {
        await writable.abort();
      } catch {
        // The stream may already be closed or aborted.
      }

      throw error;
    }
  }
}
