import type { ResourceLink } from '@foam/core';
import { EditorView } from '@codemirror/view';
import {
  getFoamCoreAdapter,
  getActiveNoteUri,
  openFoamNote,
} from './foam-editor-sync';

/**
 * Find a Foam ResourceLink at a CodeMirror document position.
 *
 * Foam uses zero-based line and character positions.
 * CodeMirror uses absolute document offsets.
 */
function findLinkAtPosition(
  view: EditorView,
  position: number,
  links: ResourceLink[]
): ResourceLink | null {
  const doc = view.state.doc;

  for (const link of links) {
    const { start, end } = link.range;

    if (
      start.line < 0 ||
      end.line < 0 ||
      start.line >= doc.lines ||
      end.line >= doc.lines
    ) {
      continue;
    }

    const from = doc.line(start.line + 1).from + start.character;

    const to = doc.line(end.line + 1).from + end.character;

    if (position >= from && position < to) {
      return link;
    }
  }

  return null;
}

/**
 * Check whether a document position belongs to
 * an internal link that can currently be opened.
 */
export function isNavigableInternalLinkAt(
  view: EditorView,
  position: number
): boolean {
  const adapter = getFoamCoreAdapter(view);
  const sourceUri = getActiveNoteUri(view);

  if (!adapter || !sourceUri) {
    return false;
  }

  const source = adapter.getNote(sourceUri);

  if (!source) {
    return false;
  }

  const link = findLinkAtPosition(view, position, source.links);

  if (!link || (link.type !== 'wikilink' && link.type !== 'link')) {
    return false;
  }

  // Use Foam Core's resolver rather than parsing paths ourselves.
  const targetUri = adapter.resolveLink(source, link);

  // Fragment navigation is not implemented yet.
  if (targetUri.fragment) {
    return false;
  }

  // Only show a pointer when clicking can open a note.
  return adapter.getNote(targetUri) !== null;
}

/**
 * Detect Ctrl+Click / Cmd+Click on internal Foam links.
 *
 * Navigation is intentionally not performed yet.
 * This step only verifies Foam's link resolution.
 */
export const internalLinkNavigation = EditorView.domEventHandlers({
  click(event, view) {
    if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) {
      return false;
    }

    if (
      !(event.target instanceof Node) ||
      !view.contentDOM.contains(event.target)
    ) {
      return false;
    }

    const adapter = getFoamCoreAdapter(view);

    if (!adapter) {
      return false;
    }

    // Current note in the PoC.
    const sourceUri = getActiveNoteUri(view);

    if (!sourceUri) {
      return false;
    }

    const source = adapter.getNote(sourceUri);

    if (!source) {
      return false;
    }

    const position = view.posAtCoords({
      x: event.clientX,
      y: event.clientY,
    });

    if (position === null) {
      return false;
    }

    const link = findLinkAtPosition(view, position, source.links);

    if (!link) {
      return false;
    }

    // Handle only Wikilinks and internal Markdown Links.
    if (link.type !== 'wikilink' && link.type !== 'link') {
      return false;
    }

    // Use the existing Foam resolver.
    const targetUri = adapter.resolveLink(source, link);
    const target = targetUri.toString();

    // The PoC currently uses file URIs and placeholder URIs.
    // External URLs remain handled by externalLinkNavigation.
    if (!target.startsWith('file:') && !target.startsWith('placeholder:')) {
      return false;
    }

    const exists = adapter.getNote(targetUri) !== null;

    console.log('[Foam Internal Link Click]', {
      source: source.uri.toString(),
      link: link.rawText,
      type: link.type,
      target,
      exists,
    });

    event.preventDefault();

    // Do not open a note that does not exist.
    if (!exists) {
      console.warn('[Foam Navigation] Note does not exist:', target);
      return true;
    }

    // Section and block navigation will be added later.
    if (targetUri.fragment) {
      console.warn(
        '[Foam Navigation] Fragment navigation is not ready:',
        target
      );
      return true;
    }

    // Open the target note using the existing editor sync plugin.
    const opened = openFoamNote(view, targetUri);

    if (!opened) {
      console.warn('[Foam Navigation] Could not open note:', target);
    }

    return true;
  },
});
