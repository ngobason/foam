type FilePickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<FileSystemDirectoryHandle>;
};

export async function readWelcomeFromDisk(): Promise<{
  folder: string;
  content: string;
} | null> {
  const browser = window as FilePickerWindow;

  if (!browser.showDirectoryPicker) {
    throw new Error('Directory picker is not supported');
  }

  try {
    // Request read access only.
    const directory = await browser.showDirectoryPicker({
      mode: 'read',
    });

    const handle = await directory.getFileHandle('Welcome.md');
    const file = await handle.getFile();
    const content = await file.text();

    return {
      folder: directory.name,
      content,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }

    throw error;
  }
}
