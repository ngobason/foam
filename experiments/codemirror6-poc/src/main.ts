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

// Key used to save the Markdown document in the browser.
const STORAGE_KEY = 'foam-editor-poc-content';

// Restore previously saved content.
const savedMarkdown = localStorage.getItem(STORAGE_KEY);

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

// Create CodeMirror 6 editor.
new EditorView({
  doc: savedMarkdown ?? initialMarkdown,

  extensions: [
    basicSetup,
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(headingStyle),
    EditorView.lineWrapping,
    headingLivePreview,
    inlineLivePreview,
    inlineCodeLivePreview,
    listLivePreview,
    taskLivePreview,

    // Automatically save whenever the document changes.
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        localStorage.setItem(STORAGE_KEY, update.state.doc.toString());
      }
    }),
  ],

  parent: editorContainer,
});
