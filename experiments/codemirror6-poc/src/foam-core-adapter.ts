import {
  URI,
  FoamWorkspace,
  GenericDataStore,
  MarkdownResourceProvider,
  createMarkdownParser,
  type Resource,
  type ResourceLink,
  type ResourceParser,
} from '@foam/core';

export class FoamCoreAdapter {
  readonly workspace: FoamWorkspace;

  private readonly parser: ResourceParser;
  private readonly files: Map<string, string>;

  private constructor(
    workspace: FoamWorkspace,
    parser: ResourceParser,
    files: Map<string, string>
  ) {
    this.workspace = workspace;
    this.parser = parser;
    this.files = files;
  }

  static async createWithSampleNotes(): Promise<FoamCoreAdapter> {
    const welcomeUri = URI.file('/notes/Welcome.md');
    const nodejsUri = URI.file('/notes/NodeJS.md');
    const gitUri = URI.file('/notes/Git.md');

    const files = new Map<string, string>([
      [
        welcomeUri.toString(),
        [
          '# Welcome',
          '',
          '[[NodeJS]]',
          '[[NodeJS|Node.js]]',
          '[NodeJS](./NodeJS.md)',
          '[[Git]]',
          '[[MissingNote]]',
        ].join('\n'),
      ],
      [nodejsUri.toString(), '# NodeJS\n\nNodeJS note.'],
      [gitUri.toString(), '# Git\n\nGit note.'],
    ]);

    const uris = [welcomeUri, nodejsUri, gitUri];

    // In-memory DataStore for browser experiments.
    const dataStore = new GenericDataStore(
      async () => uris,
      async uri => {
        const content = files.get(uri.toString());

        if (content === undefined) {
          throw new Error(`Note not found: ${uri.toString()}`);
        }

        return content;
      }
    );

    const parser = createMarkdownParser([]);

    const provider = new MarkdownResourceProvider(dataStore, parser);

    const workspace = await FoamWorkspace.fromProviders(
      [URI.file('/notes')],
      [provider],
      dataStore
    );

    return new FoamCoreAdapter(workspace, parser, files);
  }

  /**
   * Create a Foam Workspace from Markdown files
   * selected through BrowserNoteRepository.
   *
   * This first version is in-memory and read-only
   * with respect to the physical files on disk.
   */
  static async createFromMarkdownFiles(
    notes: readonly {
      name: string;
      content: string;
    }[]
  ): Promise<FoamCoreAdapter> {
    const rootUri = URI.file('/real-notes');

    const files = new Map<string, string>();
    const uris: URI[] = [];

    for (const note of notes) {
      // Only accept Markdown filenames in the selected folder.
      if (
        !note.name.toLowerCase().endsWith('.md') ||
        note.name.includes('/') ||
        note.name.includes('\\')
      ) {
        throw new Error(`Invalid Markdown filename: ${note.name}`);
      }

      const uri = rootUri.joinPath(note.name);
      const key = uri.toString();

      if (files.has(key)) {
        throw new Error(`Duplicate Markdown file: ${note.name}`);
      }

      files.set(key, note.content);
      uris.push(uri);
    }

    // In-memory data source built from real Markdown files.
    // It does not write back to disk.
    const dataStore = new GenericDataStore(
      async () => uris,
      async uri => {
        const content = files.get(uri.toString());

        if (content === undefined) {
          throw new Error(`Markdown file not found: ${uri.toString()}`);
        }

        return content;
      }
    );

    const parser = createMarkdownParser([]);

    const provider = new MarkdownResourceProvider(dataStore, parser);

    const workspace = await FoamWorkspace.fromProviders(
      [rootUri],
      [provider],
      dataStore
    );

    return new FoamCoreAdapter(workspace, parser, files);
  }

  readNote(uri: URI): string | null {
    return this.files.get(uri.toString()) ?? null;
  }

  updateNote(uri: URI, markdown: string): Resource {
    const key = uri.toString();

    // Do not accidentally create or overwrite unknown notes.
    if (!this.files.has(key)) {
      throw new Error(`Note not found: ${key}`);
    }

    const note = this.parser.parse(uri, markdown);

    this.files.set(key, markdown);
    this.workspace.set(note);

    return note;
  }

  // Keep compatibility with the existing editor sync plugin.
  updateWelcome(markdown: string): Resource {
    return this.updateNote(URI.file('/notes/Welcome.md'), markdown);
  }

  getNote(uri: URI): Resource | null {
    return this.workspace.find(uri);
  }

  resolveLink(source: Resource, link: ResourceLink): URI {
    return this.workspace.resolveLink(source, link);
  }
}
