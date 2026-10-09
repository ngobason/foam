import unified from 'unified';
import markdownParse from 'remark-parse';
import wikiLinkPlugin from 'remark-wiki-link';
import visit from 'unist-util-visit';

/**
 * Markdown elements supported by Live Preview.
 */
export type LivePreviewElementType =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'inlineCode';

/**
 * Position of a Markdown element in the source text.
 *
 * start: inclusive offset
 * end: exclusive offset
 */
export interface LivePreviewElement {
  type: LivePreviewElementType;
  start: number;
  end: number;
  headingLevel?: number;
}

/**
 * Reuse the same Markdown parser libraries
 * and Wikilink syntax as Foam Core.
 */
const markdownProcessor = unified()
  .use(markdownParse, { gfm: true })
  .use(wikiLinkPlugin, { aliasDivider: '|' });

/**
 * Parse Markdown and collect elements
 * relevant to Live Preview.
 */
export function parseLivePreview(markdown: string): LivePreviewElement[] {
  const tree = markdownProcessor.parse(markdown);
  const elements: LivePreviewElement[] = [];

  visit(tree, node => {
    let type: LivePreviewElementType;

    switch (node.type) {
      case 'heading':
        type = 'heading';
        break;

      case 'strong':
        type = 'bold';
        break;

      case 'emphasis':
        type = 'italic';
        break;

      case 'inlineCode':
        type = 'inlineCode';
        break;

      default:
        return;
    }

    const start = node.position?.start.offset;
    const end = node.position?.end.offset;

    if (typeof start !== 'number' || typeof end !== 'number' || end <= start) {
      return;
    }

    const element: LivePreviewElement = {
      type,
      start,
      end,
    };

    if (node.type === 'heading') {
      element.headingLevel = (node as typeof node & { depth: number }).depth;
    }

    elements.push(element);
  });

  // Keep elements ordered by their positions in the document.
  return elements.sort((a, b) => a.start - b.start || b.end - a.end);
}

/**
 * A Markdown syntax marker belonging to an element.
 */
export interface LivePreviewMarker {
  start: number;
  end: number;
  elementStart: number;
  elementEnd: number;
}

/**
 * Find opening and closing markers for simple Bold syntax.
 *
 * Example:
 *   **Hello**
 *   ^^     ^^
 *
 * Nested or ambiguous triple-star syntax is deferred
 * to a later implementation step.
 */
export function getBoldMarkers(
  markdown: string,
  elements: LivePreviewElement[]
): LivePreviewMarker[] {
  const markers: LivePreviewMarker[] = [];

  for (const element of elements) {
    if (element.type !== 'bold') {
      continue;
    }

    const raw = markdown.slice(element.start, element.end);

    // Only support ordinary **Bold** in this first version.
    if (
      raw.length <= 4 ||
      !raw.startsWith('**') ||
      !raw.endsWith('**') ||
      raw.startsWith('***') ||
      raw.endsWith('***') ||
      markdown[element.start - 1] === '*' ||
      markdown[element.end] === '*'
    ) {
      continue;
    }

    // Opening **
    markers.push({
      start: element.start,
      end: element.start + 2,
      elementStart: element.start,
      elementEnd: element.end,
    });

    // Closing **
    markers.push({
      start: element.end - 2,
      end: element.end,
      elementStart: element.start,
      elementEnd: element.end,
    });
  }

  return markers;
}
