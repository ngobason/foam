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
- Check whether the cursor or selection touches
- an inline code element.
  */
function isInlineCodeActive(
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
- Hide inline code delimiters while preserving
- the original Markdown source.
  */
function buildInlineCodeDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'CodeMark') {
          return;
        }
        const parent = node.node.parent;
        // Fenced code blocks also use CodeMark.
        // Only process inline code.
        if (!parent || parent.name !== 'InlineCode') {
          return;
        }
        if (isInlineCodeActive(view, parent.from, parent.to)) {
          return;
        }
        ranges.push(Decoration.replace({}).range(node.from, node.to));
      },
    });
  }
  return Decoration.set(ranges, true);
}
/**
 * CodeMirror 6 Inline Code Live Preview.
 */
export const inlineCodeLivePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildInlineCodeDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildInlineCodeDecorations(update.view);
      }
    }
  },
  {
    decorations: plugin => plugin.decorations,
  }
);
