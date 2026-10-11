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
  | 'inlineCode'
  | 'wikilink'
  | 'markdownLink'
  | 'listItem'
  | 'blockquote';

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
  .use(markdownParse, {
    gfm: true,
    commonmark: true,
  })
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

      case 'wikiLink':
        type = 'wikilink';
        break;

      case 'link':
        type = 'markdownLink';
        break;

      case 'listItem':
        type = 'listItem';
        break;

      case 'blockquote':
        type = 'blockquote';
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

/**
 * Find opening and closing markers for simple Italic syntax.
 *
 * Example:
 *   *Hello*
 *   ^     ^
 *
 * Only supports single asterisk markers.
 * Nested formatting is deferred to a later step.
 */
export function getItalicMarkers(
  markdown: string,
  elements: LivePreviewElement[]
): LivePreviewMarker[] {
  const markers: LivePreviewMarker[] = [];

  for (const element of elements) {
    if (element.type !== 'italic') {
      continue;
    }

    const raw = markdown.slice(element.start, element.end);

    // Only support simple *Italic* syntax.
    if (
      raw.length <= 2 ||
      !raw.startsWith('*') ||
      !raw.endsWith('*') ||
      raw.startsWith('**') ||
      raw.endsWith('**') ||
      markdown[element.start - 1] === '*' ||
      markdown[element.end] === '*'
    ) {
      continue;
    }

    // Opening *
    markers.push({
      start: element.start,
      end: element.start + 1,
      elementStart: element.start,
      elementEnd: element.end,
    });

    // Closing *
    markers.push({
      start: element.end - 1,
      end: element.end,
      elementStart: element.start,
      elementEnd: element.end,
    });
  }

  return markers;
}

/**
 * Find opening and closing markers for simple Inline Code.
 *
 * Example:
 *   `Hello`
 *   ^     ^
 *
 * Only single-backtick syntax is supported initially.
 * Multiple-backtick delimiters are deferred to a later step.
 */
export function getInlineCodeMarkers(
  markdown: string,
  elements: LivePreviewElement[]
): LivePreviewMarker[] {
  const markers: LivePreviewMarker[] = [];

  for (const element of elements) {
    if (element.type !== 'inlineCode') {
      continue;
    }

    const raw = markdown.slice(element.start, element.end);

    // Only support simple `Code` syntax.
    if (
      raw.length <= 2 ||
      !raw.startsWith('`') ||
      !raw.endsWith('`') ||
      raw.startsWith('``') ||
      raw.endsWith('``') ||
      markdown[element.start - 1] === '`' ||
      markdown[element.end] === '`' ||
      raw.includes('\n')
    ) {
      continue;
    }

    // Opening backtick.
    markers.push({
      start: element.start,
      end: element.start + 1,
      elementStart: element.start,
      elementEnd: element.end,
    });

    // Closing backtick.
    markers.push({
      start: element.end - 1,
      end: element.end,
      elementStart: element.start,
      elementEnd: element.end,
    });
  }

  return markers;
}

/**
 * Find opening # markers for ATX-style Markdown headings.
 *
 * Examples:
 *   # Heading 1
 *   ## Heading 2
 *   ### Heading 3
 *
 * Only headings beginning directly with 1-6 # characters
 * followed by a space or tab are supported initially.
 */
export function getHeadingMarkers(
  markdown: string,
  elements: LivePreviewElement[]
): LivePreviewMarker[] {
  const markers: LivePreviewMarker[] = [];

  for (const element of elements) {
    if (element.type !== 'heading') {
      continue;
    }

    const raw = markdown.slice(element.start, element.end);

    // Match ATX headings with 1-6 # characters.
    const match = raw.match(/^(#{1,6})(?=[ \t])/);

    if (!match) {
      continue;
    }

    const headingLevel = match[1].length;

    // Ensure the marker agrees with the AST heading level.
    if (headingLevel !== element.headingLevel) {
      continue;
    }

    // Opening heading marker: #, ##, ###, etc.
    markers.push({
      start: element.start,
      end: element.start + headingLevel,
      elementStart: element.start,
      elementEnd: element.end,
    });
  }

  return markers;
}

/**
 * Find markers for simple combined BoldItalic syntax.
 *
 * Example:
 *   ***Hello World***
 *   ^^^           ^^^
 *
 * Remark parses this syntax as:
 *   - outer strong (bold)
 *   - inner emphasis (italic)
 *
 * Other nested formatting patterns are deferred.
 */
export function getBoldItalicMarkers(
  markdown: string,
  elements: LivePreviewElement[]
): LivePreviewMarker[] {
  const markers: LivePreviewMarker[] = [];

  const boldElements = elements.filter(element => element.type === 'bold');

  const italicElements = elements.filter(element => element.type === 'italic');

  for (const bold of boldElements) {
    const raw = markdown.slice(bold.start, bold.end);

    // Only handle simple ***text*** syntax.
    if (
      raw.length <= 6 ||
      !raw.startsWith('***') ||
      !raw.endsWith('***') ||
      markdown[bold.start - 1] === '*' ||
      markdown[bold.end] === '*'
    ) {
      continue;
    }

    // Confirm Remark found an italic node inside
    // the outer bold node at the expected positions.
    const innerItalic = italicElements.find(
      italic => italic.start === bold.start + 2 && italic.end === bold.end - 2
    );

    if (!innerItalic) {
      continue;
    }

    // Opening ***
    markers.push({
      start: bold.start,
      end: bold.start + 3,
      elementStart: bold.start,
      elementEnd: bold.end,
    });

    // Closing ***
    markers.push({
      start: bold.end - 3,
      end: bold.end,
      elementStart: bold.start,
      elementEnd: bold.end,
    });
  }

  return markers;
}

export function getWikilinkMarkers(
  markdown: string,
  elements: LivePreviewElement[]
): LivePreviewMarker[] {
  const markers: LivePreviewMarker[] = [];

  for (const element of elements) {
    if (element.type !== 'wikilink') {
      continue;
    }

    const raw = markdown.slice(element.start, element.end);

    // Only handle complete wikilinks.
    if (raw.length <= 4 || !raw.startsWith('[[') || !raw.endsWith(']]')) {
      continue;
    }

    // Find alias separator, if present.
    const separatorIndex = raw.indexOf('|', 2);

    // For a basic link, hide only [[.
    // For an alias link, hide [[Target|.
    const prefixEnd =
      separatorIndex >= 0
        ? element.start + separatorIndex + 1
        : element.start + 2;

    // The final ]] is always hidden.
    const suffixStart = element.end - 2;

    // Ensure that visible link text is not empty.
    if (prefixEnd >= suffixStart) {
      continue;
    }

    markers.push({
      start: element.start,
      end: prefixEnd,
      elementStart: element.start,
      elementEnd: element.end,
    });

    markers.push({
      start: suffixStart,
      end: element.end,
      elementStart: element.start,
      elementEnd: element.end,
    });
  }

  return markers;
}

export function getMarkdownLinkMarkers(
  markdown: string,
  elements: LivePreviewElement[]
): LivePreviewMarker[] {
  const markers: LivePreviewMarker[] = [];

  for (const element of elements) {
    if (element.type !== 'markdownLink') {
      continue;
    }

    const raw = markdown.slice(element.start, element.end);

    // Only handle complete inline Markdown links.
    if (raw.length < 5 || !raw.startsWith('[') || !raw.endsWith(')')) {
      continue;
    }

    // Find the boundary between link label and destination.
    const separatorIndex = raw.lastIndexOf('](');

    // Skip links with empty or invalid visible labels.
    if (separatorIndex <= 1) {
      continue;
    }

    // Hide the opening "[".
    markers.push({
      start: element.start,
      end: element.start + 1,
      elementStart: element.start,
      elementEnd: element.end,
    });

    // Hide "](destination)".
    markers.push({
      start: element.start + separatorIndex,
      end: element.end,
      elementStart: element.start,
      elementEnd: element.end,
    });
  }

  return markers;
}

export function getListItemMarkers(
  markdown: string,
  elements: LivePreviewElement[]
): LivePreviewMarker[] {
  const markers: LivePreviewMarker[] = [];

  for (const element of elements) {
    if (element.type !== 'listItem') {
      continue;
    }

    const raw = markdown.slice(element.start, element.end);
    const firstLine = raw.split(/\r?\n/)[0];

    // Recognize unordered (-, +, *) and ordered (1., 2), ...)
    // list markers followed by whitespace.
    const match = /^([ \t]*)([-+*]|\d+[.)])([ \t]+)/.exec(firstLine);

    if (!match) {
      continue;
    }

    markers.push({
      start: element.start + match[1].length,
      end: element.start + match[0].length,
      elementStart: element.start,
      elementEnd: element.end,
    });
  }

  return markers;
}

export function getBlockquoteMarkers(
  markdown: string,
  elements: LivePreviewElement[]
): LivePreviewMarker[] {
  const markers: LivePreviewMarker[] = [];

  for (const element of elements) {
    if (element.type !== 'blockquote') {
      continue;
    }

    const raw = markdown.slice(element.start, element.end);

    // Find blockquote markers at the beginning of each line.
    const regex = /^[ \t]*(>[ \t]?)/gm;

    let match: RegExpExecArray | null;

    while ((match = regex.exec(raw)) !== null) {
      // Skip leading indentation.
      const indentationLength = match[0].length - match[1].length;

      const markerStart = element.start + match.index + indentationLength;

      markers.push({
        start: markerStart,
        end: markerStart + match[1].length,
        elementStart: element.start,
        elementEnd: element.end,
      });
    }
  }

  return markers;
}
