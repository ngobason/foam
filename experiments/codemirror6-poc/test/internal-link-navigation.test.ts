import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { URI } from '@foam/core';
import { FoamCoreAdapter } from '../src/foam-core-adapter';
import { noteUriFacet } from '../src/note-context';
import {
  handleInternalLinkClick,
  isNavigableInternalLinkAt,
  realLinkNavigationContext,
} from '../src/internal-link-navigation';

afterEach(() => vi.unstubAllGlobals());

describe('real workspace Wikilinks', () => {
  it.each([
    ['[[B]]', 'ctrlKey'],
    ['[[B|Label]]', 'metaKey'],
  ])('opens %s through the real context with %s', async (text, modifier) => {
    const adapter = await FoamCoreAdapter.createFromMarkdownFiles([
      { name: 'A.md', content: text },
      { name: 'B.md', content: '# Real B' },
    ]);
    try {
      const openNote = vi.fn();
      class TestNode {}
      const target = new TestNode();
      vi.stubGlobal('Node', TestNode);
      const storage = { getItem: vi.fn(), setItem: vi.fn() };
      vi.stubGlobal('localStorage', storage);
      const state = EditorState.create({
        doc: text,
        extensions: [
          noteUriFacet.of(URI.file('/real-notes/A.md')),
          realLinkNavigationContext.of({
            adapter,
            canNavigate: () => true,
            openNote,
          }),
        ],
      });
      const view = {
        state,
        contentDOM: { contains: (node: unknown) => node === target },
        posAtCoords: () => text.indexOf(text.includes('|') ? 'Label' : 'B'),
        plugin: () => {
          throw new Error('Sample navigation was accessed');
        },
      } as unknown as EditorView;
      const event = {
        button: 0,
        [modifier]: true,
        target,
        clientX: 0,
        clientY: 0,
        preventDefault: vi.fn(),
      } as unknown as MouseEvent;
      expect(handleInternalLinkClick(event, view)).toBe(true);
      expect(openNote).toHaveBeenCalledExactlyOnceWith(
        URI.file('/real-notes/B.md')
      );
      expect(storage.getItem).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();

      openNote.mockClear();
      expect(
        handleInternalLinkClick(
          { ...event, ctrlKey: false, metaKey: false } as MouseEvent,
          view
        )
      ).toBe(false);
      expect(openNote).not.toHaveBeenCalled();

      openNote.mockClear();
      const blockedState = EditorState.create({
        doc: text,
        extensions: [
          noteUriFacet.of(URI.file('/real-notes/A.md')),
          realLinkNavigationContext.of({
            adapter,
            canNavigate: () => false,
            openNote,
          }),
        ],
      });
      expect(
        handleInternalLinkClick(event, {
          ...view,
          state: blockedState,
        } as EditorView)
      ).toBe(true);
      expect(openNote).not.toHaveBeenCalled();

      const unavailableState = EditorState.create({
        doc: text,
        extensions: [
          noteUriFacet.of(URI.file('/real-notes/A.md')),
          realLinkNavigationContext.of({
            adapter: null,
            canNavigate: () => true,
            openNote,
          }),
        ],
      });
      expect(
        handleInternalLinkClick(event, {
          ...view,
          state: unavailableState,
        } as EditorView)
      ).toBe(false);
      expect(openNote).not.toHaveBeenCalled();
      expect(
        isNavigableInternalLinkAt(
          { ...view, state: unavailableState } as EditorView,
          3
        )
      ).toBe(false);
    } finally {
      adapter.workspace.dispose();
    }
  });

  it.each(['[[Missing]]', '[[B#heading]]', '[B](./B.md)'])(
    'does not open unsupported target %s',
    async text => {
      const adapter = await FoamCoreAdapter.createFromMarkdownFiles([
        { name: 'A.md', content: text },
        { name: 'B.md', content: '# B' },
      ]);
      try {
        class TestNode {}
        const target = new TestNode();
        vi.stubGlobal('Node', TestNode);
        const openNote = vi.fn();
        const state = EditorState.create({
          doc: text,
          extensions: [
            noteUriFacet.of(URI.file('/real-notes/A.md')),
            realLinkNavigationContext.of({
              adapter,
              canNavigate: () => true,
              openNote,
            }),
          ],
        });
        handleInternalLinkClick(
          {
            button: 0,
            ctrlKey: true,
            target,
            preventDefault: vi.fn(),
          } as unknown as MouseEvent,
          {
            state,
            contentDOM: { contains: () => true },
            posAtCoords: () => 3,
          } as unknown as EditorView
        );
        expect(openNote).not.toHaveBeenCalled();
        expect(state.doc.toString()).toBe(text);
        expect(adapter.readNote(URI.file('/real-notes/Missing.md'))).toBeNull();
      } finally {
        adapter.workspace.dispose();
      }
    }
  );
});
