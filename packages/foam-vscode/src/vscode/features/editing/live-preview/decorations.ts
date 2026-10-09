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
    LivePreviewElementType,
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
   * Apply Markdown formatting and hide inactive markers.
   */
  function apply(
    editor: vscode.TextEditor,
    elements: LivePreviewElement[],
    markers: LivePreviewMarker[] = []
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

    // Hide markers when the cursor/selection is outside.
    const hiddenRanges = markers
      .filter(marker => !isElementActive(editor, marker))
      .map(marker => {
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
  }

  /**
   * Release decoration resources.
   */
  function dispose(): void {
    for (const type of types) {
      decorationTypes[type].dispose();
    }

    hiddenMarkerDecoration.dispose();
  }

  return {
    apply,
    clear,
    dispose,
  };
}
