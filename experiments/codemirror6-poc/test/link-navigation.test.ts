import { afterEach, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { URI } from '@foam/core';
import { FoamCoreAdapter } from '../src/foam-core-adapter';
import { noteUriFacet } from '../src/note-context';
import { realLinkNavigationContext } from '../src/internal-link-navigation';
import { externalLinkNavigation } from '../src/link-navigation';

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['[[B]]', 'ctrlKey'],
  ['[[B|Label]]', 'metaKey'],
])(
  'shows a modifier cursor only over navigable %s and cleans up listeners',
  async (link, modifier) => {
    const text = `${link} plain [[Missing]] [[B#section]]`;
    const adapter = await FoamCoreAdapter.createFromMarkdownFiles([
      { name: 'A.md', content: text },
      { name: 'B.md', content: '# B' },
    ]);
    const browser = new EventTarget();
    const content = new EventTarget();
    vi.stubGlobal('window', browser);
    vi.stubGlobal('Node', EventTarget);
    const style = { cursor: '' };
    const state = EditorState.create({
      doc: text,
      extensions: [
        noteUriFacet.of(URI.file('/real-notes/A.md')),
        realLinkNavigationContext.of({
          adapter,
          canNavigate: vi.fn(() => true),
          openNote: vi.fn(),
        }),
      ],
    });
    const view = {
      state,
      dom: content,
      contentDOM: { style, contains: (target: unknown) => target === content },
      posAtCoords: ({ x }: { x: number }) => x,
    } as unknown as EditorView;
    // Exercise the real plugin without a browser DOM/layout implementation.
    const plugin = externalLinkNavigation as unknown as {
      create(view: EditorView): { destroy(): void };
    };
    const emit = (target: EventTarget, type: string, properties = {}) => {
      target.dispatchEvent(Object.assign(new Event(type), properties));
    };
    const position = link.includes('|')
      ? text.indexOf('Label')
      : text.indexOf('B');
    let interaction = plugin.create(view);
    try {
      emit(content, 'mousemove', { clientX: position, clientY: 0 });
      expect(style.cursor).toBe('');
      emit(browser, 'keydown', { [modifier]: true });
      expect(style.cursor).toBe('pointer');
      emit(browser, 'keyup', { ctrlKey: false, metaKey: false });
      expect(style.cursor).toBe('');

      for (const word of ['plain', 'Missing', 'section']) {
        emit(content, 'mousemove', {
          clientX: text.indexOf(word),
          [modifier]: true,
        });
        expect(style.cursor).toBe('');
      }
      emit(content, 'mousemove', { clientX: position, [modifier]: true });
      expect(style.cursor).toBe('pointer');
      emit(content, 'mouseleave');
      expect(style.cursor).toBe('');
      emit(browser, 'keydown', { [modifier]: true });
      expect(style.cursor).toBe('');

      emit(content, 'mousemove', { clientX: position, [modifier]: true });
      emit(browser, 'blur');
      expect(style.cursor).toBe('');
      emit(browser, 'keydown', { [modifier]: true });
      expect(style.cursor).toBe('');

      emit(content, 'mousemove', { clientX: position, [modifier]: true });
      expect(style.cursor).toBe('pointer');
      interaction.destroy();
      expect(style.cursor).toBe('');
      emit(content, 'mousemove', { clientX: position, [modifier]: true });
      emit(browser, 'keydown', { [modifier]: true });
      expect(style.cursor).toBe('');

      // setState destroys and recreates view plugins when notes/modes change.
      interaction = plugin.create(view);
      emit(browser, 'keydown', { [modifier]: true });
      expect(style.cursor).toBe('');
      emit(content, 'mousemove', { clientX: position, [modifier]: true });
      expect(style.cursor).toBe('pointer');
    } finally {
      interaction.destroy();
      adapter.workspace.dispose();
    }
  }
);
