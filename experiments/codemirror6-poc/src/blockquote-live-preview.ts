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
 * is currently inside a given line.
 */
function isLineActive(
  view: EditorView,
  lineFrom: number,
  lineTo: number
): boolean {
  return view.state.selection.ranges.some(selection => {
    if (selection.empty) {
      return selection.head >= lineFrom && selection.head <= lineTo;
    }

    return selection.from <= lineTo && selection.to >= lineFrom;
  });
}

/**
 * Build Blockquote Live Preview decorations.
 */

function buildBlockquoteDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const doc = view.state.doc;

  // Store the end of quote syntax on each line.
  const quotePrefixEnds = new Map<number, number>();

  // Number of quote markers on each line.
  const quoteDepths = new Map<number, number>();

  // Avoid processing the same QuoteMark twice.
  const processedMarks = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,

      enter(node) {
        if (node.name !== 'QuoteMark') {
          return;
        }

        if (processedMarks.has(node.from)) {
          return;
        }

        processedMarks.add(node.from);

        const line = doc.lineAt(node.from);

        if (node.to > line.to) {
          return;
        }

        // Each QuoteMark represents one level of nesting.
        quoteDepths.set(line.from, (quoteDepths.get(line.from) ?? 0) + 1);

        // Include one optional space after ">".
        let syntaxEnd = node.to;

        if (syntaxEnd < line.to) {
          const nextChar = doc.sliceString(syntaxEnd, syntaxEnd + 1);

          if (nextChar === ' ' || nextChar === '\t') {
            syntaxEnd++;
          }
        }

        // For nested blockquotes, keep the position
        // after the last quote marker on this line.
        const previousEnd = quotePrefixEnds.get(line.from) ?? line.from;

        quotePrefixEnds.set(line.from, Math.max(previousEnd, syntaxEnd));

        // Show original syntax on the active line.
        if (isLineActive(view, line.from, line.to)) {
          return;
        }

        // Hide syntax while preserving its width.
        ranges.push(
          Decoration.mark({
            class: 'cm-live-quote-syntax-hidden',
          }).range(node.from, syntaxEnd)
        );
      },
    });
  }

  // Apply indentation separately to each quote line.

  for (const [lineFrom, prefixEnd] of quotePrefixEnds) {
    const prefixLength = prefixEnd - lineFrom;
    const depth = quoteDepths.get(lineFrom) ?? 1;

    const line = doc.lineAt(lineFrom);

    // Check whether this line is being edited.
    const active = isLineActive(view, line.from, line.to);

    // Obsidian-like behavior:
    // While editing a nested quote, show the Markdown
    // markers and temporarily hide the inner quote bars.
    // Keep the outermost quote bar visible.
    const visibleBarDepth = active ? 1 : depth;

    ranges.push(
      Decoration.line({
        class: 'cm-live-blockquote',
        attributes: {
          style: [
            `--cm-quote-prefix-width: ${prefixLength}ch`,
            `--cm-quote-bars-width: ${visibleBarDepth * 2}ch`,
          ].join('; '),
        },
      }).range(lineFrom)
    );
  }

  return Decoration.set(ranges, true);
}

/**
 * CodeMirror 6 Blockquote Live Preview.
 */
export const blockquoteLivePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildBlockquoteDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildBlockquoteDecorations(update.view);
      }
    }
  },
  {
    decorations: plugin => plugin.decorations,
  }
);
