import type { ResourceLink, URI } from '@foam/core';
import { Facet } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { FoamCoreAdapter } from './foam-core-adapter';
import { noteUriFacet } from './note-context';
import {
  getFoamCoreAdapter,
  getActiveNoteUri,
  openFoamNote,
} from './foam-editor-sync';

type RealLinkNavigationContext = {
  adapter: FoamCoreAdapter | null;
  canNavigate(): boolean;
  openNote(uri: URI): void;
};

// Presence of this context selects real-file mode, even when its adapter is absent.
export const realLinkNavigationContext = Facet.define<
  RealLinkNavigationContext,
  RealLinkNavigationContext | null
>({ combine: values => values[0] ?? null });

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
  const realContext = view.state.facet(realLinkNavigationContext);
  const adapter = realContext ? realContext.adapter : getFoamCoreAdapter(view);
  const sourceUri = realContext
    ? view.state.facet(noteUriFacet)
    : getActiveNoteUri(view);

  if (!adapter || !sourceUri) {
    return false;
  }

  const source = adapter.getNote(sourceUri);

  if (!source) {
    return false;
  }

  const link = findLinkAtPosition(view, position, source.links);

  if (
    !link ||
    (link.type !== 'wikilink' && (realContext || link.type !== 'link'))
  ) {
    return false;
  }

  // Use Foam Core's resolver rather than parsing paths ourselves.
  const targetUri = adapter.resolveLink(source, link);

  // Fragment navigation is not implemented yet.
  if (targetUri.fragment) {
    return false;
  }

  // Only show a pointer when clicking can open a note.
  return adapter.getNote(targetUri)?.type === 'note';
}

/**
 * Detect Ctrl+Click / Cmd+Click on internal Foam links.
 */
export function handleInternalLinkClick(
  event: MouseEvent,
  view: EditorView
): boolean {
  if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) {
    return false;
  }

  if (
    !(event.target instanceof Node) ||
    !view.contentDOM.contains(event.target)
  ) {
    return false;
  }

  const realContext = view.state.facet(realLinkNavigationContext);

  // Do not use persisted link positions while the real document is dirty.
  if (realContext && !realContext.canNavigate()) {
    event.preventDefault();
    return true;
  }

  const adapter = realContext ? realContext.adapter : getFoamCoreAdapter(view);

  if (!adapter) {
    return false;
  }

  // Current note in the PoC.
  const sourceUri = realContext
    ? view.state.facet(noteUriFacet)
    : getActiveNoteUri(view);

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
  if (link.type !== 'wikilink' && (realContext || link.type !== 'link')) {
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

  const exists = adapter.getNote(targetUri)?.type === 'note';

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
    console.warn('[Foam Navigation] Fragment navigation is not ready:', target);
    return true;
  }

  if (realContext) {
    realContext.openNote(targetUri);
    return true;
  }

  // Sample mode keeps its existing editor sync plugin.
  const opened = openFoamNote(view, targetUri);

  if (!opened) {
    console.warn('[Foam Navigation] Could not open note:', target);
  }

  return true;
}

export const internalLinkNavigation = EditorView.domEventHandlers({
  click: handleInternalLinkClick,
});
