import { EditorView, basicSetup } from 'codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  HighlightStyle,
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
import './style.css';
import { headingLivePreview } from './heading-live-preview';
import { inlineLivePreview } from './inline-live-preview';
import { inlineCodeLivePreview } from './inline-code-live-preview';
import { listLivePreview } from './list-live-preview';
import { taskLivePreview } from './task-live-preview';
import { wikilinkLivePreview } from './wikilink-live-preview';
import { markdownLinkLivePreview } from './markdown-link-live-preview';
import { externalLinkNavigation } from './link-navigation';
import { foamEditorSync } from './foam-editor-sync';
import {
  internalLinkNavigation,
  realLinkNavigationContext,
} from './internal-link-navigation';
import { getActiveNoteUri } from './foam-editor-sync';
import { noteSwitchAnnotation } from './foam-editor-sync';
import { WELCOME_URI, readStoredNote, writeStoredNote } from './note-storage';
import { EditorState, type Extension } from '@codemirror/state';
import { registerNoteStateFactory } from './foam-editor-sync';
import { wikilinkCaret } from './wikilink-caret';
import { blockquoteLivePreview } from './blockquote-live-preview';
import { imageLivePreview } from './image-live-preview';
import { URI, FoamGraph } from '@foam/core';
import { resolveLocalImageUrl } from './asset-resolver';
import { noteUriFacet } from './note-context';
import { readWelcomeFromDisk } from './file-system-smoke';
import { BrowserNoteRepository } from './browser-note-repository';
import { FoamCoreAdapter } from './foam-core-adapter';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App element not found');
}

// Main application layout.
app.innerHTML = `
  <div class="workspace">
    <header class="topbar">
      <div class="brand">
        Foam Editor
        <span>CodeMirror 6 PoC</span>
      </div>
    </header>

    <main class="main-content">
  <aside class="file-explorer">
    <div class="explorer-title">EXPLORER</div>

    <div id="mvp-file-list" class="file-list">
      Chưa mở thư mục
    </div>
  </aside>

  <section class="editor-panel">
    <div class="panel-title">Welcome.md</div>
    <div id="editor"></div>
  </section>
</main>
  </div>
`;

// Initial Markdown document.
const initialMarkdown = [
  '# Welcome to Foam Editor',
  '',
  'This is our first CodeMirror 6 editor.',
  '',
  '## Markdown Formatting',
  '',
  '**Bold text**',
  '*Italic text*',
  '`Inline code`',
  '',
  '## Lists',
  '',
  '- First item',
  '- Second item',
  '  - Nested item',
  '',
  '## Tasks',
  '',
  '- [ ] Pending task',
  '- [x] Completed task',
  '',
  '## Blockquote',
  '',
  '> This is a Markdown blockquote.',
  '',
  '## Links',
  '',
  '[[NodeJS]]',
  '[Google](https://www.google.com)',
].join('\n');

const assetTests = [
  {
    source: URI.file('/notes/Welcome.md'),
    path: './images/demo.png',
  },
  {
    source: URI.file('/notes/sub/Topic.md'),
    path: '../images/demo.png',
  },
  {
    source: URI.file('/notes/Welcome.md'),
    path: './images/not-found.png',
  },
  {
    source: URI.file('/notes/Welcome.md'),
    path: '../../secret.png',
  },
];

console.table(
  assetTests.map(test => ({
    source: test.source.toString(),
    path: test.path,
    result: resolveLocalImageUrl(test.source, test.path),
  }))
);

// Restore Welcome.md, including previously saved content.
const savedMarkdown = readStoredNote(WELCOME_URI);

// Heading hierarchy styling for Markdown Live Preview.
const headingStyle = HighlightStyle.define([
  // Reuse default styles, except the underlined heading rule.
  ...defaultHighlightStyle.specs.filter(spec => spec.tag !== tags.heading),

  // Headings should be bold, without underlining.
  {
    tag: tags.heading,
    fontWeight: 'bold',
    textDecoration: 'none',
  },
  {
    tag: tags.heading1,
    fontSize: '1.8em',
    fontWeight: '700',
  },
  {
    tag: tags.heading2,
    fontSize: '1.6em',
    fontWeight: '700',
  },
  {
    tag: tags.heading3,
    fontSize: '1.4em',
    fontWeight: '700',
  },
  {
    tag: tags.heading4,
    fontSize: '1.25em',
    fontWeight: '700',
  },
  {
    tag: tags.heading5,
    fontSize: '1.15em',
    fontWeight: '700',
  },
  {
    tag: tags.heading6,
    fontSize: '1.05em',
    fontWeight: '700',
  },
]);

const editorContainer = document.querySelector<HTMLElement>('#editor');

if (!editorContainer) {
  throw new Error('Editor container not found');
}

// Shared configuration for every note's EditorState.
const editorExtensions: Extension[] = [
  basicSetup,
  markdown({ base: markdownLanguage }),
  syntaxHighlighting(headingStyle),
  EditorView.lineWrapping,

  headingLivePreview,
  inlineLivePreview,
  inlineCodeLivePreview,
  listLivePreview,
  taskLivePreview,
  blockquoteLivePreview,
  wikilinkLivePreview,
  wikilinkCaret,
  markdownLinkLivePreview,
  imageLivePreview,

  externalLinkNavigation,
  foamEditorSync,
  internalLinkNavigation,

  EditorView.updateListener.of(update => {
    if (!update.docChanged) {
      return;
    }

    const isNoteSwitch = update.transactions.some(transaction =>
      transaction.annotation(noteSwitchAnnotation)
    );

    if (isNoteSwitch) {
      return;
    }

    const activeUri = getActiveNoteUri(update.view);

    if (!activeUri) {
      console.warn('[Foam Storage] No active note found');
      return;
    }

    writeStoredNote(activeUri, update.state.doc.toString());
  }),
];

function createNoteState(markdownText: string, noteUri: URI): EditorState {
  const state = EditorState.create({
    doc: markdownText,
    extensions: [...editorExtensions, noteUriFacet.of(noteUri)],
  });

  // Temporary integration check.
  console.log('[Note State URI]', state.facet(noteUriFacet)?.toString());

  return state;
}

// Register the factory before creating the editor.
registerNoteStateFactory(createNoteState);

const mainEditor = new EditorView({
  state: createNoteState(savedMarkdown ?? initialMarkdown, WELCOME_URI),
  parent: editorContainer,
});

// Real-file preview: no sample synchronization or LocalStorage writing.
const realFilePreviewExtensions: Extension[] = [
  internalLinkNavigation,
  externalLinkNavigation,
  basicSetup,
  markdown({ base: markdownLanguage }),
  syntaxHighlighting(headingStyle),
  EditorView.lineWrapping,

  headingLivePreview,
  inlineLivePreview,
  inlineCodeLivePreview,
  listLivePreview,
  taskLivePreview,
  blockquoteLivePreview,
  wikilinkLivePreview,
  markdownLinkLivePreview,
  imageLivePreview,

  EditorState.readOnly.of(true),
  EditorView.editable.of(false),

  // Prevent changes even if a custom widget dispatches an edit.
  EditorState.transactionFilter.of(transaction =>
    transaction.docChanged ? [] : transaction
  ),

  // Disable checkbox interaction in read-only preview.
  EditorView.theme({
    '& .cm-task-checkbox': {
      pointerEvents: 'none',
    },
  }),
];

const realFileEditExtensions: Extension[] = [
  internalLinkNavigation,
  externalLinkNavigation,
  basicSetup,
  markdown({ base: markdownLanguage }),
  syntaxHighlighting(headingStyle),
  EditorView.lineWrapping,

  headingLivePreview,
  inlineLivePreview,
  inlineCodeLivePreview,
  listLivePreview,
  taskLivePreview,
  blockquoteLivePreview,
  wikilinkLivePreview,
  markdownLinkLivePreview,
  imageLivePreview,

  // Track changes without writing to disk.
  EditorView.updateListener.of(update => {
    if (!update.docChanged || !realFileSession) {
      return;
    }

    const changed = hasUnsavedRealChanges();

    const title = document.querySelector<HTMLElement>('.panel-title');

    if (title) {
      title.textContent = changed
        ? `${realFileSession.name} * (Not Saved)`
        : `${realFileSession.name} (Editing)`;
    }
  }),
];

let savedSampleState: EditorState | null = null;
let savedSampleTitle = '';

type RealFileSession = {
  repository: BrowserNoteRepository;
  name: string;
  uri: URI;
  originalContent: string;
  editing: boolean;
};

let realFileSession: RealFileSession | null = null;
let savingRealFile = false;
let switchingWorkspace = false;
let workspaceDiscardApproved = false;

type ActiveRealWorkspace = {
  repository: BrowserNoteRepository;
  adapter: FoamCoreAdapter;
  graph: FoamGraph;
};

let activeRealWorkspace: ActiveRealWorkspace | null = null;
let realCoreSyncNeedsRetry = false;

function hasUnsavedRealChanges(): boolean {
  if (!realFileSession?.editing) {
    return false;
  }

  return mainEditor.state.doc.toString() !== realFileSession.originalContent;
}

const saveRealFileButton = document.createElement('button');

saveRealFileButton.type = 'button';
saveRealFileButton.textContent = 'Save Real File';
saveRealFileButton.style.display = 'none';

document.querySelector('.topbar')?.appendChild(saveRealFileButton);

async function saveActiveRealFile(): Promise<boolean> {
  const session = realFileSession;

  if (!session || !session.editing || savingRealFile) {
    return false;
  }

  const workspace = activeRealWorkspace;

  // Never synchronize a note with the wrong workspace.
  if (!workspace || workspace.repository !== session.repository) {
    window.alert('Active Foam Workspace does not match this file.');
    return false;
  }

  const markdownToSave = mainEditor.state.doc.toString();
  const needsDiskWrite = markdownToSave !== session.originalContent;

  if (!needsDiskWrite && !realCoreSyncNeedsRetry) {
    console.log('[MVP Real File Save] No changes');
    return true;
  }

  savingRealFile = true;
  saveRealFileButton.disabled = true;

  try {
    // Step 1: Write to disk only when the document changed.
    if (needsDiskWrite) {
      const granted = await session.repository.requestWriteAccess();

      if (!granted) {
        window.alert('Write permission was not granted. File was not saved.');
        return false;
      }

      await session.repository.saveMarkdownNote(
        session.name,
        markdownToSave,
        session.originalContent
      );

      // Disk write has succeeded.
      // Update the disk baseline immediately.
      session.originalContent = markdownToSave;
    }

    // Step 2: Synchronize the persisted Markdown with Foam Core.
    try {
      const updatedResource = workspace.adapter.updateNote(
        session.uri,
        markdownToSave
      );

      // FoamGraph monitors workspace.set() automatically.
      realCoreSyncNeedsRetry = false;

      console.log('[MVP Real Foam Sync]', {
        file: session.name,
        links: updatedResource.links.map(link => link.rawText),
        graphLinkCount: workspace.graph.getLinks(session.uri).length,
      });
    } catch (syncError) {
      realCoreSyncNeedsRetry = true;

      console.error('[MVP Real Foam Sync] Failed:', syncError);

      const title = document.querySelector<HTMLElement>('.panel-title');

      if (title && realFileSession === session) {
        title.textContent = hasUnsavedRealChanges()
          ? `${session.name} * (Not Saved; Core Sync Error)`
          : `${session.name} (Disk Saved; Core Sync Error)`;
      }

      window.alert(
        'The Markdown file was saved to disk, but Foam Core ' +
          'synchronization failed. Your saved file is preserved. ' +
          'Please check the Console. You can retry with Save.'
      );

      return false;
    }

    // Step 3: Report the final editor state.
    const stillDirty = hasUnsavedRealChanges();

    const title = document.querySelector<HTMLElement>('.panel-title');

    if (title && realFileSession === session) {
      title.textContent = stillDirty
        ? `${session.name} * (Not Saved)`
        : `${session.name} (Editing)`;
    }

    console.log('[MVP Real File Saved]', {
      file: session.name,
      characters: markdownToSave.length,
      diskWrittenNow: needsDiskWrite,
      coreSynced: true,
      stillDirty,
    });

    return !stillDirty;
  } catch (error) {
    console.error('[MVP Real File Save] Failed:', error);

    window.alert(
      error instanceof Error ? error.message : 'Failed to save Markdown file.'
    );

    return false;
  } finally {
    savingRealFile = false;
    saveRealFileButton.disabled = false;
  }
}

// Save button continues to use the same logic.
saveRealFileButton.addEventListener('click', () => {
  void saveActiveRealFile();
});

type WorkspaceSwitchDecision = 'save' | 'discard' | 'cancel';

function askWorkspaceSwitchDecision(): Promise<WorkspaceSwitchDecision> {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');

    dialog.style.cssText = `
      width: min(440px, 90vw);
      padding: 24px;
      border: 1px solid #ccc;
      border-radius: 10px;
    `;

    const heading = document.createElement('h3');
    heading.textContent = 'Unsaved Changes';

    const message = document.createElement('p');
    message.textContent =
      'The current Markdown note has unsaved changes. ' +
      'What would you like to do before switching workspace?';

    const actions = document.createElement('div');

    actions.style.cssText = `
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 20px;
    `;

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.textContent = 'Save';

    const discardButton = document.createElement('button');
    discardButton.type = 'button';
    discardButton.textContent = 'Discard';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';

    let finished = false;

    function finish(decision: WorkspaceSwitchDecision): void {
      if (finished) return;

      finished = true;
      dialog.close();
      dialog.remove();

      resolve(decision);
    }

    saveButton.addEventListener('click', async () => {
      saveButton.disabled = true;
      discardButton.disabled = true;
      cancelButton.disabled = true;
      saveButton.textContent = 'Saving...';

      // Call directly from the Save click so the browser
      // can request write permission.
      const saved = await saveActiveRealFile();

      if (saved) {
        finish('save');
        return;
      }

      // Failed save: keep the dialog and editor contents.
      saveButton.disabled = false;
      discardButton.disabled = false;
      cancelButton.disabled = false;
      saveButton.textContent = 'Save';
    });

    discardButton.addEventListener('click', () => {
      finish('discard');
    });

    cancelButton.addEventListener('click', () => {
      finish('cancel');
    });

    dialog.addEventListener('cancel', event => {
      event.preventDefault();

      // Do not dismiss the dialog during a write operation.
      if (!saveButton.disabled) {
        finish('cancel');
      }
    });

    actions.append(saveButton, discardButton, cancelButton);

    dialog.replaceChildren(heading, message, actions);

    document.body.appendChild(dialog);
    dialog.showModal();
  });
}

const editRealFileButton = document.createElement('button');

editRealFileButton.type = 'button';
editRealFileButton.textContent = 'Edit Real File';
editRealFileButton.style.display = 'none';
saveRealFileButton.style.display = 'inline-block';

document.querySelector('.topbar')?.appendChild(editRealFileButton);

editRealFileButton.addEventListener('click', () => {
  const session = realFileSession;

  if (!session || session.editing) {
    return;
  }

  const markdown = mainEditor.state.doc.toString();

  session.editing = true;

  mainEditor.setState(
    EditorState.create({
      doc: markdown,
      extensions: [
        ...realFileEditExtensions,
        noteUriFacet.of(session.uri),
        realNoteNavigationContext(),
      ],
    })
  );

  const title = document.querySelector<HTMLElement>('.panel-title');

  if (title) {
    title.textContent = `${session.name} (Editing)`;
  }

  editRealFileButton.style.display = 'none';
  saveRealFileButton.style.display = 'inline-block';

  console.log('[MVP Real File Edit]', {
    file: session.name,
    editable: true,
    savedToDisk: false,
  });

  mainEditor.focus();
});

const returnButton = document.createElement('button');
returnButton.type = 'button';
returnButton.textContent = 'Return to Sample';
returnButton.style.display = 'none';

document.querySelector('.topbar')?.appendChild(returnButton);

returnButton.addEventListener('click', () => {
  if (savingRealFile) {
    window.alert('Please wait until saving finishes.');
    return;
  }

  if (!savedSampleState) {
    return;
  }

  if (
    hasUnsavedRealChanges() &&
    !workspaceDiscardApproved &&
    !window.confirm('File has unsaved changes. Return without saving?')
  ) {
    return;
  }

  mainEditor.setState(savedSampleState);
  savedSampleState = null;
  realFileSession = null;
  updateExplorerActiveFile();
  editRealFileButton.style.display = 'none';
  saveRealFileButton.style.display = 'none';

  const title = document.querySelector<HTMLElement>('.panel-title');

  if (title) {
    title.textContent = savedSampleTitle;
  }

  returnButton.style.display = 'none';

  console.log('[MVP Return to Sample] OK');
});

// Temporary button for testing real file access.
const fileTestButton = document.createElement('button');

fileTestButton.type = 'button';
fileTestButton.textContent = 'Open Test Folder';

document.querySelector('.topbar')?.appendChild(fileTestButton);

fileTestButton.addEventListener('click', async () => {
  try {
    const result = await readWelcomeFromDisk();

    if (!result) {
      console.log('[MVP File Read] Cancelled');
      return;
    }

    console.log('[MVP File Read]', {
      folder: result.folder,
      content: result.content,
    });
  } catch (error) {
    console.error('[MVP File Read] Failed:', error);
  }
});

let openingExplorerFile = false;

let explorerRepository: BrowserNoteRepository | null = null;

function canNavigateRealNote(): boolean {
  if (savingRealFile || openingExplorerFile || switchingWorkspace) {
    window.alert('Please wait until the current file operation finishes.');
    return false;
  }

  if (hasUnsavedRealChanges() || realCoreSyncNeedsRetry) {
    window.alert(
      'Please save the current note successfully before following a Wikilink.'
    );
    return false;
  }

  return true;
}

function realNoteNavigationContext(): Extension {
  return realLinkNavigationContext.of({
    adapter: activeRealWorkspace?.adapter ?? null,
    canNavigate: canNavigateRealNote,
    openNote: targetUri => {
      void openRealWikilink(targetUri);
    },
  });
}

async function openRealWikilink(targetUri: URI): Promise<void> {
  const workspace = activeRealWorkspace;
  const session = realFileSession;

  if (
    !canNavigateRealNote() ||
    !workspace ||
    !session ||
    workspace.repository !== session.repository ||
    targetUri.fragment ||
    workspace.adapter.getNote(targetUri)?.type !== 'note'
  ) {
    return;
  }

  if (targetUri.toString() === session.uri.toString()) {
    return;
  }

  openingExplorerFile = true;
  const sourceState = mainEditor.state;

  try {
    const name = targetUri.path.slice('/real-notes/'.length);
    // Repository validates the filename and reads an existing file only.
    const latestNote = await workspace.repository.readMarkdownNote(name);

    // Editing, returning to Sample, or starting Save during the read must
    // never allow a stale navigation to replace the current document.
    if (
      activeRealWorkspace !== workspace ||
      realFileSession !== session ||
      mainEditor.state !== sourceState ||
      savingRealFile ||
      switchingWorkspace ||
      hasUnsavedRealChanges() ||
      realCoreSyncNeedsRetry
    ) {
      window.alert(
        'The current note changed. Please try following the Wikilink again.'
      );
      return;
    }

    openRealNoteInEditor(workspace.repository, latestNote);
  } catch (error) {
    window.alert(
      error instanceof Error ? error.message : 'Failed to open Markdown file.'
    );
  } finally {
    openingExplorerFile = false;
  }
}

function updateExplorerActiveFile(): void {
  const activeName =
    realFileSession && explorerRepository === realFileSession.repository
      ? realFileSession.name
      : null;

  const fileButtons = document.querySelectorAll<HTMLButtonElement>(
    '#mvp-file-list .explorer-file'
  );

  for (const button of fileButtons) {
    const isActive =
      activeName !== null && button.dataset.noteName === activeName;

    button.classList.toggle('is-active', isActive);

    if (isActive) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  }
}

function renderExplorerFileList(
  repository: BrowserNoteRepository,
  notes: ReadonlyArray<{ name: string }>
): void {
  const container = document.querySelector<HTMLDivElement>('#mvp-file-list');

  if (!container) {
    throw new Error('File Explorer list not found');
  }

  const folderElement = document.createElement('div');
  folderElement.className = 'explorer-folder';
  folderElement.textContent = `📁 ${repository.folderName}`;

  const elements: HTMLElement[] = [folderElement];

  if (notes.length === 0) {
    const emptyElement = document.createElement('div');
    emptyElement.className = 'explorer-empty';
    emptyElement.textContent = 'No Markdown files found';

    elements.push(emptyElement);
  } else {
    for (const note of notes) {
      const fileElement = document.createElement('button');

      fileElement.type = 'button';
      fileElement.className = 'explorer-file';
      fileElement.textContent = `📄 ${note.name}`;
      fileElement.dataset.noteName = note.name;

      fileElement.addEventListener('click', async () => {
        if (switchingWorkspace) {
          return;
        }
        // Avoid overlapping file-opening operations.
        if (openingExplorerFile) {
          return;
        }

        if (savingRealFile) {
          window.alert('Please wait until saving finishes.');
          return;
        }

        openingExplorerFile = true;

        try {
          // Always read the latest version from disk.
          const latestNote = await repository.readMarkdownNote(note.name);

          // Reuse the existing editor-opening logic.
          const opened = openRealNoteInEditor(repository, latestNote);

          if (opened) {
            console.log('[MVP Explorer File Opened]', {
              file: latestNote.name,
              characters: latestNote.content.length,
            });
          }
        } catch (error) {
          console.error('[MVP Explorer File Open] Failed:', error);

          window.alert(
            error instanceof Error
              ? error.message
              : 'Failed to open Markdown file.'
          );
        } finally {
          openingExplorerFile = false;
        }
      });

      elements.push(fileElement);
    }
  }

  container.replaceChildren(...elements);
  explorerRepository = repository;
  updateExplorerActiveFile();

  console.log('[MVP Explorer Rendered]', {
    folder: repository.folderName,
    count: notes.length,
  });
}

function openRealNoteInEditor(
  repository: BrowserNoteRepository,
  selected: { name: string; content: string }
): boolean {
  // Prevent switching notes while saving.
  if (savingRealFile) {
    window.alert('Please wait until saving finishes.');
    return false;
  }

  // Protect unsaved changes.
  if (
    hasUnsavedRealChanges() &&
    !window.confirm('File has unsaved changes. Discard changes?')
  ) {
    return false;
  }

  const title = document.querySelector<HTMLElement>('.panel-title');

  // Preserve the original sample EditorState only once.
  if (!savedSampleState) {
    savedSampleState = mainEditor.state;
    savedSampleTitle = title?.textContent ?? 'Welcome.md';
  }

  const realNoteUri = URI.file('/real-notes').joinPath(selected.name);

  // Link positions must describe the latest disk content shown in the editor.
  if (activeRealWorkspace?.repository === repository) {
    activeRealWorkspace.adapter.updateNote(realNoteUri, selected.content);
  }

  const previewState = EditorState.create({
    doc: selected.content,
    extensions: [
      ...realFilePreviewExtensions,
      noteUriFacet.of(realNoteUri),
      realNoteNavigationContext(),
    ],
  });

  mainEditor.setState(previewState);

  realFileSession = {
    repository,
    name: selected.name,
    uri: realNoteUri,
    originalContent: selected.content,
    editing: false,
  };
  updateExplorerActiveFile();

  editRealFileButton.style.display = 'inline-block';
  saveRealFileButton.style.display = 'none';
  returnButton.style.display = 'inline-block';

  if (title) {
    title.textContent = `${selected.name} (Read Only)`;
  }

  console.log('[MVP Real Note Opened]', {
    file: selected.name,
    uri: realNoteUri.toString(),
    characters: selected.content.length,
    readOnly: true,
  });

  return true;
}

// Temporary button to test reading multiple Markdown notes.
const listNotesButton = document.createElement('button');

listNotesButton.type = 'button';
listNotesButton.textContent = 'List Markdown Notes';

document.querySelector('.topbar')?.appendChild(listNotesButton);

listNotesButton.addEventListener('click', async () => {
  // Prevent changing workspace while saving.
  if (savingRealFile) {
    window.alert('Please wait until saving finishes.');
    return;
  }

  // Prevent changing workspace while opening a note.
  if (openingExplorerFile) {
    window.alert('Please wait until the note finishes opening.');
    return;
  }

  if (switchingWorkspace) {
    return;
  }

  switchingWorkspace = true;

  try {
    const repository = await BrowserNoteRepository.pick();

    if (!repository) {
      console.log('[MVP Note List] Cancelled');
      return;
    }

    let notes = await repository.listMarkdownNotes();

    // Ensure no other file operation is in progress.
    if (savingRealFile || openingExplorerFile) {
      window.alert('Please wait for the current operation to finish.');
      return;
    }

    let decision: WorkspaceSwitchDecision = 'save';

    // Only prompt after the new folder has been selected
    // and read successfully.
    if (realFileSession && hasUnsavedRealChanges()) {
      decision = await askWorkspaceSwitchDecision();

      if (decision === 'cancel') {
        console.log('[MVP Workspace Switch] Cancelled');
        return;
      }
    }

    // A successful Save must leave no unsaved changes.
    if (realFileSession && hasUnsavedRealChanges() && decision !== 'discard') {
      window.alert(
        'The current note still has unsaved changes. ' +
          'Workspace switching was cancelled.'
      );
      return;
    }

    // Reload files after a possible Save / Discard decision.
    // This also handles selecting the same folder again.
    notes = await repository.listMarkdownNotes();

    // Prepare the new Foam Core adapter before replacing
    // the currently active workspace.
    const nextRealFoamAdapter = await FoamCoreAdapter.createFromMarkdownFiles(
      notes
    );

    // Create a Graph from the prepared Foam Workspace.
    // Graph will monitor Workspace events.
    const nextRealFoamGraph = FoamGraph.fromWorkspace(
      nextRealFoamAdapter.workspace,
      true
    );

    console.log('[MVP Real Graph Prepared]', {
      folder: repository.folderName,
      graphReady: true,
    });

    console.log('[MVP Real Workspace Prepared]', {
      folder: repository.folderName,
      noteCount: notes.length,
    });

    // Restore Sample before rendering the new workspace.
    if (realFileSession) {
      workspaceDiscardApproved = decision === 'discard';

      try {
        returnButton.click();
      } finally {
        workspaceDiscardApproved = false;
      }

      if (realFileSession) {
        throw new Error(
          'Could not close the current note before switching workspace.'
        );
      }
    }

    // Only now display the new folder.
    renderExplorerFileList(repository, notes);

    // Remember the previously active workspace.
    const previousRealWorkspace = activeRealWorkspace;

    // Activate the newly prepared workspace.
    activeRealWorkspace = {
      repository,
      adapter: nextRealFoamAdapter,
      graph: nextRealFoamGraph,
    };
    realCoreSyncNeedsRetry = false;

    // Dispose the previous workspace only after the new
    // workspace has been activated successfully.
    if (previousRealWorkspace) {
      previousRealWorkspace.graph.dispose();
      previousRealWorkspace.adapter.workspace.dispose();

      console.log('[MVP Previous Real Workspace Disposed]', {
        folder: previousRealWorkspace.repository.folderName,
      });
    }

    // Inspect the first Markdown note, if one exists.
    const firstNote = notes[0];

    if (firstNote) {
      const firstNoteUri = URI.file('/real-notes').joinPath(firstNote.name);

      console.log('[MVP Real Graph Check]', {
        file: firstNote.name,
        links: nextRealFoamGraph.getLinks(firstNoteUri),
        backlinks: nextRealFoamGraph.getBacklinks(firstNoteUri),
      });
    }

    console.log('[MVP Active Real Workspace]', {
      folder: activeRealWorkspace.repository.folderName,
      noteCount: notes.length,
      adapterReady: true,
    });

    console.log('[MVP Note List]', {
      folder: repository.folderName,
      count: notes.length,
    });

    console.table(
      notes.map(note => ({
        file: note.name,
        characters: note.content.length,
      }))
    );

    console.log('[MVP Note Contents]', notes);

    // Reuse the active adapter created before switching.
    const realWorkspace = nextRealFoamAdapter;

    const realWelcomeUri = URI.file('/real-notes/Welcome.md');

    const realWelcome = realWorkspace.getNote(realWelcomeUri);

    console.log('[MVP Real Workspace]', {
      folder: repository.folderName,
      noteCount: notes.length,
      welcomeExists: realWelcome !== null,
    });

    if (realWelcome) {
      console.table(
        realWelcome.links.map(link => {
          const target = realWorkspace.resolveLink(realWelcome, link);

          return {
            link: link.rawText,
            target: target.toString(),
            exists: realWorkspace.getNote(target) !== null,
          };
        })
      );
    }

    // Preview real Markdown notes without changing CodeMirror.
    const existingDialog =
      document.querySelector<HTMLDialogElement>('#mvp-note-preview');

    const dialog = existingDialog ?? document.createElement('dialog');

    dialog.id = 'mvp-note-preview';

    dialog.style.cssText = `
      width: min(800px, 90vw);
      max-height: 85vh;
      padding: 20px;
      border: 1px solid #aaa;
      border-radius: 10px;
    `;

    const heading = document.createElement('h3');
    heading.textContent = `Markdown files - ${repository.folderName}`;

    const select = document.createElement('select');

    select.style.cssText = `
      display: block;
      width: 100%;
      margin: 12px 0;
      padding: 8px;
    `;

    for (const note of notes) {
      const option = document.createElement('option');
      option.value = note.name;
      option.textContent = note.name;
      select.appendChild(option);
    }

    const preview = document.createElement('textarea');

    preview.readOnly = true;
    preview.rows = 15;

    preview.style.cssText = `
      width: 100%;
      box-sizing: border-box;
      padding: 12px;
      font-family: monospace;
      resize: vertical;
    `;

    const showSelectedNote = () => {
      const selected = notes.find(note => note.name === select.value);

      preview.value = selected?.content ?? '';

      if (selected) {
        console.log('[MVP Note Preview]', {
          file: selected.name,
          characters: selected.content.length,
        });
      }
    };

    select.addEventListener('change', showSelectedNote);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = 'Close';
    closeButton.style.marginTop = '12px';

    closeButton.addEventListener('click', () => {
      dialog.close();
    });

    const openInEditorButton = document.createElement('button');
    openInEditorButton.type = 'button';
    openInEditorButton.textContent = 'Open in CodeMirror';
    openInEditorButton.style.marginRight = '12px';

    openInEditorButton.addEventListener('click', () => {
      const selected = notes.find(note => note.name === select.value);

      if (!selected) {
        return;
      }

      const opened = openRealNoteInEditor(repository, selected);

      if (opened) {
        dialog.close();
      }
    });

    dialog.replaceChildren(
      heading,
      select,
      preview,
      openInEditorButton,
      closeButton
    );

    if (!dialog.isConnected) {
      document.body.appendChild(dialog);
    }

    if (notes.length > 0) {
      showSelectedNote();
    }

    dialog.showModal();
  } catch (error) {
    console.error('[MVP Note List] Failed:', error);
  } finally {
    switchingWorkspace = false;
  }
});

window.addEventListener('beforeunload', event => {
  if (savingRealFile || hasUnsavedRealChanges()) {
    event.preventDefault();
    event.returnValue = '';
  }
});
