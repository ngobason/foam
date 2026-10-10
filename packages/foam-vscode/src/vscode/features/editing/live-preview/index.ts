import * as vscode from 'vscode';

import {
  parseLivePreview,
  getBoldMarkers,
  getItalicMarkers,
  getInlineCodeMarkers,
  getHeadingMarkers,
  getBoldItalicMarkers,
  getWikilinkMarkers,
  getMarkdownLinkMarkers,
} from './parser';

import { createLivePreviewDecorations } from './decorations';

/**
 * Activates the Foam Live Preview feature.
 */
export default function activate(context: vscode.ExtensionContext): void {
  // 1. Create decoration manager.
  const decorations = createLivePreviewDecorations();

  // Release resources when the extension is deactivated.
  context.subscriptions.push(decorations);

  /**
   * Parse Markdown and update decorations.
   */
  function updateLivePreview(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      return;
    }

    // Only apply Live Preview to Markdown documents.
    if (editor.document.languageId !== 'markdown') {
      decorations.clear(editor);
      return;
    }

    // 2. Read Markdown source.
    const markdown = editor.document.getText();

    const elements = parseLivePreview(markdown);

    // Collect Markdown syntax markers.
    const boldMarkers = getBoldMarkers(markdown, elements);
    const italicMarkers = getItalicMarkers(markdown, elements);
    const inlineCodeMarkers = getInlineCodeMarkers(markdown, elements);
    const headingMarkers = getHeadingMarkers(markdown, elements);
    const boldItalicMarkers = getBoldItalicMarkers(markdown, elements);
    const wikilinkMarkers = getWikilinkMarkers(markdown, elements);
    const markdownLinkMarkers = getMarkdownLinkMarkers(markdown, elements);

    // Combine all supported markers.

    const markers = [
      ...boldMarkers,
      ...italicMarkers,
      ...inlineCodeMarkers,
      ...headingMarkers,
      ...boldItalicMarkers,
      ...wikilinkMarkers,
      ...markdownLinkMarkers,
    ];

    // Apply formatting and cursor-aware marker visibility.
    decorations.apply(editor, elements, markers);
  }

  // Update the currently active editor.
  updateLivePreview(vscode.window.activeTextEditor);

  context.subscriptions.push(
    // When the active editor changes.
    vscode.window.onDidChangeActiveTextEditor(editor => {
      updateLivePreview(editor);
    }),

    // When the Markdown document changes.
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;

      if (editor && event.document === editor.document) {
        updateLivePreview(editor);
      }
    }),

    // When the cursor or selection changes.
    vscode.window.onDidChangeTextEditorSelection(event => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        updateLivePreview(event.textEditor);
      }
    })
  );

  console.log('[Foam Live Preview] Event listeners registered');
}
