import { Annotation, EditorState } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { URI } from '@foam/core';

import { FoamCoreAdapter } from './foam-core-adapter';
import { WELCOME_URI, readStoredNote, writeStoredNote } from './note-storage';

// Retained for compatibility with the existing storage listener.
// setState() does not create a document-change transaction.
export const noteSwitchAnnotation = Annotation.define<boolean>();

// Shared session data must survive ViewPlugin recreation.
let adapter: FoamCoreAdapter | null = null;
let initialization: Promise<void> | null = null;
let currentView: EditorView | null = null;

let activeNoteUri: URI = WELCOME_URI;
let lastLinksSnapshot = '';

// Each note keeps its own document, selection and Undo/Redo history.
const noteStates = new Map<string, EditorState>();

type NoteStateFactory = (markdown: string, uri: URI) => EditorState;

let noteStateFactory: NoteStateFactory | null = null;

/**
 * Register the editor configuration used when opening a note
 * for the first time.
 */
export function registerNoteStateFactory(factory: NoteStateFactory): void {
  noteStateFactory = factory;
}

/**
 * Synchronize the active CodeMirror document with Foam Core.
 */
function syncWorkspace(view: EditorView): void {
  if (!adapter) {
    return;
  }

  const markdown = view.state.doc.toString();

  const note = adapter.updateNote(activeNoteUri, markdown);

  const links = note.links.map(link => {
    const target = adapter!.resolveLink(note, link);

    return {
      link: link.rawText,
      type: link.type,
      target: target.toString(),
      exists: adapter!.getNote(target) !== null,
    };
  });

  const snapshot = JSON.stringify(links);

  if (snapshot !== lastLinksSnapshot) {
    lastLinksSnapshot = snapshot;

    console.log('[Foam Editor Sync]', {
      activeUri: activeNoteUri.toString(),
      uri: note.uri.toString(),
      linkCount: links.length,
    });

    console.table(links);
  }
}

/**
 * View plugin only observes document changes.
 * It does not own the Foam Workspace or active note.
 */
class FoamEditorSyncPlugin {
  constructor(view: EditorView) {
    currentView = view;

    // Initialize Foam Core only once.
    if (!initialization) {
      initialization = FoamCoreAdapter.createWithSampleNotes()
        .then(createdAdapter => {
          adapter = createdAdapter;

          if (currentView) {
            syncWorkspace(currentView);
          }
        })
        .catch(error => {
          console.error('[Foam Editor Sync] Initialization failed', error);

          initialization = null;
        });
    }
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) {
      syncWorkspace(update.view);
    }
  }
}

export const foamEditorSync = ViewPlugin.fromClass(FoamEditorSyncPlugin);

export function getFoamCoreAdapter(view: EditorView): FoamCoreAdapter | null {
  return view.plugin(foamEditorSync) ? adapter : null;
}

export function getActiveNoteUri(view: EditorView): URI | null {
  return view.plugin(foamEditorSync) ? activeNoteUri : null;
}

/**
 * Switch notes without mixing CodeMirror Undo/Redo histories.
 */
export function openFoamNote(view: EditorView, targetUri: URI): boolean {
  const foam = getFoamCoreAdapter(view);

  if (!foam || !noteStateFactory) {
    console.warn('[Foam Note] Editor is not ready');
    return false;
  }

  if (targetUri.fragment) {
    console.warn('[Foam Note] Fragment navigation is not ready');
    return false;
  }

  const targetKey = targetUri.toString();

  if (targetKey === activeNoteUri.toString()) {
    return true;
  }

  // Reuse the previous EditorState if this note was opened before.
  const cachedState = noteStates.get(targetKey);

  const targetMarkdown = readStoredNote(targetUri) ?? foam.readNote(targetUri);

  if (!cachedState && targetMarkdown === null) {
    console.warn('[Foam Note] Target does not exist:', targetKey);
    return false;
  }

  const targetState =
    cachedState ?? noteStateFactory(targetMarkdown ?? '', targetUri);

  const previousUri = activeNoteUri;
  const previousState = view.state;
  const previousMarkdown = previousState.doc.toString();

  try {
    // Save the current note before leaving it.
    foam.updateNote(previousUri, previousMarkdown);
    writeStoredNote(previousUri, previousMarkdown);

    // Cache the ENTIRE state, including Undo/Redo history.
    noteStates.set(previousUri.toString(), previousState);

    // Keep Foam Workspace synchronized with the target note.
    foam.updateNote(targetUri, targetState.doc.toString());

    activeNoteUri = targetUri;
    lastLinksSnapshot = '';

    // Switch the entire EditorState, not the document text.
    view.setState(targetState);
  } catch (error) {
    activeNoteUri = previousUri;

    console.error('[Foam Note] Switch failed', error);
    return false;
  }

  // setState() does not trigger a docChanged update.
  syncWorkspace(view);

  const title = document.querySelector<HTMLElement>('.panel-title');

  if (title) {
    title.textContent = targetUri.path.split('/').pop() ?? targetUri.toString();
  }

  console.log('[Foam Note Opened]', {
    previous: previousUri.toString(),
    current: targetUri.toString(),
  });

  return true;
}
