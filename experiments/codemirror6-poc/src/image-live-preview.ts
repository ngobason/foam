import { syntaxTree } from '@codemirror/language';
import {
  EditorState,
  StateField,
  StateEffect,
  type Range,
} from '@codemirror/state';

import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';

import { noteUriFacet } from './note-context';
import { resolveLocalImageUrl } from './asset-resolver';

/**
 * Image widget displayed instead of Markdown image syntax.
 */

/**
 * Open an image in a modal preview.
 */
function openImageLightbox(src: string, alt: string): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'cm-image-lightbox';

  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'cm-image-lightbox-close';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Close image');

  closeButton.addEventListener('click', () => {
    dialog.close();
  });

  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  dialog.addEventListener('close', () => dialog.remove(), { once: true });

  dialog.append(img, closeButton);
  document.body.appendChild(dialog);

  dialog.showModal();
}

// Explicit request to edit the Markdown source of an image.
const revealImageSource = StateEffect.define<number>();

/**
 * Image preview widget with zoom and source editing.
 */
class ImagePreviewWidget extends WidgetType {
  readonly src: string;
  readonly alt: string;
  readonly from: number;
  readonly block: boolean;
  readonly localPath: string | null;
  readonly standalone: boolean;

  constructor(
    src: string,
    alt: string,
    from: number,
    block: boolean,
    localPath: string | null = null,
    standalone: boolean = false
  ) {
    super();

    this.src = src;
    this.alt = alt;
    this.from = from;
    this.block = block;
    this.localPath = localPath;
    this.standalone = standalone;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ImagePreviewWidget &&
      other.src === this.src &&
      other.alt === this.alt &&
      other.from === this.from &&
      other.block === this.block &&
      other.localPath === this.localPath &&
      other.standalone === this.standalone
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement(this.block ? 'div' : 'span');

    wrapper.className = this.block
      ? 'cm-live-image cm-live-image-block'
      : 'cm-live-image';

    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.alt;
    img.title = this.alt || 'View image';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';

    // Click image -> large preview.
    img.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      openImageLightbox(this.src, this.alt);
    });

    // Keyboard accessibility for image preview.
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'View image');

    img.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openImageLightbox(this.src, this.alt);
      }
    });

    // Image toolbar.
    const toolbar = document.createElement('span');
    toolbar.className = 'cm-live-image-toolbar';

    // Zoom button.
    const zoomButton = document.createElement('button');
    zoomButton.type = 'button';

    zoomButton.innerHTML = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="10.5" cy="10.5" r="7.5" />
    <path d="M21 21l-5.2-5.2" />
    <path d="M10.5 7.5v6" />
    <path d="M7.5 10.5h6" />
  </svg>
`;

    zoomButton.title = 'View image';
    zoomButton.setAttribute('aria-label', 'View image');

    zoomButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      openImageLightbox(this.src, this.alt);
    });

    // Edit Markdown source button.
    const sourceButton = document.createElement('button');
    sourceButton.type = 'button';
    sourceButton.textContent = '</>';
    sourceButton.title = 'Edit Markdown source';
    sourceButton.setAttribute('aria-label', 'Edit Markdown source');

    sourceButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      // Place cursor inside the image Markdown syntax.
      // This makes isImageActive() reveal the source.
      view.dispatch({
        effects: revealImageSource.of(this.from),
        selection: {
          anchor: this.from + 2,
        },
        scrollIntoView: true,
      });

      view.focus();
    });

    toolbar.append(zoomButton, sourceButton);

    img.addEventListener('load', () => {
      view.requestMeasure();
    });

    img.addEventListener('error', () => {
      wrapper.classList.add('cm-live-image-error');

      // Local assets use the existing shaded
      // missing-image placeholder.
      if (this.localPath !== null) {
        wrapper.className = this.standalone
          ? 'cm-live-image-missing cm-live-image-missing-block'
          : 'cm-live-image-missing';

        const message = document.createElement('span');
        message.className = 'cm-live-image-missing-text';
        message.textContent = `"${this.localPath}" could not be found.`;

        // Keep the existing source-edit action.
        sourceButton.classList.add('cm-live-image-missing-edit');

        img.replaceWith(message);
        toolbar.remove();
        wrapper.appendChild(sourceButton);

        view.requestMeasure();
        return;
      }

      const fallback = document.createElement('span');
      fallback.className = 'cm-live-image-error-fallback';

      // Small broken-image icon.
      const icon = document.createElement('span');
      icon.className = 'cm-live-image-error-icon';
      icon.setAttribute('aria-hidden', 'true');

      icon.innerHTML = `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m3 16 5-5 4 4 3-3 6 6" />
      <path d="M3 3 21 21" />
    </svg>
  `;

      // Display the original Markdown alt text.
      const label = document.createElement('span');
      label.className = 'cm-live-image-error-label';
      label.textContent = this.alt.trim() || 'Image unavailable';

      // Reuse the existing source edit button.
      sourceButton.classList.add('cm-live-image-error-edit');

      fallback.append(icon, label, sourceButton);

      // Replace only the failed image.
      img.replaceWith(fallback);

      // The zoom toolbar is not useful for a failed image.
      toolbar.remove();

      view.requestMeasure();
    });

    // Prevent clicking the image from moving the editor cursor.
    wrapper.addEventListener('mousedown', event => {
      event.preventDefault();
      event.stopPropagation();
    });

    wrapper.append(img, toolbar);

    return wrapper;
  }

  ignoreEvent(): boolean {
    // The widget handles its own mouse and keyboard events.
    return true;
  }
}

/**
 * Placeholder for a local image that is not yet
 * available through the PoC's file storage.
 */
class MissingLocalImageWidget extends WidgetType {
  readonly path: string;
  readonly from: number;
  readonly standalone: boolean;

  constructor(path: string, from: number, standalone: boolean) {
    super();
    this.path = path;
    this.from = from;
    this.standalone = standalone;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof MissingLocalImageWidget &&
      other.path === this.path &&
      other.from === this.from &&
      other.standalone === this.standalone
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span');

    wrapper.className = this.standalone
      ? 'cm-live-image-missing cm-live-image-missing-block'
      : 'cm-live-image-missing';

    const message = document.createElement('span');
    message.className = 'cm-live-image-missing-text';
    message.textContent = `"${this.path}" could not be found.`;

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'cm-live-image-missing-edit';
    editButton.textContent = '</>';
    editButton.title = 'Edit Markdown source';
    editButton.setAttribute('aria-label', 'Edit Markdown source');

    editButton.addEventListener('mousedown', event => {
      event.preventDefault();
      event.stopPropagation();
    });

    editButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      view.dispatch({
        effects: revealImageSource.of(this.from),
        selection: {
          anchor: this.from + 2,
        },
        scrollIntoView: true,
      });

      view.focus();
    });

    wrapper.append(message, editButton);
    return wrapper;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Only allow remote HTTP/HTTPS images in this step.
 */
function getRemoteImageUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function buildImageDecorations(
  state: EditorState,
  editingFrom: number | null
): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const doc = state.doc;

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Image') {
        return;
      }

      const urlNode = node.node.getChild('URL');

      if (!urlNode) {
        return;
      }

      const raw = doc.sliceString(node.from, node.to);

      if (raw.includes('\n')) {
        return;
      }

      const rawUrl = doc.sliceString(urlNode.from, urlNode.to);

      // Remote HTTP/HTTPS image.
      const remoteSrc = getRemoteImageUrl(rawUrl);

      // Local image resolved relative to the current note.
      const sourceUri = state.facet(noteUriFacet);

      const localSrc = sourceUri
        ? resolveLocalImageUrl(sourceUri, rawUrl)
        : null;

      const src = remoteSrc ?? localSrc;

      const closingBracket = node.node
        .getChildren('LinkMark')
        .find(mark => doc.sliceString(mark.from, mark.to) === ']');

      if (!closingBracket) {
        return;
      }

      const alt = doc.sliceString(node.from + 2, closingBracket.from);

      // Only reveal source when explicitly requested.
      if (editingFrom === node.from) {
        return;
      }

      const isLocalPath =
        rawUrl.startsWith('./') ||
        rawUrl.startsWith('../') ||
        rawUrl.startsWith('/');

      // Unsupported URL types remain as Markdown source.
      if (!src && !isLocalPath) {
        return;
      }

      const line = doc.lineAt(node.from);

      const standalone = node.from === line.from && node.to === line.to;

      const widget = src
        ? new ImagePreviewWidget(
            src,
            alt,
            node.from,
            false,
            localSrc ? rawUrl : null,
            standalone
          )
        : new MissingLocalImageWidget(rawUrl, node.from, standalone);

      ranges.push(
        Decoration.replace({
          widget,
        }).range(node.from, node.to)
      );
    },
  });

  return Decoration.set(ranges, true);
}

type ImagePreviewState = {
  editingFrom: number | null;
  decorations: DecorationSet;
};

export const imageLivePreview = StateField.define<ImagePreviewState>({
  create(state) {
    return {
      editingFrom: null,
      decorations: buildImageDecorations(state, null),
    };
  },

  update(value, transaction) {
    let editingFrom = value.editingFrom;

    // Preserve source position when Markdown changes.
    if (editingFrom !== null && transaction.docChanged) {
      editingFrom = transaction.changes.mapPos(editingFrom, -1);
    }

    // Source editing is activated only by the toolbar.
    for (const effect of transaction.effects) {
      if (effect.is(revealImageSource)) {
        editingFrom = effect.value;
      }
    }

    // Stop editing when the selection leaves the image.
    if (editingFrom !== null) {
      const sourceFrom = editingFrom;
      const selection = transaction.state.selection.main;

      let stillEditing = false;

      syntaxTree(transaction.state).iterate({
        from: sourceFrom,
        to: Math.min(sourceFrom + 1, transaction.state.doc.length),

        enter(node) {
          if (
            node.name === 'Image' &&
            node.from === sourceFrom &&
            selection.from >= node.from &&
            selection.to <= node.to
          ) {
            stillEditing = true;
          }
        },
      });

      if (!stillEditing) {
        editingFrom = null;
      }
    }

    const selectionChanged =
      transaction.startState.selection !== transaction.state.selection;

    if (
      transaction.docChanged ||
      selectionChanged ||
      editingFrom !== value.editingFrom
    ) {
      return {
        editingFrom,
        decorations: buildImageDecorations(transaction.state, editingFrom),
      };
    }

    return value;
  },

  provide(field) {
    return EditorView.decorations.from(field, value => value.decorations);
  },
});
