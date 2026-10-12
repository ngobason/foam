import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

/**
 * Widget representing an unordered-list bullet.
 */
class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const bullet = document.createElement('span');
    bullet.className = 'cm-live-bullet';
    bullet.textContent = '•';
    return bullet;
  }

  eq(other: WidgetType): boolean {
    return other instanceof BulletWidget;
  }
}

/**
 * Replace unordered-list syntax markers with bullets.
 */
function buildListDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'ListMark') {
          return;
        }

        const source = view.state.sliceDoc(node.from, node.to);

        // Only unordered lists: -, + and *.
        if (!/^[-+*][ \t]*$/.test(source)) {
          return;
        }

        const line = view.state.doc.lineAt(node.from);
        const remainder = view.state.sliceDoc(node.to, line.to);

        // Task Lists will have their own checkbox widget.
        if (/^\s*\[[ xX]\](?:\s|$)/.test(remainder)) {
          return;
        }

        // Reveal the original marker when editing the marker itself.
        const markerActive = view.state.selection.ranges.some(selection => {
          if (selection.empty) {
            return selection.head >= node.from && selection.head <= node.to;
          }

          return selection.from < node.to && selection.to > node.from;
        });

        if (markerActive) {
          return;
        }

        ranges.push(
          Decoration.replace({
            widget: new BulletWidget(),
          }).range(node.from, node.to)
        );
      },
    });
  }

  return Decoration.set(ranges, true);
}

/**
 * CodeMirror 6 List Live Preview.
 */
export const listLivePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildListDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildListDecorations(update.view);
      }
    }
  },
  {
    decorations: plugin => plugin.decorations,
  }
);
