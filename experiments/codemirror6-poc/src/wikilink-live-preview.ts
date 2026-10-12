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
 * overlaps a Wikilink.
 */
function isWikilinkActive(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some(selection => {
    if (selection.empty) {
      return selection.head >= from && selection.head <= to;
    }

    return selection.from < to && selection.to > from;
  });
}

/**
 * Hide Wikilink syntax while preserving
 * its original Markdown source.
 *
 * [[NodeJS]]         -> NodeJS
 * [[NodeJS|Node.js]] -> Node.js
 */
function buildWikilinkDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'Link') {
          return;
        }

        // CodeMirror recognizes the inner [Target]
        // of [[Target]] as a Link node.
        const wikilinkStart = node.from - 1;
        const wikilinkEnd = node.to + 1;

        if (wikilinkStart < 0 || wikilinkEnd > view.state.doc.length) {
          return;
        }

        const raw = view.state.sliceDoc(wikilinkStart, wikilinkEnd);

        // Only process complete Wikilinks.
        if (
          raw.length <= 4 ||
          !raw.startsWith('[[') ||
          !raw.endsWith(']]') ||
          raw.includes('\n')
        ) {
          return;
        }

        // Reuse the alias rule from Foam's parser:
        // [[Target|Alias]] displays only Alias.
        const separatorIndex = raw.indexOf('|', 2);

        const visibleStart =
          separatorIndex >= 0
            ? wikilinkStart + separatorIndex + 1
            : wikilinkStart + 2;

        const visibleEnd = wikilinkEnd - 2;

        if (visibleStart >= visibleEnd) {
          return;
        }

        // Show full Markdown while editing the Wikilink.
        if (isWikilinkActive(view, wikilinkStart, wikilinkEnd)) {
          return;
        }

        // Hide [[ or [[Target|.
        ranges.push(Decoration.replace({}).range(wikilinkStart, visibleStart));

        // Hide the closing ]].
        ranges.push(Decoration.replace({}).range(visibleEnd, wikilinkEnd));
      },
    });
  }

  return Decoration.set(ranges, true);
}

/**
 * CodeMirror 6 Wikilink Live Preview.
 */
export const wikilinkLivePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildWikilinkDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildWikilinkDecorations(update.view);
      }
    }
  },
  {
    decorations: plugin => plugin.decorations,
  }
);
