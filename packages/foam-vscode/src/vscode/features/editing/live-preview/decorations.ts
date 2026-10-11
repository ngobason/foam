import * as vscode from 'vscode';

import type {
  LivePreviewElement,
  LivePreviewElementType,
  LivePreviewMarker,
} from './parser';

/**
 * Creates and manages Markdown decorations
 * for the Foam Live Preview feature.
 */
export function createLivePreviewDecorations() {
  // Decorations for Markdown content.
  const decorationTypes: Record<
    'heading' | 'bold' | 'italic' | 'inlineCode',
    vscode.TextEditorDecorationType
  > = {
    heading: vscode.window.createTextEditorDecorationType({
      fontWeight: 'bold',
    }),

    bold: vscode.window.createTextEditorDecorationType({
      fontWeight: 'bold',
    }),

    italic: vscode.window.createTextEditorDecorationType({
      fontStyle: 'italic',
    }),

    inlineCode: vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(128, 128, 128, 0.15)',
      borderRadius: '3px',
    }),
  };

  // Decoration for hiding Markdown syntax markers.
  const hiddenMarkerDecoration = vscode.window.createTextEditorDecorationType({
    opacity: '0',
  });

  // Experimental whole-line styling for blockquotes.
  const blockquoteLineDecoration = vscode.window.createTextEditorDecorationType(
    {
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('textBlockQuote.background'),
      borderStyle: 'solid',
      borderWidth: '0 0 0 3px',
      borderColor: new vscode.ThemeColor('textBlockQuote.border'),
    }
  );

  // Experimental bullet for unordered Markdown lists.
  const unorderedBulletDecoration =
    vscode.window.createTextEditorDecorationType({
      before: {
        contentText: '•',
        color: new vscode.ThemeColor('editor.foreground'),
        margin: '0 2px 0 0',
      },
    });

  const types: LivePreviewElementType[] = [
    'heading',
    'bold',
    'italic',
    'inlineCode',
  ];

  /**
   * Check whether the cursor or selection overlaps
   * the Markdown element containing a marker.
   */
  function isElementActive(
    editor: vscode.TextEditor,
    marker: LivePreviewMarker
  ): boolean {
    return editor.selections.some(selection => {
      const start = editor.document.offsetAt(selection.start);
      const end = editor.document.offsetAt(selection.end);

      // Cursor without selected text.
      if (selection.isEmpty) {
        return start >= marker.elementStart && start <= marker.elementEnd;
      }

      // Non-empty selection: check range intersection.
      return start < marker.elementEnd && end > marker.elementStart;
    });
  }

  /**
   * A list marker is active only when the cursor or selection
   * touches the line containing that marker.
   *
   * This prevents editing a nested child from revealing
   * the parent's list marker.
   */
  function isListItemMarkerActive(
    editor: vscode.TextEditor,
    marker: LivePreviewMarker
  ): boolean {
    const markerLine = editor.document.positionAt(marker.start).line;

    return editor.selections.some(selection => {
      return (
        selection.start.line <= markerLine && selection.end.line >= markerLine
      );
    });
  }

  /**
   * Apply Markdown formatting and hide inactive markers.
   */
  function apply(
    editor: vscode.TextEditor,
    elements: LivePreviewElement[],
    markers: LivePreviewMarker[] = [],
    blockquoteMarkers: LivePreviewMarker[] = [],
    listItemMarkers: LivePreviewMarker[] = []
  ): void {
    // Apply formatting to Markdown elements.
    for (const type of types) {
      const ranges = elements
        .filter(element => element.type === type)
        .map(element => {
          const start = editor.document.positionAt(element.start);
          const end = editor.document.positionAt(element.end);

          return new vscode.Range(start, end);
        });

      editor.setDecorations(decorationTypes[type], ranges);
    }

    // Apply whole-line decorations to quoted lines.
    const blockquoteRanges = blockquoteMarkers.map(marker => {
      return new vscode.Range(
        editor.document.positionAt(marker.start),
        editor.document.positionAt(marker.end)
      );
    });

    editor.setDecorations(blockquoteLineDecoration, blockquoteRanges);

    // Identify inactive unordered list markers.
    const inactiveUnorderedMarkers = listItemMarkers.filter(marker => {
      const range = new vscode.Range(
        editor.document.positionAt(marker.start),
        editor.document.positionAt(marker.end)
      );

      const source = editor.document.getText(range);

      return (
        /^[-+*][ \t]+$/.test(source) && !isListItemMarkerActive(editor, marker)
      );
    });

    // Insert visual bullet before each inactive marker.
    const bulletRanges = inactiveUnorderedMarkers.map(marker => {
      const position = editor.document.positionAt(marker.start);
      return new vscode.Range(position, position);
    });

    editor.setDecorations(unorderedBulletDecoration, bulletRanges);

    // Hide markers when the cursor/selection is outside.
    const hiddenRanges = [
      ...markers.filter(marker => !isElementActive(editor, marker)),
      ...inactiveUnorderedMarkers,
    ].map(marker => {
      return new vscode.Range(
        editor.document.positionAt(marker.start),
        editor.document.positionAt(marker.end)
      );
    });

    editor.setDecorations(hiddenMarkerDecoration, hiddenRanges);
  }

  /**
   * Remove all Live Preview decorations.
   */
  function clear(editor: vscode.TextEditor): void {
    for (const type of types) {
      editor.setDecorations(decorationTypes[type], []);
    }

    editor.setDecorations(hiddenMarkerDecoration, []);
    editor.setDecorations(blockquoteLineDecoration, []);
    editor.setDecorations(unorderedBulletDecoration, []);
  }

  /**
   * Release decoration resources.
   */
  function dispose(): void {
    for (const type of types) {
      decorationTypes[type].dispose();
    }

    hiddenMarkerDecoration.dispose();
    blockquoteLineDecoration.dispose();
    unorderedBulletDecoration.dispose();
  }

  return {
    apply,
    clear,
    dispose,
  };
}
