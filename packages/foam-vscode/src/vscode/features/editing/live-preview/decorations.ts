import * as vscode from 'vscode';

import type { LivePreviewElement, LivePreviewElementType } from './parser';

/**
 * Creates and manages Markdown decorations
 * for the Foam Live Preview feature.
 */
export function createLivePreviewDecorations() {
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

  const types: LivePreviewElementType[] = [
    'heading',
    'bold',
    'italic',
    'inlineCode',
  ];

  /**
   * Apply decorations based on the parser output.
   */
  function apply(
    editor: vscode.TextEditor,
    elements: LivePreviewElement[]
  ): void {
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
  }

  /**
   * Remove all Live Preview decorations
   * from a specific editor.
   */
  function clear(editor: vscode.TextEditor): void {
    for (const type of types) {
      editor.setDecorations(decorationTypes[type], []);
    }
  }

  /**
   * Release decoration resources.
   */
  function dispose(): void {
    for (const type of types) {
      decorationTypes[type].dispose();
    }
  }

  return {
    apply,
    clear,
    dispose,
  };
}
