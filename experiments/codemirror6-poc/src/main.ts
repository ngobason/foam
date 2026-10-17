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
import { internalLinkNavigation } from './internal-link-navigation';
import { getActiveNoteUri } from './foam-editor-sync';
import { noteSwitchAnnotation } from './foam-editor-sync';
import { WELCOME_URI, readStoredNote, writeStoredNote } from './note-storage';
import { EditorState, type Extension } from '@codemirror/state';
import { registerNoteStateFactory } from './foam-editor-sync';
import { wikilinkCaret } from './wikilink-caret';
import { blockquoteLivePreview } from './blockquote-live-preview';
import { imageLivePreview } from './image-live-preview';
import { URI } from '@foam/core';
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

saveRealFileButton.addEventListener('click', async () => {
  const session = realFileSession;

  if (!session || !session.editing || savingRealFile) {
    return;
  }

  // Capture exactly the content being saved.
  const markdownToSave = mainEditor.state.doc.toString();

  if (markdownToSave === session.originalContent) {
    console.log('[MVP Real File Save] No changes');
    return;
  }

  savingRealFile = true;
  saveRealFileButton.disabled = true;

  try {
    // Request permission from the user's Save click.
    const granted = await session.repository.requestWriteAccess();

    if (!granted) {
      window.alert('Write permission was not granted. File was not saved.');
      return;
    }

    // Save only if the file on disk still matches
    // the original content we loaded.
    await session.repository.saveMarkdownNote(
      session.name,
      markdownToSave,
      session.originalContent
    );

    // Update the baseline only after a successful save.
    session.originalContent = markdownToSave;

    // Editing may have continued while the save was running.
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
      stillDirty,
    });
  } catch (error) {
    console.error('[MVP Real File Save] Failed:', error);

    window.alert(
      error instanceof Error ? error.message : 'Failed to save Markdown file.'
    );
  } finally {
    savingRealFile = false;
    saveRealFileButton.disabled = false;
  }
});

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
      extensions: [...realFileEditExtensions, noteUriFacet.of(session.uri)],
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
    !window.confirm('File has unsaved changes. Return without saving?')
  ) {
    return;
  }

  mainEditor.setState(savedSampleState);
  savedSampleState = null;
  realFileSession = null;
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

// Temporary button to test reading multiple Markdown notes.
const listNotesButton = document.createElement('button');

listNotesButton.type = 'button';
listNotesButton.textContent = 'List Markdown Notes';

document.querySelector('.topbar')?.appendChild(listNotesButton);

listNotesButton.addEventListener('click', async () => {
  try {
    const repository = await BrowserNoteRepository.pick();

    if (!repository) {
      console.log('[MVP Note List] Cancelled');
      return;
    }

    const notes = await repository.listMarkdownNotes();

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

    // Build an isolated Foam Workspace from disk notes.
    const realWorkspace = await FoamCoreAdapter.createFromMarkdownFiles(notes);

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
      if (savingRealFile) {
        window.alert('Please wait until saving finishes.');
        return;
      }

      const selected = notes.find(note => note.name === select.value);

      if (!selected) {
        return;
      }

      if (
        hasUnsavedRealChanges() &&
        !window.confirm('File has unsaved changes. Discard changes?')
      ) {
        return;
      }

      const title = document.querySelector<HTMLElement>('.panel-title');

      // Preserve the original EditorState only once.
      if (!savedSampleState) {
        savedSampleState = mainEditor.state;
        savedSampleTitle = title?.textContent ?? 'Welcome.md';
      }

      const realNoteUri = URI.file('/real-notes').joinPath(selected.name);

      const previewState = EditorState.create({
        doc: selected.content,
        extensions: [
          ...realFilePreviewExtensions,
          noteUriFacet.of(realNoteUri),
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

      editRealFileButton.style.display = 'inline-block';
      saveRealFileButton.style.display = 'none';
      if (title) {
        title.textContent = `${selected.name} (Read Only)`;
      }

      returnButton.style.display = 'inline-block';

      dialog.close();

      console.log('[MVP Real Note Opened]', {
        file: selected.name,
        uri: realNoteUri.toString(),
        characters: selected.content.length,
        readOnly: true,
      });
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
  }
});

window.addEventListener('beforeunload', event => {
  if (savingRealFile || hasUnsavedRealChanges()) {
    event.preventDefault();
    event.returnValue = '';
  }
});
