import { describe, expect, it, vi } from 'vitest';
import { EditorView as CodeMirrorView } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import { FoamGraph, URI } from '@foam/core';
import { realLinkNavigationContext } from '../src/internal-link-navigation';
import { noteUriFacet } from '../src/note-context';

// Exercise main.ts's real dialog, repository, save and navigation wiring.
// Only the browser UI and EditorView rendering are replaced in this Node test.
const browser = vi.hoisted(() => {
  class Element {
    textContent = '';
    innerHTML = '';
    style: Record<string, string> = {};
    dataset: Record<string, string> = {};
    children: Element[] = [];
    disabled = false;
    isConnected = false;
    value = '';
    id = '';
    className = '';
    attributes = new Map<string, string>();
    listeners = new Map<string, ((event: unknown) => unknown)[]>();
    classList = { toggle: vi.fn() };
    append(...nodes: Element[]) {
      this.children.push(...nodes);
    }
    appendChild(node: Element) {
      this.append(node);
      node.isConnected = true;
    }
    replaceChildren(...nodes: Element[]) {
      this.children = nodes;
    }
    addEventListener(type: string, listener: (event: unknown) => unknown) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    async click() {
      if (!this.disabled) {
        await Promise.all(
          (this.listeners.get('click') ?? []).map(fn => fn({}))
        );
      }
    }
    setAttribute(key: string, value: string) {
      this.attributes.set(key, value);
    }
    removeAttribute(key: string) {
      this.attributes.delete(key);
    }
    showModal() {
      this.isConnected = true;
    }
    close() {
      this.isConnected = false;
    }
    remove() {
      this.isConnected = false;
    }
  }
  const elements = new Map<string, Element>();
  for (const selector of [
    '#app',
    '#editor',
    '.topbar',
    '.panel-title',
    '#mvp-file-list',
  ]) {
    elements.set(selector, new Element());
  }
  const dialogs: Element[] = [];
  const body = new Element();
  const document = {
    body,
    documentElement: new Element(),
    querySelector: (selector: string) => elements.get(selector) ?? null,
    querySelectorAll: () =>
      elements
        .get('#mvp-file-list')!
        .children.filter(e => e.className === 'explorer-file'),
    createElement: (tag: string) => {
      const element = new Element();
      if (tag === 'dialog') dialogs.push(element);
      return element;
    },
  };
  const window = {
    location: { origin: 'http://localhost' },
    alert: vi.fn(),
    confirm: vi.fn(() => true),
    addEventListener: vi.fn(),
    showDirectoryPicker: vi.fn(),
  };
  const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  vi.stubGlobal('localStorage', storage);
  return { elements, dialogs, window, storage, editor: null as unknown };
});

vi.mock('codemirror', () => ({
  basicSetup: [],
  EditorView: class {
    static lineWrapping = CodeMirrorView.lineWrapping;
    static updateListener = CodeMirrorView.updateListener;
    static editable = CodeMirrorView.editable;
    static theme = CodeMirrorView.theme;
    state: EditorState;
    constructor(options: { state: EditorState }) {
      this.state = options.state;
      browser.editor = this;
    }
    setState(state: EditorState) {
      this.state = state;
    }
    focus() {}
  },
}));

import '../src/main';

const editor = () =>
  browser.editor as { state: EditorState; setState(state: EditorState): void };
const button = (name: string) =>
  browser.elements.get('.topbar')!.children.find(e => e.textContent === name)!;
const dialogButton = (name: string) =>
  browser.dialogs
    .at(-1)!
    .children.at(-1)!
    .children.find(e => e.textContent === name)!;
const waitForDialog = async () => {
  await vi.waitFor(() =>
    expect(browser.dialogs.at(-1)?.children[0]?.textContent).toBe(
      'Unsaved Changes'
    )
  );
};

async function openWorkspace(dirty = true) {
  await button('Return to Sample').click();
  const files = new Map([
    ['A.md', '[[B|Label]]\n[[Missing]]'],
    ['B.md', '# B'],
  ]);
  const read = vi.fn(async (name: string) => files.get(name)!);
  const write = vi.fn(async (name: string, content: string) => {
    files.set(name, content);
  });
  browser.window.showDirectoryPicker.mockResolvedValue({
    name: 'Test workspace',
    requestPermission: async () => 'granted',
    async *entries() {
      for (const name of files.keys())
        yield [name, await this.getFileHandle(name)];
    },
    async getFileHandle(name: string) {
      if (!files.has(name)) throw new Error('File not found');
      return {
        kind: 'file',
        getFile: async () => ({ text: () => read(name) }),
        createWritable: async () => ({
          write: (content: string) => write(name, content),
          close: async () => {},
          abort: async () => {},
        }),
      };
    },
  });
  await button('List Markdown Notes').click();
  await browser.elements
    .get('#mvp-file-list')!
    .children.find(e => e.dataset.noteName === 'A.md')!
    .click();
  await button('Edit Real File').click();
  if (dirty)
    editor().setState(
      editor().state.update({
        changes: { from: 0, insert: 'Unsaved [[MissingUnsaved]]\n' },
        selection: { anchor: 2 },
      }).state
    );
  browser.storage.getItem.mockClear();
  browser.storage.setItem.mockClear();
  browser.window.alert.mockClear();
  const state = editor().state;
  const context = state.facet(realLinkNavigationContext)!;
  return { files, read, write, state, context, adapter: context.adapter! };
}

describe('real Wikilink dialog and safe save wiring', () => {
  it.each(['Save', 'Discard', 'Cancel'])(
    '%s preserves the intended disk and Core state',
    async decision => {
      const { files, write, state, context, adapter } = await openWorkspace();
      const original = files.get('A.md');
      const graph = FoamGraph.fromWorkspace(adapter.workspace, true);
      const originalLinks = graph.getLinks(URI.file('/real-notes/A.md')).length;
      context.openNote(URI.file('/real-notes/B.md'));
      await waitForDialog();
      expect(context.canNavigate()).toBe(false);
      // Repeated operations cannot replace this pending navigation.
      context.openNote(URI.file('/real-notes/A.md'));
      await button('Return to Sample').click();
      await button('List Markdown Notes').click();
      expect(editor().state).toBe(state);
      await dialogButton(decision).click();
      await vi.waitFor(() => expect(context.canNavigate()).toBe(true));
      if (decision === 'Cancel') {
        expect(editor().state).toBe(state);
      } else {
        expect(editor().state.facet(noteUriFacet)?.path).toBe(
          '/real-notes/B.md'
        );
        expect(editor().state.readOnly).toBe(true);
        expect(
          browser.elements
            .get('#mvp-file-list')!
            .children.find(e => e.dataset.noteName === 'B.md')!
            .attributes.get('aria-current')
        ).toBe('page');
      }
      expect(files.get('A.md')).toBe(
        decision === 'Save' ? state.doc.toString() : original
      );
      expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
        files.get('A.md')
      );
      expect(write).toHaveBeenCalledTimes(decision === 'Save' ? 1 : 0);
      expect(graph.getLinks(URI.file('/real-notes/A.md'))).toHaveLength(
        originalLinks + (decision === 'Save' ? 1 : 0)
      );
      graph.dispose();
      expect(browser.storage.getItem).not.toHaveBeenCalled();
      expect(browser.storage.setItem).not.toHaveBeenCalled();
    }
  );

  it.each(['conflict', 'I/O'])(
    'keeps the dialog and editor after Save %s failure',
    async failure => {
      const { files, write, state, context, adapter } = await openWorkspace();
      const original = files.get('A.md');
      if (failure === 'conflict') files.set('A.md', 'External changes');
      else write.mockRejectedValueOnce(new Error('Disk write failed'));
      context.openNote(URI.file('/real-notes/B.md'));
      await waitForDialog();
      await dialogButton('Save').click();
      expect(editor().state).toBe(state);
      expect(browser.dialogs.at(-1)!.isConnected).toBe(true);
      expect(dialogButton('Save').disabled).toBe(false);
      expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(original);
      expect(files.get('A.md')).toBe(
        failure === 'conflict' ? 'External changes' : original
      );
      expect(browser.window.alert).toHaveBeenCalledWith(
        expect.stringContaining(
          failure === 'conflict' ? 'modified outside' : 'Disk write failed'
        )
      );
      await dialogButton('Cancel').click();
      await vi.waitFor(() => expect(context.canNavigate()).toBe(true));
      expect(editor().state).toBe(state);
    }
  );

  it('navigates clean notes without a prompt', async () => {
    const { context } = await openWorkspace(false);
    const dialogCount = browser.dialogs.length;
    context.openNote(URI.file('/real-notes/B.md'));
    await vi.waitFor(() =>
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md')
    );
    expect(browser.dialogs).toHaveLength(dialogCount);
  });

  it('does not prompt or discard when the target has disappeared from disk', async () => {
    const { context, files, state, write } = await openWorkspace();
    files.delete('B.md');
    const dialogCount = browser.dialogs.length;
    context.openNote(URI.file('/real-notes/B.md'));
    await vi.waitFor(() =>
      expect(browser.window.alert).toHaveBeenCalledWith('File not found')
    );
    expect(browser.dialogs).toHaveLength(dialogCount);
    expect(editor().state).toBe(state);
    expect(write).not.toHaveBeenCalled();
  });

  it('ignores repeated clicks during Save and waits for disk completion', async () => {
    const { context, write, state } = await openWorkspace();
    let finishWrite!: () => void;
    write.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finishWrite = resolve;
        })
    );
    context.openNote(URI.file('/real-notes/B.md'));
    await waitForDialog();
    const saving = dialogButton('Save').click();
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    context.openNote(URI.file('/real-notes/B.md'));
    await browser.elements
      .get('#mvp-file-list')!
      .children.find(e => e.dataset.noteName === 'A.md')!
      .click();
    expect(editor().state).toBe(state);
    expect(dialogButton('Saving...').disabled).toBe(true);
    finishWrite();
    await saving;
    await vi.waitFor(() =>
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md')
    );
    expect(write).toHaveBeenCalledOnce();
  });

  it('preserves newer edits made during a pending target read', async () => {
    const { context, read, write, state } = await openWorkspace();
    let finishRead!: (content: string) => void;
    read.mockImplementationOnce(
      () =>
        new Promise<string>(resolve => {
          finishRead = resolve;
        })
    );
    context.openNote(URI.file('/real-notes/B.md'));
    await vi.waitFor(() => expect(finishRead).toBeTypeOf('function'));
    const newerState = state.update({
      changes: { from: 0, insert: 'More edits\n' },
    }).state;
    editor().setState(newerState);
    finishRead('# B');
    await vi.waitFor(() => expect(context.canNavigate()).toBe(true));
    expect(editor().state).toBe(newerState);
    expect(write).not.toHaveBeenCalled();
  });
});
