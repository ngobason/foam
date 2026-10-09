import { parseLivePreview, getBoldMarkers } from './parser';

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
