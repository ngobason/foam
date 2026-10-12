import { URI } from '@foam/core';
import { FoamCoreAdapter } from './foam-core-adapter';

export async function testFoamWorkspace(): Promise<void> {
  const adapter = await FoamCoreAdapter.createWithSampleNotes();

  const welcomeUri = URI.file('/notes/Welcome.md');

  const welcome = adapter.getNote(welcomeUri);

  if (!welcome) {
    throw new Error('Welcome.md was not loaded');
  }

  const results = welcome.links.map(link => {
    const target = adapter.resolveLink(welcome, link);

    return {
      link: link.rawText,
      type: link.type,
      target: target.toString(),
      exists: adapter.getNote(target) !== null,
    };
  });

  console.log('[Foam Workspace Integration]');

  console.table(results);

  const updatedWelcome = adapter.updateWelcome(
    ['# Welcome Updated', '', '[[Git]]', '[[MissingNote]]'].join('\n')
  );

  console.log('[Foam Workspace Update Test]', {
    linkCount: updatedWelcome.links.length,
    links: updatedWelcome.links.map(link => ({
      rawText: link.rawText,
      target: adapter.resolveLink(updatedWelcome, link).toString(),
    })),
    workspaceLinkCount: adapter.getNote(welcomeUri)?.links.length,
  });
}
