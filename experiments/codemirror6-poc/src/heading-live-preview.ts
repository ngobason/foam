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
 * Hide Markdown heading markers when the cursor
 * is outside the heading line.
 */
function buildHeadingDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        // Only process ATX heading markers.
        if (
          node.name !== 'HeaderMark' ||
          !node.node.parent?.type.name.startsWith('ATXHeading')
        ) {
          return;
        }

        const line = view.state.doc.lineAt(node.from);
        const beforeMarker = view.state.sliceDoc(line.from, node.from);
        const markerText = view.state.sliceDoc(node.from, node.to);

        // Only hide opening # markers, not closing ones.
        if (!/^ {0,3}$/.test(beforeMarker) || !/^#{1,6}$/.test(markerText)) {
          return;
        }

        // Keep syntax visible when the heading is active.
        const isActive = view.state.selection.ranges.some(selection => {
          if (selection.empty) {
            return selection.head >= line.from && selection.head <= line.to;
          }

          return selection.from <= line.to && selection.to >= line.from;
        });

        if (isActive) {
          return;
        }

        // Also hide one space after the # marker.
        const hasSpace = view.state.sliceDoc(node.to, node.to + 1) === ' ';

        ranges.push(
          Decoration.replace({}).range(node.from, node.to + (hasSpace ? 1 : 0))
        );
      },
    });
  }

  return Decoration.set(ranges, true);
}

/**
 * CodeMirror 6 extension for Heading Live Preview.
 */
export const headingLivePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildHeadingDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildHeadingDecorations(update.view);
      }
    }
  },
  {
    decorations: plugin => plugin.decorations,
  }
);
