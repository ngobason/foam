import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EditorView as CodeMirrorView,
  type ViewUpdate,
} from '@codemirror/view';
import type { EditorState, TransactionSpec } from '@codemirror/state';
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
    '.workspace-actions',
    '.note-actions',
    '.developer-actions',
    '.panel-title',
    '.save-status',
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
    dispatch(spec: TransactionSpec) {
      const startState = this.state;
      const transaction = startState.update(spec);
      this.state = transaction.state;
      for (const listener of this.state.facet(CodeMirrorView.updateListener)) {
        listener({
          view: this,
          state: this.state,
          startState,
          transactions: [transaction],
          docChanged: transaction.docChanged,
        } as unknown as ViewUpdate);
      }
    }
    plugin() {
      return this.state.facet(noteUriFacet)?.path.startsWith('/notes/')
        ? {}
        : null;
    }
    focus() {}
  },
}));

import '../src/main';

const editor = () =>
  browser.editor as {
    state: EditorState;
    setState(state: EditorState): void;
    dispatch(spec: TransactionSpec): void;
  };
const button = (name: string) =>
  ['.workspace-actions', '.note-actions', '.developer-actions']
    .flatMap(selector => browser.elements.get(selector)!.children)
    .find(e => e.textContent === name)!;
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

async function openWorkspace(
  dirty = true,
  permission: PermissionState = 'granted'
) {
  await button('Return to Sample').click();
  const files = new Map([
    ['A.md', '[[B|Label]]\n[[Missing]]'],
    ['B.md', '# B'],
  ]);
  const read = vi.fn(async (name: string) => files.get(name)!);
  const write = vi.fn(async (name: string, content: string) => {
    files.set(name, content);
  });
  const requestPermission = vi.fn(async () => permission);
  browser.window.showDirectoryPicker.mockResolvedValue({
    name: 'Test workspace',
    requestPermission,
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
  return {
    files,
    read,
    write,
    state,
    context,
    requestPermission,
    adapter: context.adapter!,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await button('Return to Sample').click();
  vi.useRealTimers();
});

function editText(content: string) {
  editor().dispatch({
    changes: { from: 0, to: editor().state.doc.length, insert: content },
  });
}

function pendingWrite() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe('real Wikilink dialog and safe save wiring', () => {
  it('shows Save only while editing a real file', async () => {
    expect(button('Save Real File').style.display).toBe('none');
    const { context } = await openWorkspace(false);
    expect(button('Save Real File').style.display).toBe('inline-block');

    context.openNote(URI.file('/real-notes/B.md'));
    await vi.waitFor(() =>
      expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/B.md')
    );
    expect(button('Save Real File').style.display).toBe('none');
    expect(button('Edit Real File').style.display).toBe('inline-block');

    await button('Return to Sample').click();
    expect(button('Save Real File').style.display).toBe('none');
  });

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

describe('real-file auto-save integration', () => {
  it.each([{ contents: ['B'] }, { contents: ['B', 'C', 'D'] }])(
    'debounces editor changes $contents and keeps them out of localStorage',
    async ({ contents }) => {
      const { files, write, requestPermission } = await openWorkspace(false);
      vi.useFakeTimers();
      for (const content of contents) {
        editText(content);
        await vi.advanceTimersByTimeAsync(100);
      }
      await vi.advanceTimersByTimeAsync(649);
      expect(write).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(write).toHaveBeenCalledExactlyOnceWith('A.md', contents.at(-1));
      expect(files.get('A.md')).toBe(contents.at(-1));
      expect(requestPermission).toHaveBeenCalledTimes(1);
      expect(browser.elements.get('.save-status')!.textContent).toContain(
        'Saved'
      );
      expect(browser.storage.setItem).not.toHaveBeenCalled();
    }
  );

  it('saves B then C against B, publishing only the content on disk', async () => {
    const { files, write, adapter } = await openWorkspace(false);
    vi.useFakeTimers();
    const gate = pendingWrite();
    write.mockImplementationOnce(async (name, content) => {
      await gate.promise;
      files.set(name, content);
    });
    const graph = FoamGraph.fromWorkspace(adapter.workspace, true);
    editText('B [[B]]');
    await vi.advanceTimersByTimeAsync(750);
    expect(write).toHaveBeenCalledTimes(1);
    expect(browser.elements.get('.save-status')!.textContent).toContain(
      'Saving'
    );
    expect(browser.elements.get('.panel-title')!.textContent).toBe('A.md');
    editText('C [[B]] [[NewDraft]]');
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(files.get('A.md')).toBe('B [[B]]');
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe('B [[B]]');
    expect(graph.getLinks(URI.file('/real-notes/A.md'))).toHaveLength(1);
    expect(editor().state.doc.toString()).toBe('C [[B]] [[NewDraft]]');
    expect(browser.elements.get('.save-status')!.textContent).toContain(
      'Unsaved'
    );
    expect(browser.elements.get('.panel-title')!.textContent).toBe('A.md');
    await vi.advanceTimersByTimeAsync(750);
    expect(write).toHaveBeenCalledTimes(2);
    expect(files.get('A.md')).toBe('C [[B]] [[NewDraft]]');
    expect(graph.getLinks(URI.file('/real-notes/A.md'))).toHaveLength(2);
    graph.dispose();
  });

  it('manual Save shares an in-flight auto-save instead of writing twice', async () => {
    const { files, write, requestPermission } = await openWorkspace(false);
    vi.useFakeTimers();
    const gate = pendingWrite();
    write.mockImplementationOnce(async (name, content) => {
      await gate.promise;
      files.set(name, content);
    });
    editText('B');
    await vi.advanceTimersByTimeAsync(750);
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledExactlyOnceWith('A.md', 'B');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(browser.elements.get('.save-status')!.textContent).toContain(
      'Saved'
    );
  });

  it('preserves the draft after permission denial and retries only from explicit Save', async () => {
    const { files, write, requestPermission } = await openWorkspace(
      false,
      'denied'
    );
    vi.useFakeTimers();
    const original = files.get('A.md');
    editText('Recoverable draft');
    await vi.advanceTimersByTimeAsync(750);
    expect(write).not.toHaveBeenCalled();
    expect(files.get('A.md')).toBe(original);
    expect(editor().state.doc.toString()).toBe('Recoverable draft');
    expect(browser.elements.get('.save-status')!.textContent).toMatch(
      /permission/i
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    requestPermission.mockResolvedValue('granted');
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledExactlyOnceWith('A.md', 'Recoverable draft');
    expect(requestPermission).toHaveBeenCalledTimes(2);
    expect(browser.elements.get('.save-status')!.textContent).toContain(
      'Saved'
    );
  });

  it('does not overwrite an external modification or retry a conflict endlessly', async () => {
    const { files, write, adapter } = await openWorkspace(false);
    vi.useFakeTimers();
    const original = files.get('A.md');
    editText('My draft');
    files.set('A.md', 'External text');
    await vi.advanceTimersByTimeAsync(750);
    expect(write).not.toHaveBeenCalled();
    expect(files.get('A.md')).toBe('External text');
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(original);
    expect(browser.elements.get('.save-status')!.textContent).toContain(
      'Save failed'
    );
    expect(browser.elements.get('.panel-title')!.textContent).toBe('A.md');
    expect(browser.elements.get('.save-status')!.dataset.tone).toBe('error');
    editText('Newer draft');
    await vi.advanceTimersByTimeAsync(5000);
    expect(write).not.toHaveBeenCalled();
    expect(editor().state.doc.toString()).toBe('Newer draft');
    expect(browser.window.alert).toHaveBeenCalledWith(
      expect.stringContaining('modified outside')
    );
  });

  it('shows disk-saved/Core-sync-failed and retries publication without rewriting', async () => {
    const { files, write, adapter, requestPermission } = await openWorkspace(
      false
    );
    vi.useFakeTimers();
    const sync = vi.spyOn(adapter, 'updateNote').mockImplementationOnce(() => {
      throw new Error('Core unavailable');
    });
    editText('Persisted [[B]]');
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('A.md')).toBe('Persisted [[B]]');
    expect(browser.elements.get('.save-status')!.textContent).toMatch(
      /Disk saved.*Core sync failed/
    );
    const source = editor().state;
    await button('Return to Sample').click();
    expect(editor().state).toBe(source);
    await vi.advanceTimersByTimeAsync(5000);
    expect(sync).toHaveBeenCalledTimes(1);
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(
      'Persisted [[B]]'
    );
    expect(browser.elements.get('.save-status')!.textContent).toContain(
      'Saved'
    );
  });

  it.each(['Wikilink', 'Explorer', 'Workspace', 'Sample'])(
    'blocks %s departure during an in-flight save',
    async path => {
      const { files, write, context } = await openWorkspace(false);
      vi.useFakeTimers();
      const gate = pendingWrite();
      write.mockImplementationOnce(async (name, content) => {
        await gate.promise;
        files.set(name, content);
      });
      editText('B [[B]]');
      await vi.advanceTimersByTimeAsync(750);
      const source = editor().state;
      if (path === 'Wikilink') context.openNote(URI.file('/real-notes/B.md'));
      if (path === 'Explorer')
        await browser.elements
          .get('#mvp-file-list')!
          .children.find(e => e.dataset.noteName === 'B.md')!
          .click();
      if (path === 'Workspace') await button('List Markdown Notes').click();
      if (path === 'Sample') await button('Return to Sample').click();
      await vi.advanceTimersByTimeAsync(0);
      expect(editor().state).toBe(source);
      expect(browser.window.alert).toHaveBeenCalledWith(
        expect.stringMatching(/wait/i)
      );
      gate.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(files.get('A.md')).toBe('B [[B]]');
      expect(write).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['Wikilink', 'Explorer', 'Workspace', 'Sample'])(
    '%s departure cancels a pending timer only after explicit discard',
    async path => {
      const { files, write, context } = await openWorkspace(false);
      vi.useFakeTimers();
      const original = files.get('A.md');
      editText('Discarded [[B]]');
      if (path === 'Wikilink' || path === 'Workspace') {
        if (path === 'Wikilink') context.openNote(URI.file('/real-notes/B.md'));
        else void button('List Markdown Notes').click();
        await vi.advanceTimersByTimeAsync(0);
        await waitForDialog();
        await vi.advanceTimersByTimeAsync(1000);
        expect(write).not.toHaveBeenCalled();
        await dialogButton('Discard').click();
        await vi.advanceTimersByTimeAsync(0);
      } else if (path === 'Explorer') {
        await browser.elements
          .get('#mvp-file-list')!
          .children.find(e => e.dataset.noteName === 'B.md')!
          .click();
      } else await button('Return to Sample').click();
      await vi.advanceTimersByTimeAsync(1000);
      expect(editor().state.doc.toString()).not.toBe('Discarded [[B]]');
      expect(files.get('A.md')).toBe(original);
      expect(write).not.toHaveBeenCalled();
      expect(browser.storage.setItem).not.toHaveBeenCalled();
    }
  );

  it('Cancel resumes pending auto-save without replacing the source note', async () => {
    const { files, write, context } = await openWorkspace(false);
    vi.useFakeTimers();
    editText('Keep [[B]]');
    context.openNote(URI.file('/real-notes/B.md'));
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).not.toHaveBeenCalled();
    await dialogButton('Cancel').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('A.md')).toBe('Keep [[B]]');
  });

  it('preserves newer edits made while preparing a replacement workspace', async () => {
    const { read, write } = await openWorkspace(false);
    vi.useFakeTimers();
    const gate = pendingWrite();
    read.mockImplementationOnce(async () => {
      await gate.promise;
      return '[[B]]';
    });
    const switching = button('List Markdown Notes').click();
    await vi.advanceTimersByTimeAsync(0);
    editText('New draft during folder read');
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    // Choosing Cancel must remain possible; background saves cannot consume it.
    await waitForDialog();
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).not.toHaveBeenCalled();
    await dialogButton('Cancel').click();
    await switching;
    expect(editor().state.doc.toString()).toBe('New draft during folder read');
  });

  it('keeps sample editing in localStorage after leaving a real session', async () => {
    const { write } = await openWorkspace(false);
    vi.useFakeTimers();
    editText('Discard me');
    await button('Return to Sample').click();
    const sample = editor().state.doc.toString() + '\nSample edit';
    editText(sample);
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).not.toHaveBeenCalled();
    expect(browser.storage.setItem).toHaveBeenCalledWith(
      'foam-editor-poc-note:file:///notes/Welcome.md',
      sample
    );
  });

  it('cannot run the discarded note timer against a newly edited note', async () => {
    const { files, write, adapter } = await openWorkspace(false);
    vi.useFakeTimers();
    const original = files.get('A.md');
    editText('Old session draft');
    await browser.elements
      .get('#mvp-file-list')!
      .children.find(e => e.dataset.noteName === 'B.md')!
      .click();
    await button('Edit Real File').click();
    editText('New session [[A]]');
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).toHaveBeenCalledExactlyOnceWith('B.md', 'New session [[A]]');
    expect(files.get('A.md')).toBe(original);
    expect(adapter.readNote(URI.file('/real-notes/A.md'))).toBe(original);
    expect(adapter.readNote(URI.file('/real-notes/B.md'))).toBe(
      'New session [[A]]'
    );
    expect(browser.elements.get('.panel-title')!.textContent).toBe('B.md');
    expect(browser.elements.get('.save-status')!.textContent).toBe('Saved');
  });

  it('aborts a stale Wikilink read and resumes saving the newer source draft', async () => {
    const { read, files, context } = await openWorkspace(false);
    vi.useFakeTimers();
    const gate = pendingWrite();
    read.mockImplementationOnce(async () => {
      await gate.promise;
      return '# B';
    });
    editText('First [[B]]');
    context.openNote(URI.file('/real-notes/B.md'));
    await vi.advanceTimersByTimeAsync(0);
    editText('Newer [[B]]');
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(editor().state.facet(noteUriFacet)?.path).toBe('/real-notes/A.md');
    await vi.advanceTimersByTimeAsync(750);
    expect(files.get('A.md')).toBe('Newer [[B]]');
  });

  it('cancels workspace replacement if the editor changes after the discard decision', async () => {
    const { read, write } = await openWorkspace(false);
    vi.useFakeTimers();
    editText('Before discard');
    const switching = button('List Markdown Notes').click();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    const gate = pendingWrite();
    read.mockImplementationOnce(async () => {
      await gate.promise;
      return '[[B]]';
    });
    await dialogButton('Discard').click();
    await vi.advanceTimersByTimeAsync(0);
    editText('New edits after discard');
    gate.resolve();
    await switching;
    expect(editor().state.doc.toString()).toBe('New edits after discard');
    expect(browser.window.alert).toHaveBeenCalledWith(
      expect.stringContaining('Workspace switching was cancelled')
    );
    expect(write).not.toHaveBeenCalled();
  });

  it('does not activate a stale workspace snapshot if a manual save finishes during reload', async () => {
    const { read, files } = await openWorkspace(false);
    vi.useFakeTimers();
    editText('Saved while reloading');
    const source = editor().state;
    const switching = button('List Markdown Notes').click();
    await vi.advanceTimersByTimeAsync(0);
    await waitForDialog();
    const gate = pendingWrite();
    const oldContent = files.get('A.md')!;
    read.mockImplementationOnce(async () => {
      await gate.promise;
      return oldContent;
    });
    await dialogButton('Discard').click();
    await vi.advanceTimersByTimeAsync(0);
    await button('Save Real File').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(files.get('A.md')).toBe('Saved while reloading');
    gate.resolve();
    await switching;
    expect(editor().state).toBe(source);
    expect(browser.window.alert).toHaveBeenCalledWith(
      expect.stringContaining('Workspace switching was cancelled')
    );
  });
});
