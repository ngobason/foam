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
 * Check whether cursor or selection touches
 * a Markdown formatting element.
 */
function isFormattingActive(
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
 * Hide Bold/Italic syntax markers outside
 * the currently edited Markdown element.
 */
function buildInlineDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        // Markdown delimiters such as *, **, _ and __.
        if (node.name !== 'EmphasisMark') {
          return;
        }

        const parent = node.node.parent;

        if (
          !parent ||
          (parent.name !== 'Emphasis' && parent.name !== 'StrongEmphasis')
        ) {
          return;
        }

        // Reveal the markers when editing this element.
        if (isFormattingActive(view, parent.from, parent.to)) {
          return;
        }

        // Hide only syntax markers, not the content.
        ranges.push(Decoration.replace({}).range(node.from, node.to));
      },
    });
  }

  return Decoration.set(ranges, true);
}

/**
 * CodeMirror 6 Bold/Italic Live Preview.
 */
export const inlineLivePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildInlineDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildInlineDecorations(update.view);
      }
    }
  },
  {
    decorations: plugin => plugin.decorations,
  }
);
