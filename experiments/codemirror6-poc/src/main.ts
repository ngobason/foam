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
  wikilinkLivePreview,
  wikilinkCaret,
  markdownLinkLivePreview,

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

// Every note uses the same extensions,
// but receives its own independent EditorState.
function createNoteState(markdownText: string): EditorState {
  return EditorState.create({
    doc: markdownText,
    extensions: editorExtensions,
  });
}

// Register the factory before creating the editor.
registerNoteStateFactory(createNoteState);

// Create the initial Welcome.md editor.
new EditorView({
  state: createNoteState(savedMarkdown ?? initialMarkdown),
  parent: editorContainer,
});
