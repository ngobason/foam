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
 * Interactive checkbox displayed instead of
 * the original Markdown task marker.
 */
class TaskCheckboxWidget extends WidgetType {
  readonly markerFrom: number;
  readonly checked: boolean;

  constructor(markerFrom: number, checked: boolean) {
    super();

    this.markerFrom = markerFrom;
    this.checked = checked;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof TaskCheckboxWidget &&
      other.markerFrom === this.markerFrom &&
      other.checked === this.checked
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement('input');

    checkbox.type = 'checkbox';
    checkbox.className = 'cm-task-checkbox';
    checkbox.checked = this.checked;

    checkbox.setAttribute(
      'aria-label',
      this.checked ? 'Mark task as incomplete' : 'Mark task as complete'
    );

    checkbox.addEventListener('change', () => {
      // Check that the Markdown source still contains
      // a valid task marker at this position.
      const source = view.state.sliceDoc(this.markerFrom, this.markerFrom + 3);

      if (!/^\[[ xX]\]$/.test(source)) {
        return;
      }

      // Update only the character inside [ ] or [x].
      // The actual Markdown source is changed,
      // so Undo/Redo and LocalStorage continue to work.
      view.dispatch({
        changes: {
          from: this.markerFrom + 1,
          to: this.markerFrom + 2,
          insert: checkbox.checked ? 'x' : ' ',
        },
      });
    });

    return checkbox;
  }

  ignoreEvent(): boolean {
    // Allow native checkbox interaction without
    // CodeMirror treating it as a text-editing click.
    return true;
  }
}

/**
 * Find task markers using the Markdown syntax tree.
 */
function buildTaskDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'TaskMarker') {
          return;
        }

        const source = view.state.sliceDoc(node.from, node.to);

        if (!/^\[[ xX]\]$/.test(source)) {
          return;
        }

        const line = view.state.doc.lineAt(node.from);

        // The text preceding [ ] or [x]
        // should be a Markdown list marker.
        const prefix = view.state.sliceDoc(line.from, node.from);

        const match = /^([ \t]*)([-+*]|\d+[.)])([ \t]+)$/.exec(prefix);

        if (!match) {
          return;
        }

        // Preserve indentation for nested task lists.
        const listMarkerFrom = line.from + match[1].length;

        const checked = /[xX]/.test(source);

        // Replace "- [ ]" or "- [x]" with one
        // interactive checkbox. The following space remains.
        ranges.push(
          Decoration.replace({
            widget: new TaskCheckboxWidget(node.from, checked),
          }).range(listMarkerFrom, node.to)
        );
      },
    });
  }

  return Decoration.set(ranges, true);
}

/**
 * CodeMirror 6 interactive Task List extension.
 */
export const taskLivePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildTaskDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildTaskDecorations(update.view);
      }
    }
  },
  {
    decorations: plugin => plugin.decorations,
  }
);
