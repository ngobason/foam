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
import { RealNoteAutosave } from './real-note-autosave';
import {
  prepareRealNoteNavigation,
  type NoteSwitchDecision,
} from './real-note-navigation';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App element not found');
}

// Main application layout.
app.innerHTML = `
  <div class="workspace">
    <header class="topbar" aria-label="Workspace actions">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">F</span>
        Foam Editor
      </div>
      <div class="workspace-actions" role="group" aria-label="Workspace"></div>
      <div class="note-actions" role="group" aria-label="Current note"></div>
      <details class="developer-tools">
        <summary>Developer</summary>
        <div class="developer-actions"></div>
      </details>
    </header>

    <main class="main-content">
  <aside class="file-explorer" aria-label="File Explorer">
    <h2 class="explorer-title">Explorer</h2>

    <div id="mvp-file-list" class="file-list">
      <div class="explorer-empty">Choose List Markdown Notes to open a workspace.</div>
    </div>
  </aside>

  <section class="editor-panel" aria-label="Markdown editor">
    <div class="note-header">
      <h1 class="panel-title">Welcome.md</h1>
      <div class="save-status" role="status" aria-live="polite" aria-atomic="true">Sample · browser storage</div>
    </div>
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

  {
    tag: tags.monospace,
    fontFamily: 'Consolas, "Courier New", monospace',
  },

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

  // Real-file edits use a separate coordinator, never sample LocalStorage.
  EditorView.updateListener.of(update => {
    if (!update.docChanged || !realFileSession) {
      return;
    }

    realFileSession.autosave?.request(update.state.doc.toString());
    updateRealFileStatus(realFileSession);
  }),
];

let savedSampleState: EditorState | null = null;
let savedSampleTitle = '';

type RealFileSession = {
  repository: BrowserNoteRepository;
  name: string;
  uri: URI;
  autosave: RealNoteAutosave | null;
  writeAccess: boolean;
  saveError: string | null;
  editing: boolean;
};

let realFileSession: RealFileSession | null = null;
let savingRealFile = false;
let switchingWorkspace = false;
let followingRealWikilink = false;

type ActiveRealWorkspace = {
  repository: BrowserNoteRepository;
  adapter: FoamCoreAdapter;
  graph: FoamGraph;
};

let activeRealWorkspace: ActiveRealWorkspace | null = null;

function isSavingRealFile(): boolean {
  return savingRealFile || (realFileSession?.autosave?.saving ?? false);
}

function hasUnsavedRealChanges(): boolean {
  if (!realFileSession?.editing) {
    return false;
  }

  return (
    mainEditor.state.doc.toString() !==
    realFileSession.autosave?.persistedSnapshot.content
  );
}

function renderNoteHeader(name: string, status: string): void {
  const title = document.querySelector<HTMLElement>('.panel-title');
  if (title && title.textContent !== name) title.textContent = name;
  const indicator = document.querySelector<HTMLElement>('.save-status');
  if (indicator) {
    if (indicator.textContent !== status) indicator.textContent = status;
    indicator.dataset.tone = /failed|permission/i.test(status)
      ? 'error'
      : status === 'Saved'
      ? 'success'
      : 'neutral';
  }
}

function updateRealFileStatus(session: RealFileSession): void {
  if (realFileSession !== session || !session.editing) return;
  const dirty = hasUnsavedRealChanges();
  const status = isSavingRealFile()
    ? 'Saving…'
    : session.autosave?.needsSync
    ? 'Disk saved; Core sync failed — retry Save'
    : session.saveError
    ? `Save failed: ${session.saveError}`
    : dirty
    ? 'Unsaved changes'
    : 'Saved';
  renderNoteHeader(session.name, status);
}

function reportRealFileSaveError(
  session: RealFileSession,
  error: unknown
): void {
  if (realFileSession !== session) return;
  session.saveError = error instanceof Error ? error.message : 'Save failed';
  updateRealFileStatus(session);
  window.alert(
    session.autosave?.needsSync
      ? 'The Markdown file was saved to disk, but Foam Core synchronization ' +
          'failed. Your saved file is preserved. Retry with Save.'
      : session.saveError
  );
}

// Call only from an Edit or Save click, never from an auto-save callback.
async function requestRealFileWriteAccess(
  session: RealFileSession
): Promise<boolean> {
  try {
    session.writeAccess = await session.repository.requestWriteAccess();
    if (!session.writeAccess)
      throw new Error('Write permission required. Retry with Save.');
    return true;
  } catch (error) {
    session.writeAccess = false;
    reportRealFileSaveError(session, error);
    return false;
  }
}

function resumeRealFileAutosave(session: RealFileSession | null): void {
  if (
    session &&
    realFileSession === session &&
    !openingExplorerFile &&
    !switchingWorkspace &&
    !followingRealWikilink
  )
    session.autosave?.resume();
}

const saveRealFileButton = document.createElement('button');

saveRealFileButton.type = 'button';
saveRealFileButton.textContent = 'Save Real File';
saveRealFileButton.className = 'button-primary';
saveRealFileButton.title = 'Save now or retry a failed save';
saveRealFileButton.style.display = 'none';

document.querySelector('.note-actions')?.appendChild(saveRealFileButton);

async function saveActiveRealFile(): Promise<boolean> {
  const session = realFileSession;
  const autosave = session?.autosave;
  if (!session?.editing || !autosave || savingRealFile) return false;

  autosave.request(mainEditor.state.doc.toString());
  autosave.suspend();
  const alreadySaving = autosave.saving;

  savingRealFile = true;
  saveRealFileButton.disabled = true;
  session.saveError = null;
  updateRealFileStatus(session);

  try {
    if (
      !alreadySaving &&
      autosave.dirty &&
      !(await requestRealFileWriteAccess(session))
    ) {
      return false;
    }
    if (realFileSession !== session) return false;
    await autosave.flush();
    return (
      realFileSession === session &&
      !hasUnsavedRealChanges() &&
      !autosave.needsSync
    );
  } catch {
    // The coordinator reports the failure and retains dirty/Core retry state.
    return false;
  } finally {
    savingRealFile = false;
    saveRealFileButton.disabled = false;
    updateRealFileStatus(session);
    resumeRealFileAutosave(session);
  }
}

// Save button continues to use the same logic.
saveRealFileButton.addEventListener('click', () => {
  void saveActiveRealFile();
});

function askWorkspaceSwitchDecision(
  action = 'switching workspace'
): Promise<NoteSwitchDecision> {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');

    dialog.className = 'app-dialog unsaved-dialog';
    dialog.setAttribute('aria-labelledby', 'unsaved-heading');
    dialog.setAttribute('aria-describedby', 'unsaved-message');

    const heading = document.createElement('h3');
    heading.textContent = 'Unsaved Changes';
    heading.id = 'unsaved-heading';

    const message = document.createElement('p');
    message.id = 'unsaved-message';
    message.textContent =
      'The current Markdown note has unsaved changes. ' +
      `What would you like to do before ${action}?`;

    const actions = document.createElement('div');

    actions.className = 'dialog-actions';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.textContent = 'Save';
    saveButton.className = 'button-primary';

    const discardButton = document.createElement('button');
    discardButton.type = 'button';
    discardButton.textContent = 'Discard';
    discardButton.className = 'button-destructive';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';

    let finished = false;

    function finish(decision: NoteSwitchDecision): void {
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
editRealFileButton.className = 'button-primary';
editRealFileButton.style.display = 'none';

document.querySelector('.note-actions')?.appendChild(editRealFileButton);

editRealFileButton.addEventListener('click', async () => {
  const session = realFileSession;
  const workspace = activeRealWorkspace;

  if (
    !session ||
    session.editing ||
    !workspace ||
    workspace.repository !== session.repository ||
    openingExplorerFile ||
    switchingWorkspace ||
    followingRealWikilink
  ) {
    return;
  }

  const markdown = mainEditor.state.doc.toString();

  session.editing = true;
  const { repository, name, uri } = session;
  const { adapter } = workspace;
  session.autosave = new RealNoteAutosave(markdown, {
    persist: async (snapshot, expectedContent) => {
      if (realFileSession !== session || activeRealWorkspace !== workspace) {
        throw new Error('Real-file session is no longer active');
      }
      session.saveError = null;
      updateRealFileStatus(session);
      if (!session.writeAccess) {
        throw new Error('Write permission required. Retry with Save.');
      }
      await repository.saveMarkdownNote(
        name,
        snapshot.content,
        expectedContent
      );
    },
    synchronize: snapshot => {
      if (realFileSession !== session || activeRealWorkspace !== workspace) {
        throw new Error('Real-file session is no longer active');
      }
      // FoamGraph monitors workspace.set(); never publish a newer draft here.
      adapter.updateNote(uri, snapshot.content);
      session.saveError = null;
    },
    onError: error => reportRealFileSaveError(session, error),
    onStateChange: () => updateRealFileStatus(session),
  });
  session.autosave.suspend();

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

  editRealFileButton.style.display = 'none';
  saveRealFileButton.style.display = 'inline-block';
  mainEditor.focus();
  savingRealFile = true;
  saveRealFileButton.disabled = true;
  updateRealFileStatus(session);
  try {
    await requestRealFileWriteAccess(session);
  } finally {
    savingRealFile = false;
    saveRealFileButton.disabled = false;
    updateRealFileStatus(session);
    resumeRealFileAutosave(session);
  }
});

const returnButton = document.createElement('button');
returnButton.type = 'button';
returnButton.textContent = 'Return to Sample';
returnButton.style.display = 'none';

document.querySelector('.note-actions')?.appendChild(returnButton);

function returnToSample(discardApproved = false): boolean {
  if (isSavingRealFile()) {
    window.alert('Please wait until saving finishes.');
    return false;
  }

  if (!savedSampleState) {
    return false;
  }

  if (realFileSession?.autosave?.needsSync) {
    window.alert(
      'Disk saved, Core sync failed. Retry Save before leaving this note.'
    );
    return false;
  }

  if (
    hasUnsavedRealChanges() &&
    !discardApproved &&
    !window.confirm('File has unsaved changes. Return without saving?')
  ) {
    return false;
  }

  realFileSession?.autosave?.dispose();
  mainEditor.setState(savedSampleState);
  savedSampleState = null;
  realFileSession = null;
  updateExplorerActiveFile();
  editRealFileButton.style.display = 'none';
  saveRealFileButton.style.display = 'none';

  renderNoteHeader(savedSampleTitle, 'Sample · browser storage');

  returnButton.style.display = 'none';

  console.log('[MVP Return to Sample] OK');
  return true;
}

returnButton.addEventListener('click', () => {
  if (followingRealWikilink || openingExplorerFile || switchingWorkspace)
    return;
  returnToSample();
});

// Temporary button for testing real file access.
const fileTestButton = document.createElement('button');

fileTestButton.type = 'button';
fileTestButton.textContent = 'Open Test Folder';
fileTestButton.title = 'Developer check: read Welcome.md from a test folder';
fileTestButton.setAttribute('aria-label', 'Open Test Folder (developer check)');

document.querySelector('.developer-actions')?.appendChild(fileTestButton);

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
  if (isSavingRealFile() || openingExplorerFile || switchingWorkspace) {
    window.alert('Please wait until the current file operation finishes.');
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
  followingRealWikilink = true;
  session.autosave?.suspend();
  const sourceState = mainEditor.state;

  try {
    const name = targetUri.path.slice('/real-notes/'.length);
    const latestNote = await prepareRealNoteNavigation({
      // Read an existing file before offering any data-loss decision.
      readTarget: () => workspace.repository.readMarkdownNote(name),
      isCurrent: () =>
        activeRealWorkspace === workspace &&
        realFileSession === session &&
        mainEditor.state === sourceState &&
        !isSavingRealFile() &&
        !switchingWorkspace,
      hasUnsavedChanges: hasUnsavedRealChanges,
      needsSync: () => session.autosave?.needsSync ?? false,
      askDecision: () => askWorkspaceSwitchDecision('following this Wikilink'),
    });

    if (latestNote) {
      openRealNoteInEditor(workspace.repository, latestNote, true);
    }
  } catch (error) {
    window.alert(
      error instanceof Error ? error.message : 'Failed to open Markdown file.'
    );
  } finally {
    followingRealWikilink = false;
    openingExplorerFile = false;
    resumeRealFileAutosave(session);
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
      fileElement.setAttribute('aria-label', `Open ${note.name}`);
      fileElement.dataset.noteName = note.name;

      fileElement.addEventListener('click', async () => {
        if (switchingWorkspace) {
          return;
        }
        // Avoid overlapping file-opening operations.
        if (openingExplorerFile) {
          return;
        }

        if (isSavingRealFile()) {
          window.alert('Please wait until saving finishes.');
          return;
        }

        openingExplorerFile = true;
        const sourceSession = realFileSession;
        sourceSession?.autosave?.suspend();

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
          resumeRealFileAutosave(sourceSession);
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
  selected: { name: string; content: string },
  wikilinkDecisionApproved = false
): boolean {
  if (followingRealWikilink && !wikilinkDecisionApproved) return false;
  if (switchingWorkspace || activeRealWorkspace?.repository !== repository)
    return false;
  // Prevent switching notes while saving.
  if (isSavingRealFile()) {
    window.alert('Please wait until saving finishes.');
    return false;
  }

  if (realFileSession?.autosave?.needsSync) {
    window.alert(
      'Disk saved, Core sync failed. Retry Save before leaving this note.'
    );
    return false;
  }

  // Protect unsaved changes.
  if (
    hasUnsavedRealChanges() &&
    !wikilinkDecisionApproved &&
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

  realFileSession?.autosave?.dispose();
  mainEditor.setState(previewState);

  realFileSession = {
    repository,
    name: selected.name,
    uri: realNoteUri,
    autosave: null,
    writeAccess: false,
    saveError: null,
    editing: false,
  };
  updateExplorerActiveFile();

  editRealFileButton.style.display = 'inline-block';
  saveRealFileButton.style.display = 'none';
  returnButton.style.display = 'inline-block';

  renderNoteHeader(selected.name, 'Read only · choose Edit Real File to edit');

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
listNotesButton.title = 'Choose a folder and browse its Markdown notes';

document.querySelector('.workspace-actions')?.appendChild(listNotesButton);

listNotesButton.addEventListener('click', async () => {
  // Prevent changing workspace while saving.
  if (isSavingRealFile()) {
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
  const sourceSession = realFileSession;
  sourceSession?.autosave?.suspend();

  try {
    const repository = await BrowserNoteRepository.pick();

    if (!repository) {
      console.log('[MVP Note List] Cancelled');
      return;
    }

    let notes = await repository.listMarkdownNotes();

    // Ensure no other file operation is in progress.
    if (isSavingRealFile() || openingExplorerFile) {
      window.alert('Please wait for the current operation to finish.');
      return;
    }

    let decision: NoteSwitchDecision = 'save';

    // Only prompt after the new folder has been selected
    // and read successfully.
    if (
      realFileSession &&
      (hasUnsavedRealChanges() || realFileSession.autosave?.needsSync)
    ) {
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

    if (realFileSession?.autosave?.needsSync) {
      window.alert(
        'Disk saved, Core sync failed. Retry Save before leaving this note.'
      );
      return;
    }
    const sourceState = mainEditor.state;
    const sourceSnapshot = sourceSession?.autosave?.persistedSnapshot;

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

    if (
      realFileSession !== sourceSession ||
      mainEditor.state !== sourceState ||
      sourceSession?.autosave?.persistedSnapshot !== sourceSnapshot
    ) {
      nextRealFoamGraph.dispose();
      nextRealFoamAdapter.workspace.dispose();
      window.alert(
        'The current note changed. Workspace switching was cancelled.'
      );
      return;
    }

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
      if (!returnToSample(decision === 'discard')) {
        nextRealFoamGraph.dispose();
        nextRealFoamAdapter.workspace.dispose();
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

    dialog.className = 'app-dialog note-picker';
    dialog.setAttribute('aria-labelledby', 'note-picker-heading');

    const heading = document.createElement('h3');
    heading.textContent = `Markdown files - ${repository.folderName}`;
    heading.id = 'note-picker-heading';

    const select = document.createElement('select');

    select.setAttribute('aria-label', 'Markdown file');

    for (const note of notes) {
      const option = document.createElement('option');
      option.value = note.name;
      option.textContent = note.name;
      select.appendChild(option);
    }

    const preview = document.createElement('textarea');

    preview.readOnly = true;
    preview.rows = 15;

    preview.setAttribute('aria-label', 'Selected Markdown file preview');

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

    closeButton.addEventListener('click', () => {
      dialog.close();
    });

    const openInEditorButton = document.createElement('button');
    openInEditorButton.type = 'button';
    openInEditorButton.textContent = 'Open in CodeMirror';
    openInEditorButton.className = 'button-primary picker-open';

    openInEditorButton.addEventListener('click', () => {
      if (openingExplorerFile || switchingWorkspace) return;
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
    resumeRealFileAutosave(sourceSession);
  }
});

window.addEventListener('beforeunload', event => {
  if (
    isSavingRealFile() ||
    hasUnsavedRealChanges() ||
    realFileSession?.autosave?.needsSync
  ) {
    event.preventDefault();
    event.returnValue = '';
  }
});
