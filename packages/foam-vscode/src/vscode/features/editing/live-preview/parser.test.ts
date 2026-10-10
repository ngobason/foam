import {
  parseLivePreview,
  getBoldMarkers,
  getItalicMarkers,
  getInlineCodeMarkers,
  getHeadingMarkers,
  getBoldItalicMarkers,
  getWikilinkMarkers,
} from './parser';

describe('Live Preview Markdown Parser', () => {
  test('should recognize heading levels', () => {
    const markdown = '# Heading 1\n\n### Heading 3';

    const elements = parseLivePreview(markdown);
    const headings = elements.filter(e => e.type === 'heading');

    expect(headings).toHaveLength(2);

    expect(headings[0].headingLevel).toBe(1);
    expect(headings[1].headingLevel).toBe(3);

    expect(markdown.slice(headings[0].start, headings[0].end)).toBe(
      '# Heading 1'
    );

    expect(markdown.slice(headings[1].start, headings[1].end)).toBe(
      '### Heading 3'
    );
  });

  test('should recognize bold, italic and inline code', () => {
    const markdown = 'This is **Bold**, *Italic* and `Code`.';

    const elements = parseLivePreview(markdown);

    const bold = elements.find(e => e.type === 'bold');
    const italic = elements.find(e => e.type === 'italic');
    const code = elements.find(e => e.type === 'inlineCode');

    expect(bold).toBeDefined();
    expect(italic).toBeDefined();
    expect(code).toBeDefined();

    expect(markdown.slice(bold!.start, bold!.end)).toBe('**Bold**');

    expect(markdown.slice(italic!.start, italic!.end)).toBe('*Italic*');

    expect(markdown.slice(code!.start, code!.end)).toBe('`Code`');
  });

  test('should recognize nested bold and italic', () => {
    const markdown = '***Hello***';

    const elements = parseLivePreview(markdown);
    const types = elements.map(e => e.type);

    expect(types).toContain('bold');
    expect(types).toContain('italic');
  });

  test('should not parse formatting inside code', () => {
    const markdown =
      '`**Not Bold**`\n\n' +
      '```md\n' +
      '# Not Heading\n' +
      '*Not Italic*\n' +
      '```';

    const elements = parseLivePreview(markdown);

    expect(elements.map(e => e.type)).toEqual(['inlineCode']);
  });
});

describe('Live Preview Bold Markers', () => {
  test('should identify opening and closing bold markers', () => {
    const markdown = 'Text **Hello** end';

    const elements = parseLivePreview(markdown);
    const markers = getBoldMarkers(markdown, elements);

    expect(markers).toHaveLength(2);

    // Opening **
    expect(markdown.slice(markers[0].start, markers[0].end)).toBe('**');

    // Closing **
    expect(markdown.slice(markers[1].start, markers[1].end)).toBe('**');

    const bold = elements.find(e => e.type === 'bold');

    expect(bold).toBeDefined();

    // Both markers must belong to the same Bold element.
    for (const marker of markers) {
      expect(marker.elementStart).toBe(bold!.start);
      expect(marker.elementEnd).toBe(bold!.end);
    }

    // Verify exact marker positions.
    expect(markers[0].start).toBe(bold!.start);
    expect(markers[0].end).toBe(bold!.start + 2);

    expect(markers[1].start).toBe(bold!.end - 2);
    expect(markers[1].end).toBe(bold!.end);
  });

  test('should ignore incomplete bold syntax', () => {
    const markdown = 'Text **Hello';

    const elements = parseLivePreview(markdown);
    const markers = getBoldMarkers(markdown, elements);

    expect(markers).toHaveLength(0);
  });

  test('should skip nested bold-italic syntax for now', () => {
    const markdown = '***Hello***';

    const elements = parseLivePreview(markdown);
    const markers = getBoldMarkers(markdown, elements);

    expect(markers).toHaveLength(0);
  });
});

describe('Live Preview Italic Markers', () => {
  test('should identify opening and closing italic markers', () => {
    const markdown = 'Text *Hello* end';

    const elements = parseLivePreview(markdown);
    const markers = getItalicMarkers(markdown, elements);

    expect(markers).toHaveLength(2);

    // Opening *
    expect(markdown.slice(markers[0].start, markers[0].end)).toBe('*');

    // Closing *
    expect(markdown.slice(markers[1].start, markers[1].end)).toBe('*');

    const italic = elements.find(e => e.type === 'italic');

    expect(italic).toBeDefined();

    // Both markers belong to the same Italic element.
    for (const marker of markers) {
      expect(marker.elementStart).toBe(italic!.start);
      expect(marker.elementEnd).toBe(italic!.end);
    }

    // Verify exact positions.
    expect(markers[0].start).toBe(italic!.start);
    expect(markers[0].end).toBe(italic!.start + 1);

    expect(markers[1].start).toBe(italic!.end - 1);
    expect(markers[1].end).toBe(italic!.end);
  });

  test('should ignore incomplete italic syntax', () => {
    const markdown = 'Text *Hello';

    const elements = parseLivePreview(markdown);
    const markers = getItalicMarkers(markdown, elements);

    expect(markers).toHaveLength(0);
  });

  test('should skip bold-italic syntax for now', () => {
    const markdown = '***Hello***';

    const elements = parseLivePreview(markdown);
    const markers = getItalicMarkers(markdown, elements);

    expect(markers).toHaveLength(0);
  });

  test('should identify italic nested inside bold', () => {
    const markdown = '**Bold *Nested* text**';

    const elements = parseLivePreview(markdown);
    const markers = getItalicMarkers(markdown, elements);

    // Remark must recognize the nested Italic element.
    const italic = elements.find(e => e.type === 'italic');
    expect(italic).toBeDefined();

    // Expect opening and closing * markers.
    expect(markers).toHaveLength(2);

    expect(markdown.slice(markers[0].start, markers[0].end)).toBe('*');

    expect(markdown.slice(markers[1].start, markers[1].end)).toBe('*');

    // Both markers belong to the same Italic element.
    for (const marker of markers) {
      expect(marker.elementStart).toBe(italic!.start);
      expect(marker.elementEnd).toBe(italic!.end);
    }
  });
});

describe('Live Preview Inline Code Markers', () => {
  test('should identify opening and closing backticks', () => {
    const markdown = 'Text `Hello` end';

    const elements = parseLivePreview(markdown);
    const markers = getInlineCodeMarkers(markdown, elements);

    expect(markers).toHaveLength(2);

    // Opening backtick
    expect(markdown.slice(markers[0].start, markers[0].end)).toBe('`');

    // Closing backtick
    expect(markdown.slice(markers[1].start, markers[1].end)).toBe('`');

    const inlineCode = elements.find(e => e.type === 'inlineCode');

    expect(inlineCode).toBeDefined();

    // Both markers belong to the same Inline Code element.
    for (const marker of markers) {
      expect(marker.elementStart).toBe(inlineCode!.start);
      expect(marker.elementEnd).toBe(inlineCode!.end);
    }

    // Verify exact marker positions.
    expect(markers[0].start).toBe(inlineCode!.start);
    expect(markers[0].end).toBe(inlineCode!.start + 1);

    expect(markers[1].start).toBe(inlineCode!.end - 1);
    expect(markers[1].end).toBe(inlineCode!.end);
  });

  test('should ignore incomplete inline code syntax', () => {
    const markdown = 'Text `Hello';

    const elements = parseLivePreview(markdown);
    const markers = getInlineCodeMarkers(markdown, elements);

    expect(markers).toHaveLength(0);
  });

  test('should skip multiple-backtick syntax for now', () => {
    const markdown = 'Text ``Hello`` end';

    const elements = parseLivePreview(markdown);
    const markers = getInlineCodeMarkers(markdown, elements);

    expect(markers).toHaveLength(0);
  });

  test('should not treat Markdown inside inline code as formatting', () => {
    const markdown = 'Text `**Not Bold**` end';

    const elements = parseLivePreview(markdown);

    const boldElements = elements.filter(e => e.type === 'bold');

    const markers = getInlineCodeMarkers(markdown, elements);

    expect(boldElements).toHaveLength(0);
    expect(markers).toHaveLength(2);

    const inlineCode = elements.find(e => e.type === 'inlineCode');

    expect(inlineCode).toBeDefined();

    expect(markdown.slice(inlineCode!.start, inlineCode!.end)).toBe(
      '`**Not Bold**`'
    );
  });
});

describe('Live Preview Heading Markers', () => {
  test('should identify heading markers from H1 to H6', () => {
    const markdown = [
      '# Heading 1',
      '## Heading 2',
      '### Heading 3',
      '#### Heading 4',
      '##### Heading 5',
      '###### Heading 6',
    ].join('\n\n');

    const elements = parseLivePreview(markdown);
    const headings = elements.filter(e => e.type === 'heading');

    const markers = getHeadingMarkers(markdown, elements);

    expect(headings).toHaveLength(6);
    expect(markers).toHaveLength(6);

    for (let i = 0; i < 6; i++) {
      const level = i + 1;
      const heading = headings[i];
      const marker = markers[i];

      // Verify heading level from AST.
      expect(heading.headingLevel).toBe(level);

      // Verify the opening # characters.
      expect(markdown.slice(marker.start, marker.end)).toBe('#'.repeat(level));

      // Verify exact marker range.
      expect(marker.start).toBe(heading.start);
      expect(marker.end).toBe(heading.start + level);

      // Verify the marker belongs to its heading.
      expect(marker.elementStart).toBe(heading.start);
      expect(marker.elementEnd).toBe(heading.end);
    }
  });

  test('should ignore invalid ATX heading syntax', () => {
    const markdown = ['#Heading without space', '####### Too many hashes'].join(
      '\n\n'
    );

    const elements = parseLivePreview(markdown);
    const markers = getHeadingMarkers(markdown, elements);

    expect(markers).toHaveLength(0);
  });

  test('should not recognize headings inside code blocks', () => {
    const markdown = [
      '```markdown',
      '# Not Heading',
      '## Also Not Heading',
      '```',
    ].join('\n');

    const elements = parseLivePreview(markdown);
    const markers = getHeadingMarkers(markdown, elements);

    expect(markers).toHaveLength(0);
  });

  test('should skip Setext headings for now', () => {
    const markdown = [
      'Heading One',
      '===========',
      '',
      'Heading Two',
      '-----------',
    ].join('\n');

    const elements = parseLivePreview(markdown);
    const headings = elements.filter(e => e.type === 'heading');

    const markers = getHeadingMarkers(markdown, elements);

    // Remark recognizes Setext headings as headings.
    expect(headings).toHaveLength(2);

    // But our marker implementation currently handles
    // only ATX headings beginning with #.
    expect(markers).toHaveLength(0);
  });
});

describe('Live Preview BoldItalic Markers', () => {
  test('should identify opening and closing triple-star markers', () => {
    const markdown = '***Hello World***';

    const elements = parseLivePreview(markdown);
    const markers = getBoldItalicMarkers(markdown, elements);

    expect(markers).toHaveLength(2);

    // Opening ***
    expect(markers[0].start).toBe(0);
    expect(markers[0].end).toBe(3);

    // Closing ***
    expect(markers[1].start).toBe(14);
    expect(markers[1].end).toBe(17);

    for (const marker of markers) {
      expect(markdown.slice(marker.start, marker.end)).toBe('***');

      expect(marker.elementStart).toBe(0);
      expect(marker.elementEnd).toBe(17);
    }
  });

  test('should handle multiple BoldItalic elements independently', () => {
    const markdown = '***First*** and ***Second***';

    const elements = parseLivePreview(markdown);
    const markers = getBoldItalicMarkers(markdown, elements);

    expect(markers).toHaveLength(4);

    for (const marker of markers) {
      expect(markdown.slice(marker.start, marker.end)).toBe('***');
    }

    // Opening and closing markers of First.
    expect(markers[0].elementStart).toBe(markers[1].elementStart);

    expect(markers[0].elementEnd).toBe(markers[1].elementEnd);

    // Opening and closing markers of Second.
    expect(markers[2].elementStart).toBe(markers[3].elementStart);

    expect(markers[2].elementEnd).toBe(markers[3].elementEnd);

    // The two BoldItalic elements are independent.
    expect(markers[0].elementEnd).toBeLessThan(markers[2].elementStart);
  });

  test('should not confuse normal or nested formatting with BoldItalic', () => {
    const samples = ['**Bold**', '*Italic*', '**Bold and *Italic* inside**'];

    for (const markdown of samples) {
      const elements = parseLivePreview(markdown);
      const markers = getBoldItalicMarkers(markdown, elements);

      expect(markers).toHaveLength(0);
    }
  });

  test('should not recognize BoldItalic inside Inline Code', () => {
    const markdown = '`***Not BoldItalic***`';

    const elements = parseLivePreview(markdown);
    const markers = getBoldItalicMarkers(markdown, elements);

    expect(markers).toHaveLength(0);

    expect(elements.filter(e => e.type === 'inlineCode')).toHaveLength(1);
  });

  test('should ignore incomplete BoldItalic syntax', () => {
    const markdown = '***Hello World';

    const elements = parseLivePreview(markdown);
    const markers = getBoldItalicMarkers(markdown, elements);

    expect(markers).toHaveLength(0);
  });
});

test('should identify a basic wikilink', () => {
  const markdown = '[[NodeJS]]';

  const elements = parseLivePreview(markdown);

  expect(elements).toContainEqual({
    type: 'wikilink',
    start: 0,
    end: markdown.length,
  });
});

test('should identify a wikilink with alias', () => {
  const markdown = '[[NodeJS|Node.js]]';

  const elements = parseLivePreview(markdown);

  expect(elements).toContainEqual({
    type: 'wikilink',
    start: 0,
    end: markdown.length,
  });
});

test('should identify basic wikilink markers', () => {
  const markdown = '[[NodeJS]]';
  const elements = parseLivePreview(markdown);
  const markers = getWikilinkMarkers(markdown, elements);

  expect(markers).toHaveLength(2);

  expect(markers.map(m => markdown.slice(m.start, m.end))).toEqual([
    '[[',
    ']]',
  ]);

  expect(
    markers.every(m => m.elementStart === 0 && m.elementEnd === markdown.length)
  ).toBe(true);
});

test('should identify wikilink alias markers', () => {
  const markdown = '[[NodeJS|Node.js]]';
  const elements = parseLivePreview(markdown);
  const markers = getWikilinkMarkers(markdown, elements);

  expect(markers).toHaveLength(2);

  expect(markers.map(m => markdown.slice(m.start, m.end))).toEqual([
    '[[NodeJS|',
    ']]',
  ]);

  // The displayed text should be the alias.
  expect(markdown.slice(markers[0].end, markers[1].start)).toBe('Node.js');
});
