import { syntaxTree } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * Find the end of a collapsed Wikilink when clicking
 * immediately after its visible label.
 */
function findCollapsedWikilinkEnd(
  view: EditorView,
  position: number
): number | null {
  const docLength = view.state.doc.length;
  let result: number | null = null;

  syntaxTree(view.state).iterate({
    from: Math.max(0, position - 3),
    to: Math.min(docLength, position + 1),

    enter(node) {
      if (node.name !== 'Link') {
        return;
      }

      const wikilinkStart = node.from - 1;
      const wikilinkEnd = node.to + 1;

      if (wikilinkStart < 0 || wikilinkEnd > docLength) {
        return;
      }

      const raw = view.state.sliceDoc(wikilinkStart, wikilinkEnd);

      if (
        raw.length <= 4 ||
        !raw.startsWith('[[') ||
        !raw.endsWith(']]') ||
        raw.includes('\n')
      ) {
        return;
      }

      const visibleEnd = wikilinkEnd - 2;

      // Only handle the end of the displayed label
      // or the hidden closing brackets.
      if (position < visibleEnd || position > wikilinkEnd) {
        return;
      }

      // Do not interfere when the Wikilink is already
      // expanded for editing.
      const isActive = view.state.selection.ranges.some(selection =>
        selection.empty
          ? selection.head >= wikilinkStart && selection.head <= wikilinkEnd
          : selection.from < wikilinkEnd && selection.to > wikilinkStart
      );

      if (isActive) {
        return;
      }

      result = wikilinkEnd;
    },
  });

  return result;
}

/**
 * Place the cursor after ]] during mouse selection,
 * instead of correcting it after the click.
 */
export const wikilinkCaret = EditorView.mouseSelectionStyle.of(
  (view, event) => {
    // Leave modified clicks, double-clicks and
    // non-primary mouse buttons to CodeMirror.
    if (
      event.button !== 0 ||
      event.detail !== 1 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return null;
    }

    const position = view.posAtCoords({
      x: event.clientX,
      y: event.clientY,
    });

    if (position === null) {
      return null;
    }

    const wikilinkEnd = findCollapsedWikilinkEnd(view, position);

    if (wikilinkEnd === null) {
      return null;
    }

    let anchor = wikilinkEnd;
    let originalSelection = view.state.selection;

    const startX = event.clientX;
    const startY = event.clientY;

    return {
      get(currentEvent, extend, multiple) {
        const distance = Math.hypot(
          currentEvent.clientX - startX,
          currentEvent.clientY - startY
        );

        let range;

        if (distance < 4) {
          // Plain click: immediately place cursor after ]].
          range = EditorSelection.cursor(anchor, 1);
        } else {
          // Allow drag selection from this position.
          const currentPosition = view.posAtCoords({
            x: currentEvent.clientX,
            y: currentEvent.clientY,
          });

          range = EditorSelection.range(anchor, currentPosition ?? anchor);
        }

        if (extend) {
          return originalSelection.replaceRange(
            originalSelection.main.extend(range.from, range.to, range.assoc)
          );
        }

        if (multiple) {
          return originalSelection.addRange(range);
        }

        return EditorSelection.create([range]);
      },

      update(update) {
        if (update.docChanged) {
          anchor = update.changes.mapPos(anchor, 1);
          originalSelection = originalSelection.map(update.changes);
        }
      },
    };
  }
);
