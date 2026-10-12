import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

/**
 * Check whether the cursor or selection
 * overlaps a Markdown link.
 */
function isMarkdownLinkActive(
  view: EditorView,
  from: number,
  to: number
): boolean {
  return view.state.selection.ranges.some(selection => {
    if (selection.empty) {
      return selection.head >= from && selection.head <= to;
    }

    return selection.from < to && selection.to > from;
  });
}

/**
 * Display only the label of an inline Markdown link.
 *
 * [Google](https://google.com) -> Google
 * [NodeJS](./NodeJS.md)       -> NodeJS
 */
function buildMarkdownLinkDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'Link') {
          return;
        }

        // Only process inline links with a URL.
        // Wikilinks parsed as Link do not have a URL child.
        const urlNode = node.node.getChild('URL');

        if (!urlNode) {
          return;
        }

        const raw = view.state.sliceDoc(node.from, node.to);

        // Do not replace syntax across multiple lines.
        if (raw.includes('\n')) {
          return;
        }

        const marks = node.node.getChildren('LinkMark');

        const openingBracket = marks.find(
          mark =>
            mark.from === node.from &&
            view.state.sliceDoc(mark.from, mark.to) === '['
        );

        const closingBracket = marks.find(
          mark =>
            mark.from > node.from &&
            mark.from < urlNode.from &&
            view.state.sliceDoc(mark.from, mark.to) === ']'
        );

        if (
          !openingBracket ||
          !closingBracket ||
          openingBracket.to >= closingBracket.from
        ) {
          return;
        }

        // Keep the source visible when editing the link.
        if (isMarkdownLinkActive(view, node.from, node.to)) {
          return;
        }

        // Hide opening "[".
        ranges.push(
          Decoration.replace({}).range(openingBracket.from, openingBracket.to)
        );

        // Hide "](destination)".
        ranges.push(Decoration.replace({}).range(closingBracket.from, node.to));
      },
    });
  }

  return Decoration.set(ranges, true);
}

/**
 * CodeMirror 6 Markdown Link Live Preview.
 */
export const markdownLinkLivePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildMarkdownLinkDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildMarkdownLinkDecorations(update.view);
      }
    }
  },
  {
    decorations: plugin => plugin.decorations,
  }
);
