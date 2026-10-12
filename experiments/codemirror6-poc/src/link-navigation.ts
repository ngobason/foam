import { syntaxTree } from '@codemirror/language';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { isNavigableInternalLinkAt } from './internal-link-navigation';

/**
 * Find an external HTTP/HTTPS Markdown link
 * at a mouse position.
 */
function getExternalUrlAt(
  view: EditorView,
  x: number,
  y: number
): string | null {
  const position = view.posAtCoords({ x, y });

  if (position === null) {
    return null;
  }

  let node = syntaxTree(view.state).resolveInner(position, -1);

  while (node.name !== 'Link' && node.parent) {
    node = node.parent;
  }

  if (node.name !== 'Link') {
    return null;
  }

  const urlNode = node.getChild('URL');

  if (!urlNode) {
    return null;
  }

  const rawUrl = view.state.sliceDoc(urlNode.from, urlNode.to);

  try {
    const target = new URL(rawUrl);

    if (target.protocol === 'http:' || target.protocol === 'https:') {
      return target.href;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Handle Ctrl+Hover and Ctrl+Click for external links.
 */
class ExternalLinkInteraction {
  private readonly view: EditorView;

  private mousePosition: { x: number; y: number } | null = null;

  constructor(view: EditorView) {
    this.view = view;

    view.dom.addEventListener('mousemove', this.onMouseMove);
    view.dom.addEventListener('mouseleave', this.onMouseLeave);
    view.dom.addEventListener('click', this.onClick);

    window.addEventListener('keydown', this.onModifierChange);
    window.addEventListener('keyup', this.onModifierChange);
    window.addEventListener('blur', this.onWindowBlur);
  }

  /**
   * Set pointer cursor only when Ctrl/Cmd is held
   * and the mouse is hovering over an external link.
   */

  private updateCursor(modifierPressed: boolean): void {
    const position = this.mousePosition;

    if (!modifierPressed || !position) {
      this.view.contentDOM.style.cursor = '';
      return;
    }

    // Existing external Markdown Link handling.
    const externalUrl = getExternalUrlAt(this.view, position.x, position.y);

    // Determine the CodeMirror document position.
    const documentPosition = this.view.posAtCoords({
      x: position.x,
      y: position.y,
    });

    // Check internal links through Foam Core.
    const isInternalLink =
      documentPosition !== null &&
      isNavigableInternalLinkAt(this.view, documentPosition);

    // Show pointer for external or navigable internal links.
    this.view.contentDOM.style.cursor =
      externalUrl || isInternalLink ? 'pointer' : '';
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (
      !(event.target instanceof Node) ||
      !this.view.contentDOM.contains(event.target)
    ) {
      this.mousePosition = null;
      this.updateCursor(false);
      return;
    }

    this.mousePosition = {
      x: event.clientX,
      y: event.clientY,
    };

    this.updateCursor(event.ctrlKey || event.metaKey);
  };

  private onMouseLeave = (): void => {
    this.mousePosition = null;
    this.updateCursor(false);
  };

  private onModifierChange = (event: KeyboardEvent): void => {
    this.updateCursor(event.ctrlKey || event.metaKey);
  };

  private onWindowBlur = (): void => {
    this.updateCursor(false);
  };

  /**
   * Open external links with Ctrl+Click or Cmd+Click.
   */
  private onClick = (event: MouseEvent): void => {
    if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) {
      return;
    }

    if (
      !(event.target instanceof Node) ||
      !this.view.contentDOM.contains(event.target)
    ) {
      return;
    }

    const url = getExternalUrlAt(this.view, event.clientX, event.clientY);

    if (!url) {
      return;
    }

    event.preventDefault();

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  /**
   * Release event listeners when the editor is destroyed.
   */
  destroy(): void {
    this.view.dom.removeEventListener('mousemove', this.onMouseMove);

    this.view.dom.removeEventListener('mouseleave', this.onMouseLeave);

    this.view.dom.removeEventListener('click', this.onClick);

    window.removeEventListener('keydown', this.onModifierChange);

    window.removeEventListener('keyup', this.onModifierChange);

    window.removeEventListener('blur', this.onWindowBlur);

    this.view.contentDOM.style.cursor = '';
  }
}

export const externalLinkNavigation = ViewPlugin.fromClass(
  ExternalLinkInteraction
);
