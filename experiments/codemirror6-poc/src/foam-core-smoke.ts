import { createMarkdownParser, URI } from '@foam/core';

export function testFoamCoreImport(): void {
  const parser = createMarkdownParser([]);

  const note = parser.parse(
    URI.file('/notes/Welcome.md'),
    [
      '# Welcome',
      '',
      '[[NodeJS]]',
      '[[NodeJS|Node.js]]',
      '[NodeJS](./NodeJS.md)',
    ].join('\n')
  );

  console.log('[Foam Core Integration]', {
    uri: note.uri.toString(),
    linkCount: note.links.length,
    links: note.links.map(link => ({
      type: link.type,
      rawText: link.rawText,
    })),
  });
}
